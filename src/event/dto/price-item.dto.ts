import { IsNotEmpty, IsMongoId, IsNumber, Min } from 'class-validator';

export class PriceItemDto {
  @IsNotEmpty({ message: 'Item ID is required' })
  @IsMongoId({ message: 'Invalid item ID format' })
  itemId: string;
  
  @IsNotEmpty({ message: 'Price is required' })
  @IsNumber({}, { message: 'Price must be a number' })
  @Min(0, { message: 'Price cannot be negative' })
  price: number;
}
