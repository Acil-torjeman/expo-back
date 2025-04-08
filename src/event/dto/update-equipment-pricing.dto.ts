import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { PriceItemDto } from './price-item.dto';

export class UpdateEquipmentPricingDto {
  @IsArray({ message: 'Equipment pricing must be an array' })
  @ValidateNested({ each: true })
  @Type(() => PriceItemDto)
  @ArrayMinSize(1, { message: 'At least one equipment price must be provided' })
  equipmentPricing: PriceItemDto[];
}
