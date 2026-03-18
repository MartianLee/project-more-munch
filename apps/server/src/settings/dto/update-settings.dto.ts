import { IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() longitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(30) walkMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(5) minRating?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(30) excludeDays?: number;
}
