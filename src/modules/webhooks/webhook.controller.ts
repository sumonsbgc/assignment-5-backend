import { Request, Response, NextFunction } from "express";
import { stripe } from "@lib/stripe.js";
import { prisma } from "@lib/database.js";
import { env } from "@lib/env.js";
import { logger } from "@utils/logger.js";
import type Stripe from "stripe";

// Map Stripe's lowercase subscription status to our normalized uppercase form.
// Why explicit: Stripe ships values we'd otherwise miss (incomplete_expired,
// past_due, unpaid, paused) and silently truncating to .toUpperCase() lets
// typos slip through.
const STATUS_MAP: Record<string, string> = {
  active: "ACTIVE",
  trialing: "TRIALING",
  incomplete: "INCOMPLETE",
  incomplete_expired: "INCOMPLETE_EXPIRED",
  past_due: "PAST_DUE",
  unpaid: "UNPAID",
  canceled: "CANCELED",
  paused: "PAUSED",
};
const mapStatus = (s: string) => STATUS_MAP[s] ?? s.toUpperCase();

// Period fields can live on the subscription or its first item depending on
// API version. Read both, prefer the item-level value when present.
function periodDates(sub: Stripe.Subscription) {
  const item = sub.items?.data?.[0] as { current_period_start?: number; current_period_end?: number } | undefined;
  const start = item?.current_period_start ?? (sub as unknown as { current_period_start?: number }).current_period_start;
  const end = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  return {
    currentPeriodStart: start ? new Date(start * 1000) : new Date(),
    currentPeriodEnd: end ? new Date(end * 1000) : new Date(),
  };
}

export class WebhookController {
  handleStripe = async (req: Request, res: Response, next: NextFunction) => {
    const sig = req.headers["stripe-signature"] as string | undefined;
    if (!sig) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      logger.warn({ err }, "Stripe webhook signature verification failed");
      res.status(400).json({ error: "Invalid webhook signature" });
      return;
    }

    // Idempotency: if we've already processed this event.id, ack and bail.
    // Stripe's at-least-once delivery means duplicates are normal.
    try {
      await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
    } catch {
      logger.info({ eventId: event.id, type: event.type }, "Stripe webhook duplicate, skipping");
      res.json({ received: true, duplicate: true });
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed":
          await this.onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
          break;

        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
          await this.onSubscriptionChanged(event.data.object as Stripe.Subscription);
          break;

        case "customer.subscription.trial_will_end":
          await this.onTrialWillEnd(event.data.object as Stripe.Subscription);
          break;

        case "invoice.payment_succeeded":
          await this.onInvoicePaid(event.data.object as Stripe.Invoice);
          break;

        case "invoice.payment_failed":
          await this.onInvoiceFailed(event.data.object as Stripe.Invoice);
          break;

        case "charge.refunded":
          await this.onChargeRefunded(event.data.object as Stripe.Charge);
          break;

        case "payment_intent.succeeded":
          await this.onPaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
          break;

        case "payment_intent.payment_failed":
          await this.onPaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
          break;

        default:
          logger.debug({ type: event.type }, "Unhandled Stripe event");
      }

