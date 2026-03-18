import { IsString, IsOptional, IsEnum, IsInt, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Rating } from '@prisma/client';

export class CreateVisitDto {
  @ApiProperty() @IsString() restaurant: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() recommendationId?: number;
  @ApiPropertyOptional({ enum: Rating }) @IsOptional() @IsEnum(Rating) rating?: Rating;
  @ApiPropertyOptional() @IsOptional() @IsString() menu?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() visitedAt?: string;
}
