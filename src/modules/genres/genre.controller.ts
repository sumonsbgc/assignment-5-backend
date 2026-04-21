import { Request, Response, NextFunction } from "express";
import { prisma } from "@lib/database.js";
import { redis } from "@lib/redis.js";
import { paramInt } from "@utils/query.js";

const GENRES_CACHE_KEY = "cache:genres";
const GENRES_TTL = 3600; // 1 hour

export class GenreController {
  list = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const cached = await redis.get(GENRES_CACHE_KEY);
      if (cached) { res.json(JSON.parse(cached)); return; }
      const genres = await prisma.genre.findMany({ orderBy: { name: "asc" } });
      await redis.set(GENRES_CACHE_KEY, JSON.stringify(genres), "EX", GENRES_TTL);
      res.json(genres);
    } catch (err) { next(err); }
  };
  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name } = req.body as { name: string };
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const genre = await prisma.genre.create({ data: { name, slug } });
      await redis.del(GENRES_CACHE_KEY);
      res.status(201).json(genre);
    } catch (err) { next(err); }
  };
  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const genre = await prisma.genre.update({ where: { id: paramInt(req.params.id) }, data: req.body as Parameters<typeof prisma.genre.update>[0]["data"] });
      await redis.del(GENRES_CACHE_KEY);
      res.json(genre);
    } catch (err) { next(err); }
  };
  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.genre.delete({ where: { id: paramInt(req.params.id) } });
      await redis.del(GENRES_CACHE_KEY);
      res.json({ success: true });
    } catch (err) { next(err); }
  };
}
