import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/index.js";

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

  const subs = await prisma.subscription.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  const purchases = await prisma.purchase.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  const events = await prisma.stripeEvent.findMany({
    orderBy: { processedAt: "desc" },
    take: 8,
  });

  console.log(`\nUser ${EMAIL} (id=${user.id})`);
  console.log(`\nSubscriptions: ${subs.length}`);
  for (const s of subs) {
    console.log(`  id=${s.id}  status=${s.status}  plan=${s.plan}  stripeSubId=${s.stripeSubId}  custId=${s.stripeCustomerId}`);
    console.log(`    period: ${s.currentPeriodStart.toISOString()} → ${s.currentPeriodEnd.toISOString()}  cancelAtPeriodEnd=${s.cancelAtPeriodEnd}`);
  }

  console.log(`\nPurchases: ${purchases.length}`);
  for (const p of purchases) {
    console.log(`  id=${p.id}  status=${p.status}  movieId=${p.movieId} seriesId=${p.seriesId} amount=${p.amount}`);
  }

  console.log(`\nRecent StripeEvents (latest 8):`);
  for (const e of events) {
    console.log(`  ${e.processedAt.toISOString()}  ${e.type}  id=${e.id}`);
  }

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
