import { IsOptional, IsEnum, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Rating } from '@prisma/client';

export class UpdateVisitDto {
  @ApiPropertyOptional({ enum: Rating }) @IsOptional() @IsEnum(Rating) rating?: Rating;
  @ApiPropertyOptional() @IsOptional() @IsString() menu?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}
