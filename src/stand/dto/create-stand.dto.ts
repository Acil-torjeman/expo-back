// src/stand/dto/create-stand.dto.ts
import { IsNotEmpty, IsString, IsNumber, Min, IsMongoId, IsOptional, IsArray } from 'class-validator';

export class CreateStandDto {
  @IsNotEmpty({ message: 'Stand number is required' })
  @IsString({ message: 'Stand number must be a string' })
  number: string;
  
  @IsNotEmpty({ message: 'Plan ID is required' })
  @IsMongoId({ message: 'Invalid plan ID format' })
  plan: string;
  
  @IsNotEmpty({ message: 'Area is required' })
  @IsNumber({}, { message: 'Area must be a number' })
  @Min(0, { message: 'Area cannot be negative' })
  area: number;
  
  @IsNotEmpty({ message: 'Base price is required' })
  @IsNumber({}, { message: 'Base price must be a number' })
  @Min(0, { message: 'Base price cannot be negative' })
  basePrice: number;
  
  @IsNotEmpty({ message: 'Type is required' })
  @IsString({ message: 'Type must be a string' })
  type: string;
  
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;
  
  @IsOptional()
  @IsArray({ message: 'Features must be an array' })
  @IsString({ each: true, message: 'Each feature must be a string' })
  features?: string[];
}