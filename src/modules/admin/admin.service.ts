import { prisma } from "@lib/database.js";

export class AdminService {
  async getStats() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [
      users,
      newUsers30d,
      reviews,
      reports,
      movies,
      series,
      activeSubs,
      mrr,
      revenue30d,
      purchases,
      recentPurchases,
      recentSubs,
      recentReports,
    ] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, createdAt: { gte: thirtyDaysAgo } } }),
      prisma.review.count({ where: { status: "PENDING" } }),
      prisma.report.count({ where: { status: "OPEN" } }),
      prisma.movie.count({ where: { deletedAt: null } }),
      prisma.series.count({ where: { deletedAt: null } }),
      prisma.subscription.count({ where: { status: { in: ["ACTIVE", "TRIALING"] } } }),
      // Naïve MRR: sum monthly value of active subscriptions
      // (MONTHLY = $9.99, ANNUAL ≈ $8.33/mo). Adjust if pricing changes.
      prisma.subscription.findMany({
        where: { status: { in: ["ACTIVE", "TRIALING"] } },
        select: { plan: true },
      }),
      prisma.purchase.aggregate({
        where: { status: "COMPLETED", createdAt: { gte: thirtyDaysAgo } },
        _sum: { amount: true },
      }),
      prisma.purchase.count({ where: { status: "COMPLETED" } }),
      prisma.purchase.findMany({
        where: { status: "COMPLETED" },
        include: {
          user: { select: { email: true, name: true } },
          movie: { select: { title: true } },
          series: { select: { title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.subscription.findMany({
        where: { status: { in: ["ACTIVE", "TRIALING"] } },
        include: { user: { select: { email: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.report.findMany({
        where: { status: "OPEN" },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    const mrrCents = mrr.reduce(
      (sum, s) => sum + (s.plan === "ANNUAL" ? 833 : 999),
      0,
    );

    return {
      users,
      newUsers30d,
      pendingReviews: reviews,
      openReports: reports,
      movies,
      series,
      activeSubscriptions: activeSubs,
      mrrCents,
      revenue30dCents: revenue30d._sum.amount ?? 0,
      totalPurchases: purchases,
      recentPurchases,
      recentSubscribers: recentSubs,
      recentReports,
    };
  }

  async listSubscribers(query: Record<string, string | undefined>) {
    const status = (query.status as
      | "ACTIVE"
      | "TRIALING"
      | "PAST_DUE"
      | "CANCELED"
      | undefined) ?? undefined;
    const subs = await prisma.subscription.findMany({
      where: status
        ? { status }
        : { status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            emailVerified: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const counts = await prisma.subscription.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    return {
      data: subs,
      counts: counts.reduce<Record<string, number>>(
        (acc, c) => ({ ...acc, [c.status]: c._count._all }),
        {},
      ),
    };
  }

  async getPendingReviews(query: Record<string, string | undefined>) {
    const status = (query.status as "PENDING" | "APPROVED" | "REJECTED") ?? "PENDING";
    const reviews = await prisma.review.findMany({
      where: { status, deletedAt: null },
      include: {
        user: { select: { id: true, name: true, email: true } },
        movie: { select: { id: true, title: true, slug: true } },
        series: { select: { id: true, title: true, slug: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    return { data: reviews };
  }

  async updateReviewStatus(id: number, status: "APPROVED" | "REJECTED") {
    return prisma.review.update({ where: { id }, data: { status } });
  }

  async getReports(query: Record<string, string | undefined>) {
    const status = (query.status as "OPEN" | "REVIEWED" | "RESOLVED" | "DISMISSED") ?? "OPEN";
    const reports = await prisma.report.findMany({
      where: { status },
      include: {
        user: { select: { id: true, name: true } },
        review: { select: { id: true, text: true } },
        comment: { select: { id: true, text: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    return { data: reports };
  }

  async resolveReport(id: number, status: "RESOLVED" | "DISMISSED") {
    return prisma.report.update({ where: { id }, data: { status, resolvedAt: new Date() } });
  }

  async listUsers(query: Record<string, string | undefined>) {
    const search = query.search?.trim();
    const role = query.role as "USER" | "MODERATOR" | "ADMIN" | undefined;
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(role ? { role } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        _count: { select: { reviews: true, purchases: true, subscriptions: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { data: users };
  }

  /**
   * Promote/demote a user. Guards:
   *   - acting admin can't demote themselves (avoid lockout)
   *   - role must be one of USER / MODERATOR / ADMIN
   */
  async updateUserRole(
    userId: number,
    role: "USER" | "MODERATOR" | "ADMIN",
    actorId: number,
  ) {
    if (!["USER", "MODERATOR", "ADMIN"].includes(role)) {
      throw new Error("Invalid role");
    }
    if (userId === actorId && role !== "ADMIN") {
      throw new Error("Refusing to demote yourself — ask another admin");
    }
    return prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });
  }

  /** Soft-delete a user. Same self-protection as updateUserRole. */
  async deleteUser(userId: number, actorId: number) {
    if (userId === actorId) {
      throw new Error("Refusing to delete your own account from the admin panel");
    }
    return prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
      select: { id: true },
    });
  }

  async getSalesReport(query: Record<string, string | undefined>) {
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = query.dateTo ? new Date(query.dateTo) : new Date();
    const purchases = await prisma.purchase.findMany({
      where: { createdAt: { gte: dateFrom, lte: dateTo } },
      include: { user: { select: { id: true, name: true, email: true } }, movie: { select: { title: true } }, series: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
    });
    const totalRevenue = purchases.reduce((sum, p) => sum + p.amount, 0);
    return { data: purchases, stats: { totalRevenue, count: purchases.length } };
  }
}
