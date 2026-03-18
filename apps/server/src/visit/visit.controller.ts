import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, Req, UseGuards, ParseIntPipe,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiQuery } from '@nestjs/swagger';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { VisitService } from './visit.service';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';
import { SettingsService } from '../settings/settings.service';

@ApiTags('visits')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('visits')
export class VisitController {
  constructor(
    private readonly visitService: VisitService,
    private readonly settingsService: SettingsService,
  ) {}

  @Post()
  async create(@Req() req: any, @Body() dto: CreateVisitDto) {
    const settings = await this.settingsService.get(req.user.id);
    return this.visitService.create(
      req.user.id, dto,
      settings.latitude ?? undefined,
      settings.longitude ?? undefined,
    );
  }

  @Get()
  @ApiQuery({ name: 'period', required: false }) @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'restaurant', required: false }) @ApiQuery({ name: 'rating', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number }) @ApiQuery({ name: 'cursor', required: false, type: Number })
  findAll(
    @Req() req: any,
    @Query('period') period?: string, @Query('category') category?: string,
    @Query('restaurant') restaurant?: string, @Query('rating') rating?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor?: number,
  ) {
    return this.visitService.findAll(req.user.id, { period, category, restaurant, rating, limit, cursor });
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.visitService.findOne(id, req.user.id);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVisitDto) {
    return this.visitService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.visitService.remove(id, req.user.id);
  }
}
