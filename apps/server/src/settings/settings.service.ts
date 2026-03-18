import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: number) {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });
    if (!settings) {
      return {
        latitude: null,
        longitude: null,
        walkMinutes: 10,
        minRating: 3.5,
        excludeDays: 5,
      };
    }
    return {
      latitude: settings.latitude,
      longitude: settings.longitude,
      walkMinutes: settings.walkMinutes,
      minRating: settings.minRating,
      excludeDays: settings.excludeDays,
    };
  }

  async update(userId: number, dto: UpdateSettingsDto) {
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        latitude: dto.latitude ?? 0,
        longitude: dto.longitude ?? 0,
        walkMinutes: dto.walkMinutes ?? 10,
        minRating: dto.minRating ?? 3.5,
        excludeDays: dto.excludeDays ?? 5,
      },
      update: dto,
    });
    return {
      latitude: settings.latitude,
      longitude: settings.longitude,
      walkMinutes: settings.walkMinutes,
      minRating: settings.minRating,
      excludeDays: settings.excludeDays,
    };
  }

  async getOrThrow(userId: number) {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });
    if (!settings || (settings.latitude === 0 && settings.longitude === 0)) {
      throw new BadRequestException('Location not set. Update settings first');
    }
    return settings;
  }
}
