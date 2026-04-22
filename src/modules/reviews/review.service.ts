import { prisma } from "@lib/database.js";
import { AppError } from "@utils/app-error.js";

export class ReviewService {
  async create(
    userId: number,
    data: {
      rating: number;
      title?: string;
      text: string;
      spoiler?: boolean;
      movieId?: number;
      seriesId?: number;
    }
  ) {
    const review = await prisma.review.create({
      data: {
        rating: data.rating,
        title: data.title,
        text: data.text,
        spoiler: data.spoiler ?? false,
        userId,
        movieId: data.movieId,
        seriesId: data.seriesId,
      },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });
    await this.updateContentRating(data.movieId, data.seriesId);
    return review;
  }

  async update(
    id: number,
    userId: number,
    data: { rating?: number; title?: string; text?: string; spoiler?: boolean }
  ) {
    const review = await prisma.review.findUnique({ where: { id } });
    if (!review || review.userId !== userId)
      throw new AppError("FORBIDDEN", "Cannot edit this review", 403);
    return prisma.review.update({ where: { id }, data });
  }

  async remove(id: number, userId: number) {
    const review = await prisma.review.findUnique({ where: { id } });
    if (!review || review.userId !== userId)
      throw new AppError("FORBIDDEN", "Cannot delete this review", 403);
    await prisma.review.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.updateContentRating(review.movieId ?? undefined, review.seriesId ?? undefined);
  }

  async toggleLike(reviewId: number, userId: number) {
    const existing = await prisma.like.findUnique({
      where: { userId_reviewId: { userId, reviewId } },
    });
    if (existing) {
      await prisma.like.delete({ where: { userId_reviewId: { userId, reviewId } } });
      return { liked: false };
    }
    await prisma.like.create({ data: { userId, reviewId } });
    return { liked: true };
  }

  async getComments(reviewId: number) {
    return prisma.comment.findMany({
      where: { reviewId, parentId: null, deletedAt: null },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        children: {
          where: { deletedAt: null },
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async addComment(
    reviewId: number,
    userId: number,
    data: { text: string; parentId?: number }
  ) {
    return prisma.comment.create({
      data: { text: data.text, parentId: data.parentId, reviewId, userId },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });
  }

  async listByMovie(movieId: number, cursor?: number, limit = 20) {
    const take = Math.min(limit, 100);
    const items = await prisma.review.findMany({
      where: { movieId, deletedAt: null, status: "APPROVED" },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { likes: true, comments: true } },
      },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > take;
    const data = hasMore ? items.slice(0, take) : items;
    return {
      data,
      pagination: { nextCursor: hasMore ? String(data[data.length - 1]!.id) : null, hasMore },
    };
  }

  async listBySeries(seriesId: number, cursor?: number, limit = 20) {
    const take = Math.min(limit, 100);
    const items = await prisma.review.findMany({
      where: { seriesId, deletedAt: null, status: "APPROVED" },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { likes: true, comments: true } },
      },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > take;
    const data = hasMore ? items.slice(0, take) : items;
    return {
      data,
      pagination: { nextCursor: hasMore ? String(data[data.length - 1]!.id) : null, hasMore },
    };
  }

  private async updateContentRating(movieId?: number, seriesId?: number) {
    if (movieId) {
      const stats = await prisma.review.aggregate({
        where: { movieId, deletedAt: null, status: "APPROVED" },
        _avg: { rating: true },
        _count: true,
      });
      await prisma.movie.update({
        where: { id: movieId },
        data: { averageRating: stats._avg.rating ?? 0, reviewCount: stats._count },
      });
    }
    if (seriesId) {
      const stats = await prisma.review.aggregate({
        where: { seriesId, deletedAt: null, status: "APPROVED" },
        _avg: { rating: true },
        _count: true,
      });
      await prisma.series.update({
        where: { id: seriesId },
        data: { averageRating: stats._avg.rating ?? 0, reviewCount: stats._count },
      });
    }
  }
}
