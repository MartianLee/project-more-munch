import { Controller, Post, HttpCode } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiOperation } from '@nestjs/swagger';
import { CollectorService } from './collector.service';

@ApiTags('collector')
@ApiSecurity('X-API-Key')
@Controller('collector')
export class CollectorController {
  constructor(private readonly collector: CollectorService) {}

  @Post('run')
  @HttpCode(200)
  @ApiOperation({ summary: '식당 데이터 수동 수집 트리거' })
  async run() {
    await this.collector.collect();
    return { message: 'Collection completed' };
  }
}
