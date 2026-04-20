import { z } from "zod";

export const createSeriesSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().optional(),
  description: z.string().optional(),
  startYear: z.number().int().min(1900),
  endYear: z.number().int().optional(),
  creator: z.string().min(1),
  cast: z.array(z.string()).default([]),
  genreIds: z.array(z.number().int()).min(1),
  platforms: z.array(z.string()).default([]),
  isPremium: z.boolean().default(false),
  price: z.number().min(0).default(0),
  posterUrl: z.string().url(),
  backdropUrl: z.string().url().optional(),
  trailerUrl: z.string().url().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
});

export const updateSeriesSchema = createSeriesSchema.partial();

export const seriesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().optional().transform(Number),
  sort: z.enum(["rating", "startYear", "title", "createdAt"]).optional().default("createdAt"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  genre: z.string().optional(),
  search: z.string().optional(),
  isPremium: z.string().optional().transform((v) => v === "true"),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

export const createSeasonSchema = z.object({
  number: z.number().int().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  year: z.number().int().optional(),
});

export const createEpisodeSchema = z.object({
  number: z.number().int().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  duration: z.number().int().min(1),
  thumbnailUrl: z.string().url().optional(),
});

export type CreateSeriesInput = z.infer<typeof createSeriesSchema>;
