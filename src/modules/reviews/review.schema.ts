import { z } from "zod";

const reviewBaseSchema = z.object({
  rating: z.number().int().min(1).max(10),
  title: z.string().max(200).optional(),
  text: z.string().min(10).max(5000),
  spoiler: z.boolean().default(false),
  movieId: z.number().int().optional(),
  seriesId: z.number().int().optional(),
});

export const createReviewSchema = reviewBaseSchema.refine((d) => d.movieId ?? d.seriesId, {
  message: "Either movieId or seriesId must be provided",
});

export const updateReviewSchema = reviewBaseSchema.omit({ movieId: true, seriesId: true }).partial();

export const createCommentSchema = z.object({
  text: z.string().min(1).max(2000),
  parentId: z.number().int().optional(),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
