import { prisma } from "@lib/database.js";
import { AppError } from "@utils/app-error.js";
import type { Prisma } from "../../../prisma/generated/index.js";

export class SeriesService {
  async list(query: Record<string, string | undefined>) {
    const limit = Math.min(parseInt(query.limit ?? "20") || 20, 100);
    const cursor = query.cursor ? parseInt(query.cursor) : undefined;

    const where: Prisma.SeriesWhereInput = {
      deletedAt: null,
      status: (query.status as "DRAFT" | "PUBLISHED" | "ARCHIVED" | undefined) ?? "PUBLISHED",
    };

    if (query.search) {
      where.OR = [{ title: { contains: query.search, mode: "insensitive" } }];
    }
    if (query.genre) {
      where.genres = { some: { slug: query.genre } };
    }
    if (query.isPremium !== undefined) {
      where.isPremium = query.isPremium === "true";
    }

    const SORT_MAP: Record<string, keyof Prisma.SeriesOrderByWithRelationInput> = {
      rating: "averageRating",
      startYear: "startYear",
      title: "title",
      createdAt: "createdAt",
    };
    const sortField = SORT_MAP[query.sort ?? "createdAt"] ?? "createdAt";
    const sortOrder = (query.order ?? "desc") as "asc" | "desc";
    const orderBy: Prisma.SeriesOrderByWithRelationInput = { [sortField]: sortOrder };

    const [total, items] = await Promise.all([
      prisma.series.count({ where }),
      prisma.series.findMany({
        where,
        include: { genres: { select: { id: true, name: true, slug: true } } },
        orderBy,
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    ]);

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    return {
      data,
      pagination: {
        nextCursor: hasMore ? String(data[data.length - 1]!.id) : null,
        hasMore,
        total,
      },
    };
  }

  async getById(id: number) {
    const series = await prisma.series.findFirst({
      where: { id, deletedAt: null },
      include: {
        genres: { select: { id: true, name: true, slug: true } },
        seasons: { include: { episodes: true }, orderBy: { number: "asc" } },
      },
    });
    if (!series) throw new AppError("NOT_FOUND", "Series not found", 404);
    return series;
  }

  async getBySlug(slug: string) {
    const series = await prisma.series.findFirst({
      where: { slug, deletedAt: null },
      include: {
        genres: { select: { id: true, name: true, slug: true } },
        seasons: { include: { episodes: true }, orderBy: { number: "asc" } },
      },
    });
    if (!series) throw new AppError("NOT_FOUND", "Series not found", 404);
    return series;
  }

  async create(data: {
    title: string;
    slug?: string;
    description?: string;
    startYear: number;
    endYear?: number;
    creator: string;
    cast?: string[];
    genreIds: number[];
    platforms?: string[];
    isPremium?: boolean;
    price?: number;
    posterUrl: string;
    backdropUrl?: string;
    trailerUrl?: string;
    status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  }) {
    const { genreIds, slug, ...rest } = data;
    const finalSlug = slug ?? rest.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return prisma.series.create({
      data: {
        ...rest,
        slug: finalSlug,
        cast: rest.cast ?? [],
        platforms: rest.platforms ?? [],
        genres: { connect: genreIds.map((id) => ({ id })) },
      },
      include: { genres: true },
    });
  }

  async update(
    id: number,
    data: {
      title?: string;
      description?: string;
      startYear?: number;
      endYear?: number;
      creator?: string;
      cast?: string[];
      genreIds?: number[];
      platforms?: string[];
      isPremium?: boolean;
      price?: number;
      posterUrl?: string;
      backdropUrl?: string;
      trailerUrl?: string;
      status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    }
  ) {
    const { genreIds, ...rest } = data;
    return prisma.series.update({
      where: { id },
      data: {
        ...rest,
        ...(genreIds ? { genres: { set: genreIds.map((gid) => ({ id: gid })) } } : {}),
      },
      include: { genres: true },
    });
  }

  async remove(id: number) {
    return prisma.series.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async addSeason(seriesId: number, data: { number: number; title?: string; description?: string; year?: number }) {
    return prisma.season.create({
      data: { seriesId, number: data.number, title: data.title, description: data.description, year: data.year },
    });
  }
}
