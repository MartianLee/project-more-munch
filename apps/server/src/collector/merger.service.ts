import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KakaoPlace } from './kakao.service';
import { NaverPlace } from './naver.service';
import { NaverFilterService } from './naver-filter.service';

@Injectable()
export class MergerService {
  private readonly logger = new Logger(MergerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly naverFilter: NaverFilterService,
  ) {}

  async mergeAndSave(kakaoPlaces: KakaoPlace[], naverPlaces: NaverPlace[]) {
    const naverMap = new Map<string, NaverPlace>();
    for (const np of naverPlaces) {
      naverMap.set(this.normalize(np.title), np);
    }

    let upsertCount = 0;

    for (const kp of kakaoPlaces) {
      const naverMatch = naverMap.get(this.normalize(kp.name));
      const combinedRating = this.naverFilter.calculateCombinedRating(
        kp.rating,
        null,
        naverMatch?.description,
      );

      await this.prisma.restaurant.upsert({
        where: { kakaoId: kp.id },
        create: {
          name: kp.name,
          address: kp.address,
          latitude: kp.latitude,
          longitude: kp.longitude,
          category: kp.category,
          kakaoId: kp.id,
          kakaoRating: kp.rating,
          naverId: naverMatch ? this.normalize(naverMatch.title) : null,
          naverRating: null,
          combinedRating,
          businessHours: kp.businessHours ?? Prisma.JsonNull,
          isActive: true,
          lastSyncedAt: new Date(),
        },
        update: {
          name: kp.name,
          address: kp.address,
          category: kp.category,
          kakaoRating: kp.rating,
          combinedRating,
          businessHours: kp.businessHours ?? Prisma.JsonNull,
          isActive: true,
          lastSyncedAt: new Date(),
        },
      });
      upsertCount++;
    }

    // Handle Naver-only places
    for (const np of naverPlaces) {
      const normalizedName = this.normalize(np.title);
      const existsInKakao = kakaoPlaces.some((kp) => this.normalize(kp.name) === normalizedName);
      if (existsInKakao) continue;

      await this.prisma.restaurant.upsert({
        where: { name_address: { name: np.title, address: np.address } },
        create: {
          name: np.title,
          address: np.address,
          latitude: np.mapy,
          longitude: np.mapx,
          category: np.category,
          naverRating: null,
          combinedRating: null,
          isActive: true,
          lastSyncedAt: new Date(),
        },
        update: {
          category: np.category,
          isActive: true,
          lastSyncedAt: new Date(),
        },
      }).catch(() => {});
      upsertCount++;
    }

    this.logger.log(`Merged ${upsertCount} restaurants`);
  }

  private normalize(name: string): string {
    return name.replace(/\s+/g, '').toLowerCase();
  }
}
