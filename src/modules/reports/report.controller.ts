import { Request, Response, NextFunction } from "express";
import { prisma } from "@lib/database.js";

export class ReportController {
  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reason, details, reviewId, commentId } = req.body as {
        reason: string; details?: string; reviewId?: number; commentId?: number;
      };
      const report = await prisma.report.create({
        data: { reason, details, reviewId, commentId, userId: req.user!.userId },
      });
      res.status(201).json(report);
    } catch (err) { next(err); }
  };
}
