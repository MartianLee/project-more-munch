import { Module } from '@nestjs/common';
import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './recommendation.service';
import { ScorerService } from './scorer.service';
import { ReasonBuilderService } from './reason-builder.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [RecommendationController],
  providers: [RecommendationService, ScorerService, ReasonBuilderService],
})
export class RecommendationModule {}
