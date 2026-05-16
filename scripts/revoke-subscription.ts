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

  const result = await prisma.subscription.updateMany({
    where: { userId: user.id, status: { in: ["ACTIVE", "TRIALING"] } },
    data: { status: "CANCELED", cancelAtPeriodEnd: true },
  });

  console.log(`✓ Revoked ${result.count} active subscription(s) for ${EMAIL}`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
