import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { KakaoService } from './kakao.service';
import { NaverService } from './naver.service';
import { MergerService } from './merger.service';

@Injectable()
export class CollectorService {
  private readonly logger = new Logger(CollectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kakao: KakaoService,
    private readonly naver: NaverService,
    private readonly merger: MergerService,
  ) {}

  @Cron('0 4 * * *')
  async dailyUpdate() {
    this.logger.log('Starting daily restaurant data update');
    await this.collect();
  }

  @Cron('0 4 * * 0')
  async weeklyFullScan() {
    this.logger.log('Starting weekly full restaurant scan');
    await this.collect();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    await this.prisma.restaurant.updateMany({
      where: { lastSyncedAt: { lt: oneWeekAgo } },
      data: { isActive: false },
    });
  }

  async collect() {
    const settings = await this.prisma.userSettings.findFirst();
    if (!settings) {
      this.logger.warn('No user settings found, skipping collection');
      return;
    }

    const radiusM = Math.round(settings.walkMinutes * 80 * 1.2);

    try {
      const kakaoPlaces = await this.kakao.searchRestaurants(
        settings.latitude, settings.longitude, radiusM,
      );

      const naverPlaces = await this.naver.searchRestaurants(
        `${settings.latitude},${settings.longitude} 맛집`,
      );

      await this.merger.mergeAndSave(kakaoPlaces, naverPlaces);

      this.logger.log(`Collection complete: ${kakaoPlaces.length} Kakao, ${naverPlaces.length} Naver`);
    } catch (error) {
      this.logger.error('Collection failed', error);
    }
  }
}
