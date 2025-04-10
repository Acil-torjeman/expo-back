// src/event/dto/update-event.dto.ts

import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsObject, IsMongoId, IsArray } from 'class-validator';
import { CreateEventDto } from './create-event.dto';

export class UpdateEventDto extends PartialType(CreateEventDto) {
  @IsOptional()
  @IsObject({ message: 'Stand pricing must be an object' })
  standPricing?: Record<string, number>;
  
  @IsOptional()
  @IsObject({ message: 'Equipment pricing must be an object' })
  equipmentPricing?: Record<string, number>;
  
  @IsOptional()
  @IsMongoId({ message: 'Plan ID must be a valid MongoDB ID' })
  planId?: string | null;
  
  // Add this to ensure equipmentIds is included in the DTO
  @IsOptional()
  @IsArray({ message: 'Equipment IDs must be an array' })
  @IsMongoId({ each: true, message: 'Each equipment ID must be a valid MongoDB ID' })
  equipmentIds?: string[];

  @IsOptional()
  statusReason?: string;
}