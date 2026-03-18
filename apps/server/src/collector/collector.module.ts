import { Module } from '@nestjs/common';
import { CollectorService } from './collector.service';
import { KakaoService } from './kakao.service';
import { NaverService } from './naver.service';
import { MergerService } from './merger.service';
import { NaverFilterService } from './naver-filter.service';

@Module({
  providers: [CollectorService, KakaoService, NaverService, MergerService, NaverFilterService],
  exports: [CollectorService],
})
export class CollectorModule {}
