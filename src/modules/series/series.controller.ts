import { Request, Response, NextFunction } from "express";
import { SeriesService } from "./series.service.js";
import { ReviewService } from "@modules/reviews/review.service.js";
import { flattenQuery, paramInt, paramStr } from "@utils/query.js";

const seriesService = new SeriesService();
const reviewService = new ReviewService();

export class SeriesController {
  list = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await seriesService.list(flattenQuery(req.query))); } catch (err) { next(err); }
  };
  getBySlug = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await seriesService.getBySlug(paramStr(req.params.slug))); } catch (err) { next(err); }
  };
  getById = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await seriesService.getById(paramInt(req.params.id))); } catch (err) { next(err); }
  };
  create = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await seriesService.create(req.body)); } catch (err) { next(err); }
  };
  update = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await seriesService.update(paramInt(req.params.id), req.body)); } catch (err) { next(err); }
  };
  remove = async (req: Request, res: Response, next: NextFunction) => {
    try { await seriesService.remove(paramInt(req.params.id)); res.json({ success: true }); } catch (err) { next(err); }
  };
  addSeason = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await seriesService.addSeason(paramInt(req.params.id), req.body)); } catch (err) { next(err); }
  };

  getReviews = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cursor = req.query.cursor ? parseInt(req.query.cursor as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      res.json(await reviewService.listBySeries(paramInt(req.params.id), cursor, limit));
    } catch (err) { next(err); }
  };
}
