import { Request, Response, NextFunction } from "express";
import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { stripe } from "@lib/stripe.js";
import { prisma } from "@lib/database.js";
import { env } from "@lib/env.js";
import { AppError } from "@utils/app-error.js";

// Stripe idempotency keys are at most 255 chars and must be stable per
// logical request. We hash a {userId, intent, dayBucket} tuple so a user
// double-clicking "Subscribe" inside the same day reuses the same Stripe session
// instead of creating a parallel one.
function idempotencyKey(parts: Array<string | number>) {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

const dayBucket = () => Math.floor(Date.now() / (1000 * 60 * 60 * 24));

export class CheckoutController {
  /**
   * Returns a PaymentIntent client_secret for a checkout request, so the
   * frontend can render Stripe Elements (PaymentElement) styled to match
   * the host app. Two flows behind one endpoint:
   *
   *   - kind=subscription → create Customer + Subscription with
   *     `payment_behavior: 'default_incomplete'`, return the
   *     latest_invoice.payment_intent.client_secret. The subsequent
   *     webhook (`invoice.payment_succeeded` + `customer.subscription.updated`)
   *     activates the row.
   *   - kind=purchase → create PaymentIntent with userId/movieId/seriesId
   *     metadata; webhook `payment_intent.succeeded` creates the Purchase.
   */
  createIntent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as
        | { kind: "subscription"; plan?: "MONTHLY" | "ANNUAL" }
        | { kind: "purchase"; movieId?: number; seriesId?: number };

      const userId = req.user!.userId;
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError("NOT_FOUND", "User not found", 404);

      if (body.kind === "subscription") {
        const plan = body.plan ?? "MONTHLY";
        if (plan !== "MONTHLY" && plan !== "ANNUAL") {
          throw new AppError("BAD_REQUEST", "Plan must be MONTHLY or ANNUAL", 400);
        }

        const existing = await prisma.subscription.findFirst({
          where: { userId, status: { in: ["ACTIVE", "TRIALING"] } },
        });
        if (existing) throw new AppError("CONFLICT", "You already have an active subscription", 409);

        const priceId = plan === "ANNUAL" ? env.STRIPE_ANNUAL_PRICE_ID : env.STRIPE_MONTHLY_PRICE_ID;
        if (!priceId) throw new AppError("BAD_REQUEST", "Subscription plan not configured", 400);

        // Reuse the Stripe Customer if we've billed this user before. Earlier
        // rows may have placeholder IDs from manual seeding (e.g. "manual_cust_5"),
        // so verify by retrieving — fall back to creating a fresh customer
        // when the stored ID is malformed or no longer exists.
        const previousSub = await prisma.subscription.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
        });
        let customer: { id: string } | null = null;
        if (previousSub?.stripeCustomerId?.startsWith("cus_")) {
          try {
            const existingCustomer = await stripe.customers.retrieve(previousSub.stripeCustomerId);
            if (!("deleted" in existingCustomer) || !existingCustomer.deleted) {
              customer = { id: existingCustomer.id };
            }
          } catch {
            // Customer doesn't exist on Stripe — fall through to create one.
          }
        }
        if (!customer) {
          customer = await stripe.customers.create({
            email: user.email,
            metadata: { userId: String(userId) },
          });
        }

        const subscription = await stripe.subscriptions.create({
          customer: customer.id,
          items: [{ price: priceId }],
          payment_behavior: "default_incomplete",
          payment_settings: {
            save_default_payment_method: "on_subscription",
            payment_method_types: ["card"],
          },
          expand: ["latest_invoice.payment_intent"],
          metadata: { userId: String(userId), plan },
        });

        const invoice = subscription.latest_invoice as Stripe.Invoice | null;
        const pi = (invoice as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | null })
          ?.payment_intent;
        if (!pi || typeof pi === "string" || !pi.client_secret) {
          throw new AppError("INTERNAL", "Stripe did not return a PaymentIntent", 500);
        }

        res.json({
          clientSecret: pi.client_secret,
          amount: pi.amount,
          currency: pi.currency,
          mode: "subscription",
          plan,
          productName: `${plan === "ANNUAL" ? "Annual" : "Monthly"} subscription`,
        });
        return;
      }

      // ---- purchase ----
      const { movieId, seriesId } = body;
      if (!movieId && !seriesId) throw new AppError("BAD_REQUEST", "movieId or seriesId required", 400);
      if (movieId && seriesId) throw new AppError("BAD_REQUEST", "Provide either movieId or seriesId, not both", 400);

      const activeSub = await prisma.subscription.findFirst({
        where: { userId, status: { in: ["ACTIVE", "TRIALING"] } },
      });
      if (activeSub) throw new AppError("CONFLICT", "Your active subscription already grants access", 409);

      const owned = await prisma.purchase.findFirst({
        where: {
          userId,
          status: "COMPLETED",
          ...(movieId ? { movieId } : {}),
          ...(seriesId ? { seriesId } : {}),
        },
      });
      if (owned) throw new AppError("CONFLICT", "You already own this content", 409);

      let title = "";
      let priceInCents = 0;
      if (movieId) {
        const movie = await prisma.movie.findUnique({ where: { id: movieId } });
        if (!movie) throw new AppError("NOT_FOUND", "Movie not found", 404);
        title = movie.title;
        priceInCents = Math.round(movie.price * 100);
      } else if (seriesId) {
        const series = await prisma.series.findUnique({ where: { id: seriesId } });
        if (!series) throw new AppError("NOT_FOUND", "Series not found", 404);
        title = series.title;
        priceInCents = Math.round(series.price * 100);
      }
      if (priceInCents <= 0) throw new AppError("BAD_REQUEST", "Content is free, no purchase required", 400);

      const pi = await stripe.paymentIntents.create(
        {
          amount: priceInCents,
          currency: "usd",
          description: title,
          receipt_email: user.email,
          metadata: {
            userId: String(userId),
            movieId: movieId ? String(movieId) : "",
            seriesId: seriesId ? String(seriesId) : "",
            title,
          },
          automatic_payment_methods: { enabled: true },
        },
        { idempotencyKey: idempotencyKey([userId, "intent", movieId ?? "", seriesId ?? "", priceInCents, dayBucket()]) },
      );

      res.json({
        clientSecret: pi.client_secret,
        amount: pi.amount,
        currency: pi.currency,
        mode: "payment",
        productName: title,
      });
    } catch (err) { next(err); }
  };

  /**
   * Webhook-independent state sync. Called by the frontend after Stripe
   * redirects to `/purchases?success=1&payment_intent=…&redirect_status=…`.
   * Fetches the PaymentIntent live from Stripe and upserts the matching
   * Subscription / Purchase row. Crucial for demo environments where the
   * Stripe CLI listener isn't running — otherwise the payment goes through
   * on Stripe but the DB never hears about it.
   */
  syncFromStripe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { paymentIntentId } = req.body as { paymentIntentId?: string };
      if (!paymentIntentId) {
        throw new AppError("BAD_REQUEST", "paymentIntentId required", 400);
      }
      const userId = req.user!.userId;

      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (pi.status !== "succeeded") {
        res.json({ synced: false, status: pi.status });
        return;
      }

      // Verify the PI belongs to this user (defense in depth — the
      // metadata.userId for direct PIs, or the subscription's customer
      // ↔ user mapping for invoice-attached PIs).
      const piWithInvoice = pi as Stripe.PaymentIntent & { invoice?: string | null };

      if (piWithInvoice.invoice) {
        // Subscription path: look up the invoice → subscription → upsert row.
        const invoice = await stripe.invoices.retrieve(piWithInvoice.invoice as string);
        const subId = (invoice as Stripe.Invoice & { subscription?: string | null })
          .subscription as string | undefined;
        if (!subId) {
          res.json({ synced: false, reason: "no_subscription_on_invoice" });
          return;
        }
        const sub = await stripe.subscriptions.retrieve(subId);
        const metaUserId = parseInt(sub.metadata?.userId ?? "0", 10);
        if (metaUserId && metaUserId !== userId) {
          throw new AppError("FORBIDDEN", "Subscription does not belong to current user", 403);
        }
        const plan = sub.metadata?.plan ?? "MONTHLY";
        const item = sub.items?.data?.[0] as { current_period_start?: number; current_period_end?: number } | undefined;
        const start = item?.current_period_start ?? (sub as unknown as { current_period_start?: number }).current_period_start;
        const end = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
        const status = sub.status === "active" || sub.status === "trialing"
          ? sub.status.toUpperCase()
          : sub.status.toUpperCase();

        await prisma.subscription.upsert({
          where: { stripeSubId: sub.id },
          update: {
            status,
            plan,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            currentPeriodStart: start ? new Date(start * 1000) : new Date(),
            currentPeriodEnd: end ? new Date(end * 1000) : new Date(),
          },
          create: {
            userId,
            stripeSubId: sub.id,
            stripeCustomerId: sub.customer as string,
            status,
            plan,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            currentPeriodStart: start ? new Date(start * 1000) : new Date(),
            currentPeriodEnd: end ? new Date(end * 1000) : new Date(),
          },
        });
        res.json({ synced: true, kind: "subscription", status });
        return;
      }

      // Direct purchase path: upsert Purchase row from PI metadata.
      const metaUserId = parseInt(pi.metadata?.userId ?? "0", 10);
      if (metaUserId && metaUserId !== userId) {
        throw new AppError("FORBIDDEN", "PaymentIntent does not belong to current user", 403);
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
      res.json({ synced: true, kind: "purchase" });
    } catch (err) { next(err); }
  };

  createSubscription = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { plan = "MONTHLY", embedded = false } = req.body as {
        plan?: "MONTHLY" | "ANNUAL";
        embedded?: boolean;
      };
      if (plan !== "MONTHLY" && plan !== "ANNUAL") {
        throw new AppError("BAD_REQUEST", "Plan must be MONTHLY or ANNUAL", 400);
      }

      const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
      if (!user) throw new AppError("NOT_FOUND", "User not found", 404);

      const existing = await prisma.subscription.findFirst({
        where: { userId: user.id, status: { in: ["ACTIVE", "TRIALING"] } },
      });
      if (existing) {
        throw new AppError("CONFLICT", "You already have an active subscription", 409);
      }

      const priceId = plan === "ANNUAL"
        ? env.STRIPE_ANNUAL_PRICE_ID
        : env.STRIPE_MONTHLY_PRICE_ID;
      if (!priceId) throw new AppError("BAD_REQUEST", "Subscription plan not configured", 400);

      // Embedded mode renders Checkout inside our own page (no redirect to
      // checkout.stripe.com). The frontend mounts <EmbeddedCheckout> using
      // the returned clientSecret. After payment, Stripe redirects the
      // iframe to return_url with ?session_id={CHECKOUT_SESSION_ID}.
      const session = await stripe.checkout.sessions.create(
        embedded
          ? {
              ui_mode: "embedded",
              customer_email: user.email,
              mode: "subscription",
              line_items: [{ price: priceId, quantity: 1 }],
              return_url: `${env.FRONTEND_URL}/purchases?success=1&session_id={CHECKOUT_SESSION_ID}`,
              allow_promotion_codes: true,
              metadata: { userId: String(user.id), plan },
              subscription_data: { metadata: { userId: String(user.id), plan } },
            }
          : {
              customer_email: user.email,
              mode: "subscription",
              line_items: [{ price: priceId, quantity: 1 }],
              success_url: `${env.FRONTEND_URL}/purchases?success=1`,
              cancel_url: `${env.FRONTEND_URL}/purchases?canceled=1`,
              allow_promotion_codes: true,
              metadata: { userId: String(user.id), plan },
              subscription_data: { metadata: { userId: String(user.id), plan } },
            },
        { idempotencyKey: idempotencyKey([user.id, "sub", plan, embedded ? "emb" : "url", dayBucket()]) },
      );

      if (embedded) {
        res.json({ clientSecret: session.client_secret });
      } else {
        res.json({ url: session.url });
      }
    } catch (err) { next(err); }
  };

  createPurchase = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { movieId, seriesId, embedded = false } = req.body as {
        movieId?: number;
        seriesId?: number;
        embedded?: boolean;
      };
      if (!movieId && !seriesId) throw new AppError("BAD_REQUEST", "movieId or seriesId required", 400);
      if (movieId && seriesId) throw new AppError("BAD_REQUEST", "Provide either movieId or seriesId, not both", 400);

      const userId = req.user!.userId;

      // If the user is an active subscriber, they already have access — block to avoid double-billing surprise.
      const activeSub = await prisma.subscription.findFirst({
        where: { userId, status: { in: ["ACTIVE", "TRIALING"] } },
      });
      if (activeSub) {
        throw new AppError("CONFLICT", "Your active subscription already grants access", 409);
      }

      // Duplicate-purchase guard: completed purchases should short-circuit.
      const owned = await prisma.purchase.findFirst({
        where: {
          userId,
          status: "COMPLETED",
          ...(movieId ? { movieId } : {}),
          ...(seriesId ? { seriesId } : {}),
        },
      });
      if (owned) throw new AppError("CONFLICT", "You already own this content", 409);

      let title = "";
      let priceInCents = 0;
      let imageUrl: string | undefined;

      if (movieId) {
        const movie = await prisma.movie.findUnique({ where: { id: movieId } });
        if (!movie) throw new AppError("NOT_FOUND", "Movie not found", 404);
        title = movie.title;
        priceInCents = Math.round(movie.price * 100);
        imageUrl = movie.posterUrl;
      } else if (seriesId) {
        const series = await prisma.series.findUnique({ where: { id: seriesId } });
        if (!series) throw new AppError("NOT_FOUND", "Series not found", 404);
        title = series.title;
        priceInCents = Math.round(series.price * 100);
        imageUrl = series.posterUrl;
      }

      if (priceInCents <= 0) throw new AppError("BAD_REQUEST", "Content is free, no purchase required", 400);

      const user = await prisma.user.findUnique({ where: { id: userId } });

      const lineItem = {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: priceInCents,
          product_data: {
            name: title,
            ...(imageUrl ? { images: [imageUrl] } : {}),
          },
        },
      } as const;
      const paymentIntentData = {
        ...(user?.email ? { receipt_email: user.email } : {}),
        metadata: {
          userId: String(userId),
          movieId: movieId ? String(movieId) : "",
          seriesId: seriesId ? String(seriesId) : "",
        },
      };
      const baseMeta = {
        userId: String(userId),
        movieId: movieId ? String(movieId) : "",
        seriesId: seriesId ? String(seriesId) : "",
      };

      const session = await stripe.checkout.sessions.create(
        embedded
          ? {
              ui_mode: "embedded",
              mode: "payment",
              ...(user?.email ? { customer_email: user.email } : {}),
              line_items: [lineItem],
              payment_intent_data: paymentIntentData,
              return_url: `${env.FRONTEND_URL}/purchases?success=1&session_id={CHECKOUT_SESSION_ID}`,
              allow_promotion_codes: true,
              metadata: baseMeta,
            }
          : {
              mode: "payment",
              ...(user?.email ? { customer_email: user.email } : {}),
              line_items: [lineItem],
              payment_intent_data: paymentIntentData,
              success_url: `${env.FRONTEND_URL}/purchases?success=1`,
              cancel_url: `${env.FRONTEND_URL}/purchases?canceled=1`,
              allow_promotion_codes: true,
              metadata: baseMeta,
            },
        { idempotencyKey: idempotencyKey([userId, "buy", movieId ?? "", seriesId ?? "", priceInCents, embedded ? "emb" : "url", dayBucket()]) },
      );

      if (embedded) {
        res.json({ clientSecret: session.client_secret });
      } else {
        res.json({ url: session.url });
      }
    } catch (err) { next(err); }
  };

  getMySubscription = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sub = await prisma.subscription.findFirst({
        where: { userId: req.user!.userId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
        orderBy: { createdAt: "desc" },
      });
      res.json({ data: sub });
    } catch (err) { next(err); }
  };

  cancelSubscription = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sub = await prisma.subscription.findFirst({
        where: { userId: req.user!.userId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
      });
      if (!sub?.stripeSubId) throw new AppError("NOT_FOUND", "No active subscription", 404);

      const stripeSub = await stripe.subscriptions.update(sub.stripeSubId, { cancel_at_period_end: true });
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          cancelAtPeriodEnd: true,
          currentPeriodEnd: new Date(((stripeSub.items.data[0] as { current_period_end?: number })?.current_period_end ?? (stripeSub as unknown as { current_period_end: number }).current_period_end) * 1000),
        },
      });
      res.json({ success: true });
    } catch (err) { next(err); }
  };

  // Stripe-hosted Customer Portal: lets users update their payment method,
  // download invoices, view past payments, and self-cancel.
  // Requires the portal to be configured once at:
  //   https://dashboard.stripe.com/test/settings/billing/portal
  createPortalSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const sub = await prisma.subscription.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      if (!sub?.stripeCustomerId) {
        throw new AppError("NOT_FOUND", "No billing account found. Subscribe first.", 404);
      }
      const portal = await stripe.billingPortal.sessions.create({
        customer: sub.stripeCustomerId,
        return_url: `${env.FRONTEND_URL}/purchases`,
      });
      res.json({ url: portal.url });
    } catch (err) { next(err); }
  };

  getMyPurchases = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const purchases = await prisma.purchase.findMany({
        where: { userId: req.user!.userId },
        include: {
          movie: { select: { id: true, title: true, posterUrl: true, slug: true } },
          series: { select: { id: true, title: true, posterUrl: true, slug: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      res.json({ data: purchases });
    } catch (err) { next(err); }
  };
}
