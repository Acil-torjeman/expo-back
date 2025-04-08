// src/equipment/dto/create-equipment.dto.ts
import { IsNotEmpty, IsString, IsNumber, Min, IsOptional, IsObject, IsUrl, IsEnum, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export enum EquipmentCategory {
  STAND = 'stand',
  LIGHTING = 'lighting',
  ELECTRICITY = 'electricity',
  AUDIO_VISUAL = 'audio_visual',
  FURNITURE = 'furniture',
  CONNECTIVITY = 'connectivity',
  OTHER = 'other'
}

export enum EquipmentUnit {
  HOUR = 'hour',
  DAY = 'day',
  EVENT = 'event',
  PIECE = 'piece',
  SQUARE_METER = 'square_meter'
}

export class CreateEquipmentDto {
  @IsNotEmpty({ message: 'Equipment name is required' })
  @IsString({ message: 'Equipment name must be a string' })
  @Transform(({ value }) => value?.trim())
  name: string;
  
  @IsNotEmpty({ message: 'Description is required' })
  @IsString({ message: 'Description must be a string' })
  description: string;
  
  @IsNotEmpty({ message: 'Price is required (in USD)' })
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Price must be a number with at most 3 decimal places' })
  @Min(0, { message: 'Price cannot be negative' })
  price: number;
  
  @IsNotEmpty({ message: 'Unit is required' })
  @IsEnum(EquipmentUnit, { message: 'Invalid unit. Must be one of: hour, day, event, piece, square_meter' })
  unit: EquipmentUnit;
  
  @IsNotEmpty({ message: 'Quantity is required' })
  @IsNumber({}, { message: 'Quantity must be a number' })
  @Min(0, { message: 'Quantity cannot be negative' })
  quantity: number;
  
  @IsOptional()
  @IsEnum(EquipmentCategory, { 
    message: 'Invalid category. Must be one of: stand, lighting, electricity, audio_visual, furniture, connectivity, other' 
  })
  category?: EquipmentCategory;
  
  @IsOptional()
  @IsObject({ message: 'Specifications must be an object' })
  specifications?: Record<string, any>;
  
  @IsOptional()
  @IsString({ message: 'Image URL must be a string' })
  @IsUrl({}, { message: 'Invalid URL format for image' })
  imageUrl?: string;
  
  @IsOptional()
  @IsBoolean({ message: 'isAvailable must be a boolean' })
  isAvailable?: boolean;
}