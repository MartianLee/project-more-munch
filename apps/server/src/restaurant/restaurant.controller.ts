import { Controller, Get, Param, Query, Req, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiQuery } from '@nestjs/swagger';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { RestaurantService } from './restaurant.service';
import { SettingsService } from '../settings/settings.service';

@ApiTags('restaurants')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('restaurants')
export class RestaurantController {
  constructor(
    private readonly restaurantService: RestaurantService,
    private readonly settingsService: SettingsService,
  ) {}

  @Get()
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'name', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: Number })
  async findAll(
    @Req() req: any,
    @Query('category') category?: string,
    @Query('name') name?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor?: number,
  ) {
    const settings = await this.settingsService.get(req.user.id);
    return this.restaurantService.findAll(
      { category, name, limit, cursor },
      settings.latitude ?? undefined,
      settings.longitude ?? undefined,
    );
  }

  @Get(':id')
  async findOne(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const settings = await this.settingsService.get(req.user.id);
    return this.restaurantService.findOne(
      id, req.user.id,
      settings.latitude ?? undefined,
      settings.longitude ?? undefined,
    );
  }
}
