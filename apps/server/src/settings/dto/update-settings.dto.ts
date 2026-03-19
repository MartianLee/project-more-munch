import { IsOptional, IsNumber, IsString, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ description: '주소 또는 장소명 (예: "시청역", "강남역 근처"). 입력 시 위도/경도 자동 변환' })
  @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() longitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(30) walkMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(5) minRating?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(30) excludeDays?: number;
}
