import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KakaoService } from '../collector/kakao.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kakao: KakaoService,
  ) {}

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
    // 주소가 전달되면 카카오 API로 좌표 변환
    if (dto.address && !dto.latitude && !dto.longitude) {
      const coords = await this.kakao.geocode(dto.address);
      if (!coords) {
        throw new BadRequestException(`주소를 찾을 수 없습니다: ${dto.address}`);
      }
      dto.latitude = coords.latitude;
      dto.longitude = coords.longitude;
    }

    const { address, ...data } = dto;
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        latitude: data.latitude ?? 0,
        longitude: data.longitude ?? 0,
        walkMinutes: data.walkMinutes ?? 10,
        minRating: data.minRating ?? 3.5,
        excludeDays: data.excludeDays ?? 5,
      },
      update: data,
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
