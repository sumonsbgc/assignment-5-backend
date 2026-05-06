import { z } from "zod";

export const createReportSchema = z.object({
  reason: z.string().min(1).max(200),
  details: z.string().max(2000).optional(),
  reviewId: z.number().int().optional(),
  commentId: z.number().int().optional(),
}).refine((d) => d.reviewId ?? d.commentId, {
  message: "Either reviewId or commentId must be provided",
});
