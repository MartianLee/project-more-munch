import { Module } from '@nestjs/common';
import { VisitController } from './visit.controller';
import { VisitService } from './visit.service';
import { RestaurantModule } from '../restaurant/restaurant.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [RestaurantModule, SettingsModule],
  controllers: [VisitController],
  providers: [VisitService],
  exports: [VisitService],
})
export class VisitModule {}
