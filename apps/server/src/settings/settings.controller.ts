import { Controller, Get, Patch, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@ApiTags('settings')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get(@Req() req: any) {
    return this.settingsService.get(req.user.id);
  }

  @Patch()
  update(@Req() req: any, @Body() dto: UpdateSettingsDto) {
    return this.settingsService.update(req.user.id, dto);
  }
}
