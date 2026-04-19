import { z } from "zod";

export const createMovieSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  year: z.number().int().min(1900).max(2100),
  director: z.string().min(1),
  cast: z.array(z.string()).default([]),
  genreIds: z.array(z.number().int()).min(1),
  platforms: z.array(z.string()).default([]),
  duration: z.number().int().min(1),
  price: z.number().min(0).default(0),
  isPremium: z.boolean().default(false),
  posterUrl: z.string().url(),
  backdropUrl: z.string().url().optional(),
  trailerUrl: z.string().url().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
});

export const updateMovieSchema = createMovieSchema.partial();

export const movieQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().optional().transform(Number),
  sort: z.enum(["rating", "year", "title", "createdAt"]).optional().default("createdAt"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  genre: z.string().optional(),
  yearMin: z.string().optional().transform(Number),
  yearMax: z.string().optional().transform(Number),
  ratingMin: z.string().optional().transform(Number),
  search: z.string().optional(),
  isPremium: z.string().optional().transform((v) => v === "true"),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

export type CreateMovieInput = z.infer<typeof createMovieSchema>;
export type MovieQueryInput = z.infer<typeof movieQuerySchema>;
