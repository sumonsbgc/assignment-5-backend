import { prisma } from "@lib/database.js";
import { redis } from "@lib/redis.js";
import { AppError } from "@utils/app-error.js";
import type { Prisma } from "../../../prisma/generated/index.js";

export class MovieService {
	async list(query: Record<string, string | undefined>) {
		const limit = Math.min(parseInt(query.limit ?? "20") || 20, 100);
		const cursor = query.cursor ? parseInt(query.cursor) : undefined;

		const where: Prisma.MovieWhereInput = {
			deletedAt: null,
			status:
				(query.status as "DRAFT" | "PUBLISHED" | "ARCHIVED" | undefined) ??
				"PUBLISHED",
		};

		if (query.search) {
			where.OR = [
				{ title: { contains: query.search, mode: "insensitive" } },
				{ director: { contains: query.search, mode: "insensitive" } },
			];
		}
		if (query.genre) {
			where.genres = { some: { slug: query.genre } };
		}
		if (query.yearMin || query.yearMax) {
			where.year = {
				...(query.yearMin ? { gte: parseInt(query.yearMin) } : {}),
				...(query.yearMax ? { lte: parseInt(query.yearMax) } : {}),
			};
		}
		if (query.ratingMin) {
			where.averageRating = { gte: parseFloat(query.ratingMin) };
		}
		if (query.isPremium !== undefined) {
			where.isPremium = query.isPremium === "true";
		}

		// API accepts `rating` for ergonomics; map to the underlying column.
		const SORT_MAP: Record<string, keyof Prisma.MovieOrderByWithRelationInput> = {
			rating: "averageRating",
			year: "year",
			title: "title",
			createdAt: "createdAt",
		};
		const sortField = SORT_MAP[query.sort ?? "createdAt"] ?? "createdAt";
		const sortOrder = (query.order ?? "desc") as "asc" | "desc";
		const orderBy: Prisma.MovieOrderByWithRelationInput = {
			[sortField]: sortOrder,
		};

		const [total, items] = await Promise.all([
			prisma.movie.count({ where }),
			prisma.movie.findMany({
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
		const movie = await prisma.movie.findFirst({
			where: { id, deletedAt: null },
			include: { genres: { select: { id: true, name: true, slug: true } } },
		});
		if (!movie) throw new AppError("NOT_FOUND", "Movie not found", 404);
		return movie;
	}

	async getBySlug(slug: string) {
		const cacheKey = `cache:movie:${slug}`;
		const cached = await redis.get(cacheKey);
		if (cached) return JSON.parse(cached);

		const movie = await prisma.movie.findFirst({
			where: { slug, deletedAt: null },
			include: { genres: { select: { id: true, name: true, slug: true } } },
		});
		if (!movie) throw new AppError("NOT_FOUND", "Movie not found", 404);
		await redis.set(cacheKey, JSON.stringify(movie), "EX", 300); // 5 min cache
		return movie;
	}

	async create(data: {
		title: string;
		slug?: string;
		description?: string;
		year: number;
		director: string;
		cast?: string[];
		genreIds: number[];
		platforms?: string[];
		duration: number;
		price?: number;
		isPremium?: boolean;
		posterUrl: string;
		backdropUrl?: string;
		trailerUrl?: string;
		status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
	}) {
		const { genreIds, slug, ...rest } = data;
		const finalSlug =
			slug ?? rest.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
		return prisma.movie.create({
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

	private async invalidateMovieCache(id: number) {
		const movie = await prisma.movie.findUnique({
			where: { id },
			select: { slug: true },
		});
		if (movie) await redis.del(`cache:movie:${movie.slug}`);
	}

	async update(
		id: number,
		data: {
			title?: string;
			description?: string;
			year?: number;
			director?: string;
			cast?: string[];
			genreIds?: number[];
			platforms?: string[];
			duration?: number;
			price?: number;
			isPremium?: boolean;
			posterUrl?: string;
			backdropUrl?: string;
			trailerUrl?: string;
			status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
		},
	) {
		const { genreIds, ...rest } = data;
		const updated = await prisma.movie.update({
			where: { id },
			data: {
				...rest,
				...(genreIds
					? { genres: { set: genreIds.map((gid) => ({ id: gid })) } }
					: {}),
			},
			include: { genres: true },
		});
		await this.invalidateMovieCache(id);
		return updated;
	}

	async remove(id: number) {
		const result = await prisma.movie.update({
			where: { id },
			data: { deletedAt: new Date() },
		});
		await this.invalidateMovieCache(id);
		return result;
	}
}
