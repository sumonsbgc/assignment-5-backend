import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 config file. Must live at the project root (next to package.json).
// See https://pris.ly/d/prisma-config and https://pris.ly/d/config-datasource
export default defineConfig({
  schema: path.join(import.meta.dirname, "prisma", "schema"),
  migrations: {
    path: path.join(import.meta.dirname, "prisma", "migrations"),
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
