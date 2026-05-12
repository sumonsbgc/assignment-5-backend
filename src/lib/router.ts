import { Router } from "express";
import authRoutes from "@modules/auth/index.js";
import movieRoutes from "@modules/movies/index.js";
import seriesRoutes from "@modules/series/index.js";
import genreRoutes from "@modules/genres/index.js";
import reviewRoutes from "@modules/reviews/index.js";
import watchlistRoutes from "@modules/watchlist/index.js";
import historyRoutes from "@modules/history/index.js";
import reportRoutes from "@modules/reports/index.js";
import checkoutRoutes from "@modules/checkout/index.js";
import streamRoutes from "@modules/stream/index.js";
import adminRoutes from "@modules/admin/index.js";
import webhookRoutes from "@modules/webhooks/index.js";
import userRoutes from "@modules/users/index.js";
import { prisma } from "@lib/database.js";
import { redis } from "@lib/redis.js";

const router = Router();

router.get("/health", async (_req, res) => {
  const checks = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redis.ping(),
  ]);
  const [db, cache] = checks;
  const healthy = checks.every((c) => c.status === "fulfilled");
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    checks: {
      database: db.status === "fulfilled" ? "ok" : "error",
      redis: cache.status === "fulfilled" ? "ok" : "error",
    },
  });
});

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/movies", movieRoutes);
router.use("/series", seriesRoutes);
router.use("/genres", genreRoutes);
router.use("/reviews", reviewRoutes);
router.use("/watchlist", watchlistRoutes);
router.use("/history", historyRoutes);
router.use("/reports", reportRoutes);
router.use("/checkout", checkoutRoutes);
router.use("/stream", streamRoutes);
router.use("/admin", adminRoutes);
router.use("/webhooks", webhookRoutes);

export default router;
