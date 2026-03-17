import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: number) {
    const totalVisits = await this.prisma.visit.count({ where: { userId } });

    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);
    const thisMonthVisits = await this.prisma.visit.count({
      where: { userId, visitedAt: { gte: thisMonthStart } },
    });

    const uniqueRestaurants = await this.prisma.visit.findMany({
      where: { userId },
      distinct: ['restaurantId'],
      select: { restaurantId: true },
    });

    const categoryGroups = await this.prisma.visit.groupBy({
      by: ['restaurantId'],
      where: { userId },
      _count: { id: true },
    });
    const restaurantIds = categoryGroups.map((g) => g.restaurantId);
    const restaurants = await this.prisma.restaurant.findMany({
      where: { id: { in: restaurantIds } },
      select: { id: true, name: true, category: true },
    });
    const restaurantMap = new Map(restaurants.map((r) => [r.id, r]));

    const categoryCounts = new Map<string, number>();
    const restaurantCounts = new Map<string, number>();
    for (const g of categoryGroups) {
      const r = restaurantMap.get(g.restaurantId);
      if (r?.category) {
        categoryCounts.set(r.category, (categoryCounts.get(r.category) ?? 0) + g._count.id);
      }
      if (r) {
        restaurantCounts.set(r.name, (restaurantCounts.get(r.name) ?? 0) + g._count.id);
      }
    }

    const favoriteCategory = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const favoriteRestaurant = [...restaurantCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const ratings = await this.prisma.visit.groupBy({
      by: ['rating'],
      where: { userId, rating: { not: null } },
      _count: { id: true },
    });
    const ratingDistribution: Record<string, number> = {};
    for (const r of ratings) {
      if (r.rating) ratingDistribution[r.rating] = r._count.id;
    }

    return {
      totalVisits,
      thisMonthVisits,
      uniqueRestaurants: uniqueRestaurants.length,
      favoriteCategory,
      favoriteRestaurant,
      ratingDistribution,
    };
  }
}
