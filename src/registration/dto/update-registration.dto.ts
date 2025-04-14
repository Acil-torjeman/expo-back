// src/registration/dto/update-registration.dto.ts
import { IsEnum, IsString, IsOptional, IsMongoId, IsArray, IsBoolean } from 'class-validator';
import { RegistrationStatus } from '../entities/registration.entity';

export class UpdateRegistrationDto {
  @IsOptional()
  @IsEnum(RegistrationStatus, { message: 'Invalid registration status' })
  status?: RegistrationStatus;

  @IsOptional()
  @IsString({ message: 'Participation note must be a string' })
  participationNote?: string;

  @IsOptional()
  @IsString({ message: 'Rejection reason must be a string' })
  rejectionReason?: string;

  @IsOptional()
  @IsArray({ message: 'Stands must be an array' })
  @IsMongoId({ each: true, message: 'Each stand ID must be a valid MongoDB ID' })
  standIds?: string[];

  @IsOptional()
  @IsArray({ message: 'Equipment must be an array' })
  @IsMongoId({ each: true, message: 'Each equipment ID must be a valid MongoDB ID' })
  equipmentIds?: string[];

  @IsOptional()
  @IsBoolean({ message: 'Stand selection completed must be a boolean' })
  standSelectionCompleted?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Equipment selection completed must be a boolean' })
  equipmentSelectionCompleted?: boolean;
}