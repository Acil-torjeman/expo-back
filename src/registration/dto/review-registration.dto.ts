// src/registration/dto/review-registration.dto.ts
import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';
import { RegistrationStatus } from '../entities/registration.entity';

export class ReviewRegistrationDto {
  @IsNotEmpty({ message: 'Status is required' })
  @IsEnum(RegistrationStatus, { 
    message: 'Invalid status. Must be either approved or rejected' 
  })
  status: RegistrationStatus.APPROVED | RegistrationStatus.REJECTED;

  @IsOptional()
  @IsString({ message: 'Reason must be a string' })
  reason?: string;
}