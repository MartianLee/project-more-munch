import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ScorerService, ScoreInput } from './scorer.service';
import { ReasonBuilderService } from './reason-builder.service';
import { haversineDistance, walkingMinutes, formatDistance } from '../common/utils/haversine';
import { RecommendationQueryDto } from './dto/recommendation-query.dto';

@Injectable()
export class RecommendationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly scorer: ScorerService,
    private readonly reasonBuilder: ReasonBuilderService,
  ) {}

  async recommend(userId: number, query: RecommendationQueryDto) {
    const settings = await this.settingsService.getOrThrow(userId);
    const count = query.count ?? 3;

    // Get all active restaurants
    const where: any = { isActive: true };
    if (query.category) where.category = query.category;
    if (query.priceRange) where.priceRange = query.priceRange;

    const restaurants = await this.prisma.restaurant.findMany({
      where,
      include: { menus: true },
    });

    // Get recent visits for exclusion
    const excludeDate = new Date();
    excludeDate.setDate(excludeDate.getDate() - settings.excludeDays);
    const recentVisits = await this.prisma.visit.findMany({
      where: { userId, visitedAt: { gte: excludeDate } },
      include: { restaurant: true },
    });
    const recentRestaurantIds = new Set(recentVisits.map((v) => v.restaurantId));

    // Get recent categories (last 3 days)
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const recentCategories = recentVisits
      .filter((v) => v.visitedAt >= threeDaysAgo && v.restaurant.category)
      .map((v) => v.restaurant.category!);

    // Get NEVER rated restaurants
    const neverVisits = await this.prisma.visit.findMany({
      where: { userId, rating: 'NEVER' },
      select: { restaurantId: true },
    });
    const neverRestaurantIds = new Set(neverVisits.map((v) => v.restaurantId));

    // Get ignored restaurants (recommended 3+ times, never visited)
    const ignoredCounts = await this.getIgnoredCounts(userId);

    // Get all visits (for unvisited filter + hasVisited + lastVisitDaysAgo)
    const allVisits = await this.prisma.visit.findMany({
      where: { userId },
      select: { restaurantId: true, visitedAt: true },
      orderBy: { visitedAt: 'desc' },
    });
    const allVisitedIds = query.unvisited
      ? new Set(allVisits.map((v) => v.restaurantId))
      : null;
    const allVisitedSet = new Set(allVisits.map((v) => v.restaurantId));
    const lastVisitByRestaurant = new Map<number, Date>();
    for (const v of allVisits) {
      if (!lastVisitByRestaurant.has(v.restaurantId)) {
        lastVisitByRestaurant.set(v.restaurantId, v.visitedAt);
      }
    }

    // Get best ratings per restaurant
    const bestRatings = await this.getBestRatings(userId);

    // Score and filter
    const scored = restaurants
      .filter((r) => {
        const dist = haversineDistance(settings.latitude, settings.longitude, r.latitude, r.longitude);
        if (walkingMinutes(dist) > settings.walkMinutes) return false;
        if (r.combinedRating != null && r.combinedRating < settings.minRating) return false;
        if (allVisitedIds && allVisitedIds.has(r.id)) return false;
        if (!this.isOpenForLunch(r.businessHours)) return false;
        return true;
      })
      .map((r) => {
        const dist = haversineDistance(settings.latitude, settings.longitude, r.latitude, r.longitude);
        const effectiveRating = r.combinedRating ?? settings.minRating;
        const input: ScoreInput = {
          combinedRating: effectiveRating,
          recentCategories,
          category: r.category,
          visitedInExcludeDays: recentRestaurantIds.has(r.id),
          neverRated: neverRestaurantIds.has(r.id),
          ignoredCount: ignoredCounts.get(r.id) ?? 0,
        };
        const score = this.scorer.calculate(input);
        const lastVisitDate = lastVisitByRestaurant.get(r.id);
        const lastVisitDaysAgo = lastVisitDate
          ? Math.floor((Date.now() - lastVisitDate.getTime()) / (24 * 60 * 60 * 1000))
          : null;

        return {
          restaurant: r,
          score,
          distance: dist,
          reason: this.reasonBuilder.build({
            combinedRating: r.combinedRating,
            hasVisited: allVisitedSet.has(r.id),
            lastVisitDaysAgo,
            bestRating: bestRatings.get(r.id) ?? null,
            naverBlogCount: r.naverBlogCount,
          }),
        };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || Math.random() - 0.5)
      .slice(0, count);

    if (scored.length === 0) {
      return {
        pick: null,
        alternatives: [],
        message: '조건에 맞는 식당이 없습니다. 거리나 평점 기준을 조정해보세요.',
        recommendedAt: new Date().toISOString(),
      };
    }

    // Save recommendations
    const recommendations = await Promise.all(
      scored.map((s, i) =>
        this.prisma.recommendation.create({
          data: {
            userId,
            restaurantId: s.restaurant.id,
            rank: i + 1,
            score: s.score,
          },
        }),
      ),
    );

    const formatEntry = (s: typeof scored[0], rec: typeof recommendations[0], menuLimit: number) => ({
      id: rec.id,
      restaurantId: s.restaurant.id,
      restaurant: {
        name: s.restaurant.name,
        category: s.restaurant.category,
        address: s.restaurant.address,
        distance: formatDistance(s.distance),
        combinedRating: s.restaurant.combinedRating,
        menus: s.restaurant.menus.slice(0, menuLimit).map((m) => ({ name: m.name, price: m.price })),
      },
      reason: s.reason,
      score: s.score,
    });

    const pick = formatEntry(scored[0], recommendations[0], 3);
    const alternatives = scored.slice(1).map((s, i) => formatEntry(s, recommendations[i + 1], 1));

    return {
      pick,
      alternatives,
      recommendedAt: new Date().toISOString(),
    };
  }

  private isOpenForLunch(businessHours: any): boolean {
    if (!businessHours) return true;
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const today = days[new Date().getDay()];
    const hours = businessHours[today];
    if (!hours) return false;
    const [open, close] = hours.split('-').map((t: string) => parseInt(t.replace(':', '')));
    return open <= 1100 && close >= 1400;
  }

  private async getIgnoredCounts(userId: number): Promise<Map<number, number>> {
    const recs = await this.prisma.recommendation.groupBy({
      by: ['restaurantId'],
      where: { userId, chosen: false },
      _count: { id: true },
    });
    const visited = await this.prisma.recommendation.findMany({
      where: { userId, chosen: true },
      select: { restaurantId: true },
    });
    const visitedIds = new Set(visited.map((v) => v.restaurantId));
    const map = new Map<number, number>();
    for (const r of recs) {
      if (!visitedIds.has(r.restaurantId)) {
        map.set(r.restaurantId, r._count.id);
      }
    }
    return map;
  }

  private async getBestRatings(userId: number): Promise<Map<number, string>> {
    const visits = await this.prisma.visit.findMany({
      where: { userId, rating: { not: null } },
      select: { restaurantId: true, rating: true },
    });
    const map = new Map<number, string>();
    const order = ['AMAZING', 'GOOD', 'OKAY', 'BAD', 'NEVER'];
    for (const v of visits) {
      const current = map.get(v.restaurantId);
      if (!current || order.indexOf(v.rating!) < order.indexOf(current)) {
        map.set(v.restaurantId, v.rating!);
      }
    }
    return map;
  }
}
