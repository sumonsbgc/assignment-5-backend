import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/index.js";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      emailVerified: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(
    "\n| ID | Email                              | Name              | Role      | Verified | Created          |",
  );
  console.log(
    "|----|------------------------------------|-------------------|-----------|----------|------------------|",
  );
  for (const u of users) {
    console.log(
      `| ${String(u.id).padEnd(2)} | ${u.email.padEnd(34)} | ${(u.name ?? "").padEnd(17)} | ${u.role.padEnd(9)} | ${u.emailVerified ? "yes     " : "no      "} | ${u.createdAt.toISOString().slice(0, 16)} |`,
    );
  }
  console.log("\nTotal users:", users.length);
  await prisma.$disconnect();
}
main();
