import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/index.js";
import { redis } from "../src/lib/redis.js";

const EMAIL = process.argv[2] ?? "sumoncc7@gmail.com";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) {
    console.error(`User not found: ${EMAIL}`);
    process.exit(1);
  }

  const now = new Date();
  const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  // Upsert: if there's already a sub row, mark it ACTIVE; otherwise create.
  const existing = await prisma.subscription.findFirst({
    where: { userId: user.id },
  });

  const sub = existing
    ? await prisma.subscription.update({
        where: { id: existing.id },
        data: {
          status: "ACTIVE",
          plan: "MONTHLY",
          currentPeriodStart: now,
          currentPeriodEnd: oneYearFromNow,
          cancelAtPeriodEnd: false,
        },
      })
    : await prisma.subscription.create({
        data: {
          userId: user.id,
          status: "ACTIVE",
          plan: "MONTHLY",
          currentPeriodStart: now,
          currentPeriodEnd: oneYearFromNow,
          stripeSubId: `manual_${user.id}_${Date.now()}`,
          stripeCustomerId: `manual_cust_${user.id}`,
        },
      });

  // Clear the streaming rate limit counter for this user so they can
  // resume immediately after the 429.
  const keys = await redis.keys("rl:streaming:*");
  if (keys.length > 0) {
    await redis.del(...keys);
    console.log(`Cleared ${keys.length} streaming rate-limit entries`);
  }

  console.log("✓ Subscription active for", EMAIL);
  console.log("  id:", sub.id);
  console.log("  status:", sub.status);
  console.log("  period:", sub.currentPeriodStart, "→", sub.currentPeriodEnd);

  await prisma.$disconnect();
  redis.disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
