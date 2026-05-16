import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/index.js";

/**
 * Removes Subscription rows whose stripeSubId / stripeCustomerId look
 * like the manual-grant placeholders (manual_*) — those break real
 * Stripe API calls because the IDs don't exist in Stripe.
 */
async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  const all = await prisma.subscription.findMany();
  const fake = all.filter(
    (s) =>
      s.stripeSubId.startsWith("manual_") ||
      s.stripeCustomerId.startsWith("manual_") ||
      !s.stripeSubId.startsWith("sub_"),
  );

  for (const row of fake) {
    console.log(`  removing subscription id=${row.id} userId=${row.userId} stripeSubId=${row.stripeSubId}`);
  }

  if (fake.length > 0) {
    await prisma.subscription.deleteMany({
      where: { id: { in: fake.map((s) => s.id) } },
    });
  }
  console.log(`✓ Removed ${fake.length} fake subscription rows`);

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
