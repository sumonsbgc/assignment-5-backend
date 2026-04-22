import { Request, Response, NextFunction } from "express";
import { ReviewService } from "./review.service.js";
import { paramInt } from "@utils/query.js";

const reviewService = new ReviewService();

export class ReviewController {
  create = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await reviewService.create(req.user!.userId, req.body)); } catch (err) { next(err); }
  };
  update = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await reviewService.update(paramInt(req.params.id), req.user!.userId, req.body)); } catch (err) { next(err); }
  };
  remove = async (req: Request, res: Response, next: NextFunction) => {
    try { await reviewService.remove(paramInt(req.params.id), req.user!.userId); res.json({ success: true }); } catch (err) { next(err); }
  };
  toggleLike = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await reviewService.toggleLike(paramInt(req.params.id), req.user!.userId)); } catch (err) { next(err); }
  };
  getComments = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await reviewService.getComments(paramInt(req.params.id))); } catch (err) { next(err); }
  };
  addComment = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await reviewService.addComment(paramInt(req.params.id), req.user!.userId, req.body)); } catch (err) { next(err); }
  };
}
