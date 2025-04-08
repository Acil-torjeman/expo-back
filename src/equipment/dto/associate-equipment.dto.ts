import { IsNotEmpty, IsMongoId, IsOptional, IsNumber, Min } from 'class-validator';

export class AssociateEquipmentDto {
  @IsNotEmpty({ message: 'Event ID is required' })
  @IsMongoId({ message: 'Invalid event ID format' })
  eventId: string;
  
  @IsOptional()
  @IsNumber({}, { message: 'Special price must be a number' })
  @Min(0, { message: 'Special price cannot be negative' })
  specialPrice?: number;
  
  @IsOptional()
  @IsNumber({}, { message: 'Available quantity must be a number' })
  @Min(0, { message: 'Available quantity cannot be negative' })
  availableQuantity?: number;
}
