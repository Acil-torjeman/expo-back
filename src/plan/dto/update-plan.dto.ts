import { IsOptional, IsBoolean, IsArray, IsMongoId } from 'class-validator';
import { Transform } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { CreatePlanDto } from './create-plan.dto';

export class UpdatePlanDto extends PartialType(CreatePlanDto) {
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      // Convert string 'true'/'false' to actual boolean
      return value === 'true';
    }
    return value;
  })
  isActive?: boolean;
  
  @IsOptional()
  @IsArray({ message: 'Events must be an array of event IDs' })
  @IsMongoId({ each: true, message: 'Each event ID must be a valid MongoDB ID' })
  events?: string[];
}