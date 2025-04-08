// src/organizer/dto/create-organizer.dto.ts
import { 
    IsNotEmpty, 
    IsString, 
    IsBoolean,
    IsOptional,
    IsMongoId,
    Matches
  } from 'class-validator';
  import { Transform } from 'class-transformer';
  
  export class CreateOrganizerDto {
    @IsNotEmpty({ message: 'User ID is required' })
    @IsMongoId({ message: 'Invalid user ID format' })
    user: string;
  
    @IsNotEmpty({ message: 'Organization name is required' })
    @IsString({ message: 'Organization name must be a string' })
    organizationName: string;
  
    @IsNotEmpty({ message: 'Organization address is required' })
    @IsString({ message: 'Organization address must be a string' })
    organizationAddress: string;
  
    @IsNotEmpty({ message: 'Postal code and city are required' })
    @IsString({ message: 'Postal code and city must be a string' })
    postalCity: string;
  
    @IsNotEmpty({ message: 'Country is required' })
    @IsString({ message: 'Country must be a string' })
    country: string;
  
    @IsNotEmpty({ message: 'Contact phone is required' })
    @Matches(/^[0-9]+$/, { message: 'Contact phone must contain only digits' })
    contactPhone: string;
    
    @IsNotEmpty({ message: 'Phone code is required' })
    @IsString({ message: 'Phone code must be a string' })
    contactPhoneCode: string;
    
    @IsOptional()
    @IsString({ message: 'Website must be a string' })
    website?: string;
    
    @IsOptional()
    @IsString({ message: 'Organization description must be a string' })
    organizationDescription?: string;
    
    @IsOptional()
    @IsString({ message: 'Organization logo path must be a string' })
    organizationLogoPath?: string;
  
    @IsNotEmpty({ message: 'Consent is required' })
    @Transform(({ value }) => value === 'true' || value === true)
    @IsBoolean({ message: 'Consent must be a boolean' })
    consent: boolean;
  
    @IsNotEmpty({ message: 'Data consent is required' })
    @Transform(({ value }) => value === 'true' || value === true)
    @IsBoolean({ message: 'Data consent must be a boolean' })
    dataConsent: boolean;
  }