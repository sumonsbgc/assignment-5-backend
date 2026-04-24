import { Request, Response, NextFunction } from "express";
import { prisma } from "@lib/database.js";

export class HistoryController {
  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const history = await prisma.viewingHistory.findMany({
        where: { userId: req.user!.userId },
        include: {
          movie: { select: { id: true, title: true, slug: true, posterUrl: true, duration: true } },
          episode: { select: { id: true, title: true, number: true, duration: true, season: { select: { number: true, seriesId: true } } } },
        },
        orderBy: { lastWatched: "desc" },
      });
      res.json({ data: history });
    } catch (err) { next(err); }
  };

  updateProgress = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { movieId, episodeId, progress, completed } = req.body as {
        movieId?: number; episodeId?: number; progress: number; completed?: boolean;
      };
      const data = { progress, completed: completed ?? false, lastWatched: new Date() };
      if (movieId) {
        await prisma.viewingHistory.upsert({
          where: { userId_movieId: { userId: req.user!.userId, movieId } },
          update: data,
          create: { userId: req.user!.userId, movieId, ...data },
        });
      } else if (episodeId) {
        await prisma.viewingHistory.upsert({
          where: { userId_episodeId: { userId: req.user!.userId, episodeId } },
          update: data,
          create: { userId: req.user!.userId, episodeId, ...data },
        });
      }
      res.json({ success: true });
    } catch (err) { next(err); }
  };
}
