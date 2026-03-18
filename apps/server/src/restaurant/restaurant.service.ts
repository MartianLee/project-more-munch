import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { haversineDistance, formatDistance } from '../common/utils/haversine';

@Injectable()
export class RestaurantService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: { category?: string; name?: string; limit?: number; cursor?: number },
    userLat?: number, userLon?: number,
  ) {
    const { category, name, limit = 20, cursor } = query;
    const where: any = { isActive: true };
    if (category) where.category = category;
    if (name) where.name = { contains: name };

    const restaurants = await this.prisma.restaurant.findMany({
      where,
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { combinedRating: 'desc' },
      include: { menus: { take: 1, orderBy: { updatedAt: 'desc' } } },
    });

    const data = restaurants.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      address: r.address,
      distance: userLat != null ? formatDistance(haversineDistance(userLat, userLon!, r.latitude, r.longitude)) : null,
      combinedRating: r.combinedRating,
      topMenu: r.menus[0] ? { name: r.menus[0].name, price: r.menus[0].price } : null,
    }));

    const nextCursor = restaurants.length === limit ? restaurants[restaurants.length - 1].id : null;
    return { data, nextCursor };
  }

  async findOne(id: number, userId: number, userLat?: number, userLon?: number) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      include: {
        menus: true,
        visits: {
          where: { userId },
          orderBy: { visitedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!restaurant || !restaurant.isActive) {
      throw new NotFoundException('Restaurant not found');
    }

    return {
      id: restaurant.id,
      name: restaurant.name,
      category: restaurant.category,
      address: restaurant.address,
      distance: userLat != null ? formatDistance(haversineDistance(userLat, userLon!, restaurant.latitude, restaurant.longitude)) : null,
      combinedRating: restaurant.combinedRating,
      kakaoRating: restaurant.kakaoRating,
      naverRating: restaurant.naverRating,
      naverBlogCount: restaurant.naverBlogCount,
      businessHours: restaurant.businessHours,
      menus: restaurant.menus.map((m) => ({ name: m.name, price: m.price })),
      myVisits: restaurant.visits.map((v) => ({
        id: v.id,
        rating: v.rating,
        menu: v.menu,
        visitedAt: v.visitedAt.toISOString().split('T')[0],
      })),
    };
  }
}
