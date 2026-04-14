import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/index.js";
import { logger } from "@utils/logger.js";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Prisma 7 requires a driver adapter (or accelerateUrl) on construction.
// We use @prisma/adapter-pg backed by node-postgres.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase() {
  await prisma.$connect();
  logger.info("Database connected");
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
  logger.info("Database disconnected");
}
