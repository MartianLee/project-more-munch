import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { SettingsModule } from './settings/settings.module';
import { RestaurantModule } from './restaurant/restaurant.module';
import { VisitModule } from './visit/visit.module';
import { RecommendationModule } from './recommendation/recommendation.module';
import { StatsModule } from './stats/stats.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    SettingsModule,
    RestaurantModule,
    VisitModule,
    RecommendationModule,
    StatsModule,
  ],
})
export class AppModule {}
