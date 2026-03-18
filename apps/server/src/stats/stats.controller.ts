import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { StatsService } from './stats.service';

@ApiTags('stats')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('summary')
  getSummary(@Req() req: any) {
    return this.statsService.getSummary(req.user.id);
  }
}
