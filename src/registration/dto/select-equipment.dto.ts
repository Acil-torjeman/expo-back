// src/registration/dto/select-equipment.dto.ts
import { IsArray, IsMongoId, IsOptional, IsBoolean } from 'class-validator';

export class SelectEquipmentDto {
  @IsArray({ message: 'Equipment IDs must be an array' })
  @IsMongoId({ each: true, message: 'Each equipment ID must be a valid MongoDB ID' })
  equipmentIds: string[];

  @IsOptional()
  @IsBoolean({ message: 'Equipment selection completed must be a boolean' })
  selectionCompleted?: boolean;
  
  @IsOptional()
  metadata?: any;
}