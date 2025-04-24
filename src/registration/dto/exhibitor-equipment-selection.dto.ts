// src/registration/dto/exhibitor-equipment-selection.dto.ts
import { IsArray, IsMongoId, IsOptional, IsBoolean, IsNumber, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class EquipmentQuantityItem {
  @IsMongoId({ message: 'Equipment ID must be valid' })
  equipmentId: string;
  
  @IsNumber({}, { message: 'Quantity must be a number' })
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity: number;
}

export class ExhibitorEquipmentSelectionDto {
  @IsArray({ message: 'Equipment selections must be an array' })
  @ValidateNested({ each: true })
  @Type(() => EquipmentQuantityItem)
  equipmentItems: EquipmentQuantityItem[];

  @IsOptional()
  @IsBoolean({ message: 'Equipment selection completed must be a boolean' })
  selectionCompleted?: boolean;
}