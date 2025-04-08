import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { PriceItemDto } from './price-item.dto';

export class UpdateStandPricingDto {
  @IsArray({ message: 'Stand pricing must be an array' })
  @ValidateNested({ each: true })
  @Type(() => PriceItemDto)
  @ArrayMinSize(1, { message: 'At least one stand price must be provided' })
  standPricing: PriceItemDto[];
}
