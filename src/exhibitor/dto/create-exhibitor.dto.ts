// src/exhibitor/dto/create-exhibitor.dto.ts
import { 
    IsNotEmpty, 
    IsString, 
    IsBoolean,
    Matches,
    IsMongoId
  } from 'class-validator';
  import { Transform } from 'class-transformer';
  
  export class CreateExhibitorDto {
    @IsNotEmpty({ message: 'User ID is required' })
    @IsMongoId({ message: 'Invalid user ID format' })
    user: string;
  
    @IsNotEmpty({ message: 'Company ID is required' })
    @IsMongoId({ message: 'Invalid company ID format' })
    company: string;
  
    @IsNotEmpty({ message: 'Representative function is required' })
    @IsString({ message: 'Representative function must be a string' })
    representativeFunction: string;
  
    @IsNotEmpty({ message: 'Personal phone is required' })
    @Matches(/^[0-9]+$/, { message: 'Personal phone must contain only digits' })
    personalPhone: string;
  
    @IsNotEmpty({ message: 'Phone code is required' })
    @IsString({ message: 'Phone code must be a string' })
    personalPhoneCode: string;
  
    @IsNotEmpty({ message: 'Consent is required' })
    @Transform(({ value }) => value === 'true' || value === true)
    @IsBoolean({ message: 'Consent must be a boolean' })
    consent: boolean;
  
    @IsNotEmpty({ message: 'Data consent is required' })
    @Transform(({ value }) => value === 'true' || value === true)
    @IsBoolean({ message: 'Data consent must be a boolean' })
    dataConsent: boolean;
  }