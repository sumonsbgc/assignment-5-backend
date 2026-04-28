import { Request, Response, NextFunction } from "express";
import { prisma } from "@lib/database.js";
import { generateSignedR2Url } from "@utils/signed-url.js";
import { AppError } from "@utils/app-error.js";

export class StreamController {
  getManifest = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { contentType, id } = req.params as { contentType: string; id: string };
      const contentId = parseInt(id);
      const userId = req.user?.userId ?? null;

      let videoKey: string | null = null;

      if (contentType === "movie") {
        const movie = await prisma.movie.findUnique({ where: { id: contentId } });
        if (!movie) throw new AppError("NOT_FOUND", "Movie not found", 404);

        if (movie.isPremium) {
          if (!userId) throw new AppError("UNAUTHORIZED", "Sign in to watch premium content", 401);
          await this.verifyAccess(userId, contentId, null);
        }
        videoKey = movie.videoUrl ?? null;
      } else if (contentType === "episode") {
        const episode = await prisma.episode.findUnique({
          where: { id: contentId },
          include: { season: { include: { series: true } } },
        });
        if (!episode) throw new AppError("NOT_FOUND", "Episode not found", 404);

        if (episode.season.series.isPremium) {
          if (!userId) throw new AppError("UNAUTHORIZED", "Sign in to watch premium content", 401);
          await this.verifyAccess(userId, null, episode.season.series.id);
        }
        videoKey = episode.videoUrl ?? null;
      } else {
        throw new AppError("BAD_REQUEST", "Invalid content type", 400);
      }

      if (!videoKey) throw new AppError("NOT_FOUND", "Video not yet available", 404);

      // Two source types are supported:
      //   1. R2 keys (e.g. "videos/hls/movie-42-1/master.m3u8") — these need
      //      a short-lived signed URL.
      //   2. External absolute URLs (e.g. archive.org MP4s for the seeded
      //      public-domain catalog) — passed through unchanged.
      const isExternal = videoKey.startsWith("http://") || videoKey.startsWith("https://");
      const url = isExternal ? videoKey : await generateSignedR2Url(videoKey, 7200);
      res.json({ url });
    } catch (err) { next(err); }
  };

  /**
   * Lightweight metadata endpoint for the player's paywall UI. Returns
   * title info, entitlement status, and the right purchase target so
   * the paywall can wire its Subscribe / Buy buttons without an extra
   * round-trip to /movies or /series.
   */
  getStreamInfo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { contentType, id } = req.params as { contentType: string; id: string };
      const contentId = parseInt(id);
      const userId = req.user?.userId ?? null;

      if (contentType === "movie") {
        const movie = await prisma.movie.findUnique({ where: { id: contentId } });
        if (!movie) throw new AppError("NOT_FOUND", "Movie not found", 404);
        const hasAccess = !movie.isPremium || (userId ? await this.hasAccess(userId, contentId, null) : false);
        res.json({
          contentType,
          title: movie.title,
          posterUrl: movie.posterUrl,
          description: movie.description,
          isPremium: movie.isPremium,
          price: movie.price,
          hasAccess,
          isAuthenticated: !!userId,
          purchaseTarget: { movieId: movie.id },
        });
        return;
      }
      if (contentType === "episode") {
        const episode = await prisma.episode.findUnique({
          where: { id: contentId },
          include: { season: { include: { series: true } } },
        });
        if (!episode) throw new AppError("NOT_FOUND", "Episode not found", 404);
        const series = episode.season.series;
        const hasAccess = !series.isPremium || (userId ? await this.hasAccess(userId, null, series.id) : false);
        res.json({
          contentType,
          title: `${series.title} — ${episode.title}`,
          seriesTitle: series.title,
          episodeTitle: episode.title,
          posterUrl: series.posterUrl,
          description: episode.description ?? series.description,
          isPremium: series.isPremium,
          price: series.price,
          hasAccess,
          isAuthenticated: !!userId,
          purchaseTarget: { seriesId: series.id },
        });
        return;
      }
      throw new AppError("BAD_REQUEST", "Invalid content type", 400);
    } catch (err) { next(err); }
  };

  /** Same logic as verifyAccess but returns boolean instead of throwing. */
  private async hasAccess(userId: number, movieId: number | null, seriesId: number | null): Promise<boolean> {
    const sub = await prisma.subscription.findFirst({
      where: { userId, status: { in: ["ACTIVE", "TRIALING"] } },
    });
    if (sub) return true;
    const purchase = await prisma.purchase.findFirst({
      where: {
        userId,
        status: "COMPLETED",
        ...(movieId ? { movieId } : {}),
        ...(seriesId ? { seriesId } : {}),
      },
    });
    return !!purchase;
  }

  getDecryptionKey = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { keyId } = req.params;
      const keyData = await generateSignedR2Url(`keys/${keyId}.key`, 300);
      res.json({ url: keyData });
    } catch (err) { next(err); }
  };

  private async verifyAccess(userId: number, movieId: number | null, seriesId: number | null) {
    // Check active subscription
    const sub = await prisma.subscription.findFirst({
      where: { userId, status: { in: ["ACTIVE", "TRIALING"] } },
    });
    if (sub) return;

    // Check purchase
    const purchase = await prisma.purchase.findFirst({
      where: {
        userId,
        status: "COMPLETED",
        ...(movieId ? { movieId } : {}),
        ...(seriesId ? { seriesId } : {}),
      },
    });
    if (purchase) return;

    throw new AppError("FORBIDDEN", "Purchase or subscription required", 403);
  }
}
