// src/exhibitor/dto/exhibitor-signup.dto.ts
import { 
    IsEmail, 
    IsNotEmpty, 
    IsString, 
    MinLength, 
    IsBoolean, 
    IsOptional,
    Matches
  } from 'class-validator';
  import { Transform } from 'class-transformer';
  
  export class ExhibitorSignupDto {
    // Company information
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
  
    // Representative information
    @IsNotEmpty({ message: 'Username is required' })
    @IsString({ message: 'Username must be a string' })
    username: string;
  
    @IsNotEmpty({ message: 'Representative function is required' })
    @IsString({ message: 'Representative function must be a string' })
    representativeFunction: string;
  
    @IsNotEmpty({ message: 'Personal phone is required' })
    @Matches(/^[0-9]+$/, { message: 'Personal phone must contain only digits' })
    personalPhone: string;
  
    @IsNotEmpty({ message: 'Phone code is required' })
    @IsString({ message: 'Phone code must be a string' })
    personalPhoneCode: string;
  
    // Account information 
    @IsNotEmpty({ message: 'Email is required' })
    @IsEmail({}, { message: 'Invalid email format' })
    @Transform(({ value }) => value?.trim().toLowerCase())
    email: string;
  
    @IsNotEmpty({ message: 'Password is required' })
    @IsString({ message: 'Password must be a string' })
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, {
      message: 'Password must include at least one uppercase letter, one lowercase letter, one number, and one special character'
    })
    password: string;
  
    @IsNotEmpty({ message: 'Consent is required' })
    @Transform(({ value }) => value === 'true' || value === true)
    @IsBoolean({ message: 'Consent must be a boolean' })
    consent: boolean;
  
    @IsNotEmpty({ message: 'Data consent is required' })
    @Transform(({ value }) => value === 'true' || value === true)
    @IsBoolean({ message: 'Data consent must be a boolean' })
    dataConsent: boolean;
  }