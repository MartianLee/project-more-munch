import { Module } from '@nestjs/common';
import { CollectorController } from './collector.controller';
import { CollectorService } from './collector.service';
import { KakaoService } from './kakao.service';
import { NaverService } from './naver.service';
import { MergerService } from './merger.service';
import { NaverFilterService } from './naver-filter.service';
import { MenuCollectorService } from './menu-collector.service';

@Module({
  controllers: [CollectorController],
  providers: [CollectorService, KakaoService, NaverService, MergerService, NaverFilterService, MenuCollectorService],
  exports: [CollectorService, KakaoService],
})
export class CollectorModule {}
