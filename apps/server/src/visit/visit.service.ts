import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantMatcherService } from '../restaurant/restaurant-matcher.service';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';

@Injectable()
export class VisitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matcher: RestaurantMatcherService,
  ) {}

  async create(userId: number, dto: CreateVisitDto, userLat?: number, userLon?: number) {
    const restaurant = await this.matcher.matchByName(dto.restaurant, userLat, userLon);

    const visit = await this.prisma.visit.create({
      data: {
        userId,
        restaurantId: restaurant.id,
        recommendationId: dto.recommendationId ?? null,
        rating: dto.rating ?? null,
        menu: dto.menu ?? null,
        comment: dto.comment ?? null,
        visitedAt: dto.visitedAt ? new Date(dto.visitedAt) : new Date(),
      },
      include: { restaurant: true },
    });

    // Update recommendation chosen status
    if (dto.recommendationId) {
      await this.prisma.recommendation.updateMany({
        where: { id: dto.recommendationId, userId },
        data: { chosen: true },
      });
    }

    const missingOptional: string[] = [];
    if (!visit.rating) missingOptional.push('rating');
    if (!visit.menu) missingOptional.push('menu');
    if (!visit.comment) missingOptional.push('comment');

    return {
      id: visit.id,
      restaurant: visit.restaurant.name,
      category: visit.restaurant.category,
      rating: visit.rating,
      menu: visit.menu,
      comment: visit.comment,
      visitedAt: visit.visitedAt.toISOString().split('T')[0],
      missingOptional,
    };
  }

  async findAll(
    userId: number,
    query: {
      period?: string; category?: string; restaurant?: string;
      rating?: string; limit?: number; cursor?: number;
    },
  ) {
    const { period, category, restaurant, rating, limit = 20, cursor } = query;
    const where: any = { userId };

    if (period === 'week') {
      where.visitedAt = { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
    } else if (period === 'month') {
      where.visitedAt = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }
    if (category) where.restaurant = { ...where.restaurant, category };
    if (restaurant) where.restaurant = { ...where.restaurant, name: { contains: restaurant } };
    if (rating) where.rating = rating;

    const visits = await this.prisma.visit.findMany({
      where,
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { visitedAt: 'desc' },
      include: { restaurant: true },
    });

    const data = visits.map((v) => ({
      id: v.id,
      restaurant: v.restaurant.name,
      category: v.restaurant.category,
      rating: v.rating,
      menu: v.menu,
      comment: v.comment,
      visitedAt: v.visitedAt.toISOString().split('T')[0],
    }));

    const nextCursor = visits.length === limit ? visits[visits.length - 1].id : null;
    return { data, nextCursor };
  }

  async findOne(id: number, userId: number) {
    const visit = await this.prisma.visit.findFirst({
      where: { id, userId },
      include: { restaurant: true },
    });
    if (!visit) throw new NotFoundException('Visit not found');
    return {
      id: visit.id,
      restaurant: visit.restaurant.name,
      category: visit.restaurant.category,
      rating: visit.rating,
      menu: visit.menu,
      comment: visit.comment,
      visitedAt: visit.visitedAt.toISOString().split('T')[0],
    };
  }

  async update(id: number, userId: number, dto: UpdateVisitDto) {
    const visit = await this.prisma.visit.findFirst({ where: { id, userId } });
    if (!visit) throw new NotFoundException('Visit not found');

    const updated = await this.prisma.visit.update({
      where: { id },
      data: dto,
      include: { restaurant: true },
    });

    return {
      id: updated.id,
      restaurant: updated.restaurant.name,
      category: updated.restaurant.category,
      rating: updated.rating,
      menu: updated.menu,
      comment: updated.comment,
      visitedAt: updated.visitedAt.toISOString().split('T')[0],
    };
  }

  async remove(id: number, userId: number) {
    const visit = await this.prisma.visit.findFirst({ where: { id, userId } });
    if (!visit) throw new NotFoundException('Visit not found');
    await this.prisma.visit.delete({ where: { id } });
  }
}
