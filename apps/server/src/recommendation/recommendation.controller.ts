import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { RecommendationService } from './recommendation.service';
import { RecommendationQueryDto } from './dto/recommendation-query.dto';

@ApiTags('recommendations')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('recommendations')
export class RecommendationController {
  constructor(private readonly recommendationService: RecommendationService) {}

  @Get()
  recommend(@Req() req: any, @Query() query: RecommendationQueryDto) {
    return this.recommendationService.recommend(req.user.id, query);
  }
}
