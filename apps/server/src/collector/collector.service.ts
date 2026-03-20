import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { KakaoService, KakaoPlace } from './kakao.service';
import { NaverService } from './naver.service';
import { MergerService } from './merger.service';
import { H3GridService } from './h3-grid.service';

const SEARCH_RADIUS_M = 600;
const CELL_DELAY_MS = 100;

@Injectable()
export class CollectorService {
  private readonly logger = new Logger(CollectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kakao: KakaoService,
    private readonly naver: NaverService,
    private readonly merger: MergerService,
    private readonly h3Grid: H3GridService,
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

  async collect(): Promise<{ totalRestaurants: number; cellsSearched: number; saturatedCells: number }> {
    const settings = await this.prisma.userSettings.findFirst();
    if (!settings) {
      this.logger.warn('No user settings found, skipping collection');
      return { totalRestaurants: 0, cellsSearched: 0, saturatedCells: 0 };
    }

    const radiusM = Math.round(settings.walkMinutes * 80 * 1.2);
    const cells = this.h3Grid.getSearchCells(settings.latitude, settings.longitude, radiusM);
    this.logger.log(`Searching ${cells.length} H3 cells (radius ${radiusM}m)`);

    const allPlaces = new Map<string, KakaoPlace>();
    const saturatedIndexes: string[] = [];

    // Phase 1: 기본 셀 검색
    for (const cell of cells) {
      const result = await this.kakao.searchRestaurantsWithMeta(cell.lat, cell.lng, SEARCH_RADIUS_M);
      for (const place of result.places) {
        allPlaces.set(place.id, place);
      }
      if (result.isSaturated) {
        saturatedIndexes.push(cell.h3Index);
      }
      await this.delay(CELL_DELAY_MS);
    }

    // Phase 2: 포화 셀 세분화
    let refinedCellCount = 0;
    if (saturatedIndexes.length > 0) {
      const refinedCells = this.h3Grid.refineSaturatedCells(saturatedIndexes);
      refinedCellCount = refinedCells.length;
      this.logger.log(`Refining ${saturatedIndexes.length} saturated cells → ${refinedCells.length} sub-cells`);

      for (const cell of refinedCells) {
        const result = await this.kakao.searchRestaurantsWithMeta(cell.lat, cell.lng, SEARCH_RADIUS_M);
        for (const place of result.places) {
          allPlaces.set(place.id, place);
        }
        await this.delay(CELL_DELAY_MS);
      }
    }

    const kakaoPlaces = Array.from(allPlaces.values());

    // 네이버 보조 검색
    try {
      const naverPlaces = await this.naver.searchRestaurants(
        `${settings.latitude},${settings.longitude} 맛집`,
      );
      await this.merger.mergeAndSave(kakaoPlaces, naverPlaces);
    } catch (error) {
      this.logger.warn('Naver search failed, merging Kakao-only', error);
      await this.merger.mergeAndSave(kakaoPlaces, []);
    }

    const stats = {
      totalRestaurants: kakaoPlaces.length,
      cellsSearched: cells.length + refinedCellCount,
      saturatedCells: saturatedIndexes.length,
    };

    this.logger.log(
      `Collection complete: ${stats.totalRestaurants} restaurants from ${stats.cellsSearched} cells (${stats.saturatedCells} saturated)`,
    );

    return stats;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
