import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsBoolean, IsArray, IsMongoId } from 'class-validator';
import { CreateEquipmentDto } from './create-equipment.dto';

export class UpdateEquipmentDto extends PartialType(CreateEquipmentDto) {
  @IsOptional()
  @IsBoolean({ message: 'isAvailable must be a boolean' })
  isAvailable?: boolean;
  
  @IsOptional()
  @IsArray({ message: 'Events must be an array of event IDs' })
  @IsMongoId({ each: true, message: 'Each event ID must be a valid MongoDB ID' })
  events?: string[];
}
