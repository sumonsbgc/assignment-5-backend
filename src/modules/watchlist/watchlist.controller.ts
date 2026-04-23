import { Request, Response, NextFunction } from "express";
import { prisma } from "@lib/database.js";
import { paramInt } from "@utils/query.js";

export class WatchlistController {
  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await prisma.watchlist.findMany({
        where: { userId: req.user!.userId },
        include: {
          movie: { select: { id: true, title: true, slug: true, posterUrl: true, averageRating: true } },
          series: { select: { id: true, title: true, slug: true, posterUrl: true, averageRating: true } },
        },
        orderBy: { addedAt: "desc" },
      });
      res.json({ data: items });
    } catch (err) { next(err); }
  };

  add = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { movieId, seriesId } = req.body as { movieId?: number; seriesId?: number };
      const item = await prisma.watchlist.create({
        data: { userId: req.user!.userId, movieId, seriesId },
      });
      res.status(201).json(item);
    } catch (err) { next(err); }
  };

  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.watchlist.delete({ where: { id: paramInt(req.params.id) } });
      res.json({ success: true });
    } catch (err) { next(err); }
  };
}