      res.json({ received: true });
    } catch (err) {
      // On failure, delete the idempotency row so Stripe's retry can re-process.
      await prisma.stripeEvent.delete({ where: { id: event.id } }).catch(() => {});
      next(err);
    }
  };

  private onCheckoutCompleted = async (session: Stripe.Checkout.Session) => {
    const userId = parseInt(session.metadata?.userId ?? "0", 10);
    if (!userId) {
      logger.warn({ sessionId: session.id }, "checkout.session.completed missing userId metadata");
      return;
    }

    if (session.mode === "subscription" && session.subscription) {
      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      await this.upsertSubscription(userId, sub, session.metadata?.plan ?? "MONTHLY", session.customer as string);
      return;
    }

    if (session.mode === "payment") {
      const movieId = session.metadata?.movieId ? parseInt(session.metadata.movieId, 10) : null;
      const seriesId = session.metadata?.seriesId ? parseInt(session.metadata.seriesId, 10) : null;
      const paymentIntentId = session.payment_intent as string | null;
      if (!paymentIntentId) return;

      await prisma.purchase.upsert({
        where: { stripePaymentId: paymentIntentId },
        update: { status: "COMPLETED" },
        create: {
          userId,
          movieId,
          seriesId,
          amount: session.amount_total ?? 0,
          currency: session.currency ?? "usd",
          stripePaymentId: paymentIntentId,
          status: "COMPLETED",
        },
      });
    }
  };

  private onSubscriptionChanged = async (sub: Stripe.Subscription) => {
    const existing = await prisma.subscription.findUnique({ where: { stripeSubId: sub.id } });
    if (!existing) {
      // Subscription created via .created event before checkout.completed —
      // we need a userId, which lives in subscription metadata if set, else skip.
      const userId = parseInt(sub.metadata?.userId ?? "0", 10);
      if (!userId) return;
      await this.upsertSubscription(userId, sub, sub.metadata?.plan ?? "MONTHLY", sub.customer as string);
      return;
    }
    const periods = periodDates(sub);
    await prisma.subscription.update({
      where: { stripeSubId: sub.id },
      data: {
        status: mapStatus(sub.status),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        ...periods,
      },
    });
  };

  private upsertSubscription = async (
    userId: number,
    sub: Stripe.Subscription,
    plan: string,
    customerId: string,
  ) => {
    const periods = periodDates(sub);
    await prisma.subscription.upsert({
      where: { stripeSubId: sub.id },
      update: {
        status: mapStatus(sub.status),
        plan,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        ...periods,
      },
      create: {
        userId,
        stripeSubId: sub.id,
        stripeCustomerId: customerId,
        status: mapStatus(sub.status),
        plan,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        ...periods,
      },
    });
  };

  private onTrialWillEnd = async (sub: Stripe.Subscription) => {
    logger.info({ subId: sub.id, customer: sub.customer }, "Trial ending in 3 days");
    // Hook for an email job. Left as a log until an email transport is wired.
  };

  private onInvoicePaid = async (invoice: Stripe.Invoice) => {
    const subId = (invoice as unknown as { subscription?: string }).subscription;
    if (!subId) return;
    const sub = await stripe.subscriptions.retrieve(subId);
    await this.onSubscriptionChanged(sub);
  };

  private onInvoiceFailed = async (invoice: Stripe.Invoice) => {
    const subId = (invoice as unknown as { subscription?: string }).subscription;
    if (!subId) return;
    await prisma.subscription.updateMany({
      where: { stripeSubId: subId },
      data: { status: "PAST_DUE" },
    });
    logger.warn({ subId, invoiceId: invoice.id }, "Invoice payment failed");
  };

  private onChargeRefunded = async (charge: Stripe.Charge) => {
    const paymentIntentId = charge.payment_intent as string | null;
    if (!paymentIntentId) return;
    const refundAmount = charge.amount_refunded;
    const fullyRefunded = charge.amount_refunded >= charge.amount;
    await prisma.purchase.updateMany({
      where: { stripePaymentId: paymentIntentId },
      data: {
        status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
        refundedAt: new Date(),
        refundAmount,
      },
    });
  };

  private onPaymentIntentFailed = async (pi: Stripe.PaymentIntent) => {
    await prisma.purchase.updateMany({
      where: { stripePaymentId: pi.id },
      data: { status: "FAILED" },
    });
  };

  /**
   * Fires when a custom-checkout (Elements + PaymentElement) one-time
   * payment succeeds. The hosted Checkout flow goes through
   * `checkout.session.completed` instead; this handler covers the
   * direct PaymentIntent path used by the in-app /checkout page.
   */
  private onPaymentIntentSucceeded = async (pi: Stripe.PaymentIntent) => {
    // Skip if this PaymentIntent belongs to a subscription invoice — those
    // are recorded via the subscription/invoice handlers, not as a Purchase.
    if ((pi as Stripe.PaymentIntent & { invoice?: string | null }).invoice) return;

    const userId = parseInt(pi.metadata?.userId ?? "0", 10);
    if (!userId) {
      logger.warn({ paymentIntentId: pi.id }, "payment_intent.succeeded missing userId metadata");
      return;
    }
    const movieId = pi.metadata?.movieId ? parseInt(pi.metadata.movieId, 10) : null;
    const seriesId = pi.metadata?.seriesId ? parseInt(pi.metadata.seriesId, 10) : null;

    await prisma.purchase.upsert({
      where: { stripePaymentId: pi.id },
      update: { status: "COMPLETED" },
      create: {
        userId,
        movieId,
        seriesId,
        amount: pi.amount,
        currency: pi.currency,
        stripePaymentId: pi.id,
        status: "COMPLETED",
      },
    });
  };
}
