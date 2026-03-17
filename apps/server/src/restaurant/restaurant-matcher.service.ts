import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { haversineDistance } from '../common/utils/haversine';

@Injectable()
export class RestaurantMatcherService {
  constructor(private readonly prisma: PrismaService) {}

  async matchByName(name: string, userLat?: number, userLon?: number) {
    // Try exact match first
    let restaurants = await this.prisma.restaurant.findMany({
      where: { name, isActive: true },
    });

    // Try startsWith match
    if (restaurants.length === 0) {
      restaurants = await this.prisma.restaurant.findMany({
        where: { name: { startsWith: name }, isActive: true },
      });
    }

    // Try contains match
    if (restaurants.length === 0) {
      restaurants = await this.prisma.restaurant.findMany({
        where: { name: { contains: name }, isActive: true },
      });
    }

    if (restaurants.length === 0) {
      throw new BadRequestException(`Restaurant not found: ${name}`);
    }

    // If multiple matches and user location available, pick closest
    if (restaurants.length > 1 && userLat != null && userLon != null) {
      restaurants.sort(
        (a, b) =>
          haversineDistance(userLat, userLon, a.latitude, a.longitude) -
          haversineDistance(userLat, userLon, b.latitude, b.longitude),
      );
    }

    return restaurants[0];
  }
}
