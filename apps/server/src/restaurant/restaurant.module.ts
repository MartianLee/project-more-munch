import { Module } from '@nestjs/common';
import { RestaurantController } from './restaurant.controller';
import { RestaurantService } from './restaurant.service';
import { RestaurantMatcherService } from './restaurant-matcher.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [RestaurantController],
  providers: [RestaurantService, RestaurantMatcherService],
  exports: [RestaurantService, RestaurantMatcherService],
})
export class RestaurantModule {}
