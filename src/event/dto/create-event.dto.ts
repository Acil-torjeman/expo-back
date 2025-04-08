// src/event/dto/create-event.dto.ts
import { Type } from 'class-transformer';
import { 
  IsNotEmpty, 
  IsString, 
  IsOptional, 
  IsArray, 
  ValidateNested, 
  IsNumber, 
  Min, 
  IsDateString,
  IsEnum,
  ArrayMinSize,
  IsMongoId,
} from 'class-validator';
import { EventStatus, EventVisibility } from '../entities/event.entity';

export class LocationDto {
  @IsNotEmpty({ message: 'Address is required' })
  @IsString({ message: 'Address must be a string' })
  address: string;
  
  @IsNotEmpty({ message: 'City is required' })
  @IsString({ message: 'City must be a string' })
  city: string;
  
  @IsNotEmpty({ message: 'Postal code is required' })
  @IsString({ message: 'Postal code must be a string' })
  postalCode: string;
  
  @IsNotEmpty({ message: 'Country is required' })
  @IsString({ message: 'Country must be a string' })
  country: string;
}

export class CreateEventDto {
  @IsNotEmpty({ message: 'Event name is required' })
  @IsString({ message: 'Event name must be a string' })
  name: string;
  
  @IsNotEmpty({ message: 'Event type is required' })
  @IsString({ message: 'Event type must be a string' })
  type: string;
  
  @IsNotEmpty({ message: 'Description is required' })
  @IsString({ message: 'Description must be a string' })
  description: string;
  
  @IsNotEmpty({ message: 'Start date is required' })
  @IsDateString({}, { message: 'Start date must be a valid ISO date string' })
  startDate: string;
  
  @IsNotEmpty({ message: 'End date is required' })
  @IsDateString({}, { message: 'End date must be a valid ISO date string' })
  endDate: string;
  
  @IsNotEmpty({ message: 'Opening hours are required' })
  @IsString({ message: 'Opening hours must be a string' })
  openingHours: string;
  
  @IsNotEmpty({ message: 'Location is required' })
  @ValidateNested()
  @Type(() => LocationDto)
  location: LocationDto;
  
  @IsNotEmpty({ message: 'Allowed sectors are required' })
  @IsArray({ message: 'Allowed sectors must be an array' })
  @IsString({ each: true, message: 'Each sector must be a string' })
  @ArrayMinSize(1, { message: 'At least one sector must be selected' })
  allowedSectors: string[];
  
  @IsNotEmpty({ message: 'Allowed subsectors are required' })
  @IsArray({ message: 'Allowed subsectors must be an array' })
  @IsString({ each: true, message: 'Each subsector must be a string' })
  @ArrayMinSize(1, { message: 'At least one subsector must be selected' })
  allowedSubsectors: string[];
  
  @IsOptional()
  @IsArray({ message: 'Allowed countries must be an array' })
  @IsString({ each: true, message: 'Each country must be a string' })
  allowedCountries?: string[];
  
  @IsOptional()
  @IsNumber({}, { message: 'Maximum exhibitors must be a number' })
  @Min(1, { message: 'Maximum exhibitors must be at least 1' })
  maxExhibitors?: number;
  
  @IsNotEmpty({ message: 'Registration deadline is required' })
  @IsDateString({}, { message: 'Registration deadline must be a valid ISO date string' })
  registrationDeadline: string;
  
  @IsOptional()
  @IsMongoId({ message: 'Plan ID must be a valid MongoDB ID' })
  planId?: string | null;
  
  @IsOptional()
  @IsEnum(EventStatus, { message: 'Invalid event status' })
  status?: EventStatus;
  
  @IsOptional()
  @IsEnum(EventVisibility, { message: 'Invalid event visibility' })
  visibility?: EventVisibility;
  
  @IsOptional()
  @IsString({ message: 'Special conditions must be a string' })
  specialConditions?: string;
  

  @IsOptional()
  @IsArray({ message: 'Equipment IDs must be an array' })
  @IsMongoId({ each: true, message: 'Each equipment ID must be a valid MongoDB ID' })
  equipmentIds?: string[];

}