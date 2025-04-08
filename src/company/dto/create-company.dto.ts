// src/company/dto/create-company.dto.ts
import { 
    IsNotEmpty, 
    IsString, 
    IsOptional,
    Matches
  } from 'class-validator';
  
  export class CreateCompanyDto {
    @IsNotEmpty({ message: 'Company name is required' })
    @IsString({ message: 'Company name must be a string' })
    companyName: string;
  
    @IsOptional()
    @IsString({ message: 'Trade name must be a string' })
    tradeName?: string;
  
    @IsNotEmpty({ message: 'Company address is required' })
    @IsString({ message: 'Company address must be a string' })
    companyAddress: string;
  
    @IsNotEmpty({ message: 'Postal code and city are required' })
    @IsString({ message: 'Postal code and city must be a string' })
    postalCity: string;
  
    @IsNotEmpty({ message: 'Country is required' })
    @IsString({ message: 'Country must be a string' })
    country: string;
  
    @IsNotEmpty({ message: 'Industry sector is required' })
    @IsString({ message: 'Sector must be a string' })
    sector: string;
    
    @IsNotEmpty({ message: 'Industry subsector is required' })
    @IsString({ message: 'Subsector must be a string' })
    subsector: string;
  
    @IsNotEmpty({ message: 'Registration number is required' })
    @IsString({ message: 'Registration number must be a string' })
    registrationNumber: string;
  
    @IsOptional()
    @IsString({ message: 'Company size must be a string' })
    companySize?: string;
  
    @IsOptional()
    @IsString({ message: 'Website must be a string' })
    website?: string;
  
    @IsNotEmpty({ message: 'Contact phone is required' })
    @Matches(/^[0-9]+$/, { message: 'Contact phone must contain only digits' })
    contactPhone: string;
    
    @IsNotEmpty({ message: 'Phone code is required' })
    @IsString({ message: 'Phone code must be a string' })
    contactPhoneCode: string;
  
    @IsOptional()
    @IsString({ message: 'Company description must be a string' })
    companyDescription?: string;
  }