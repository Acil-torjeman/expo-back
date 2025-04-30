// src/user/dto/user-profile.dto.ts
import { IsEmail, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UpdateCompanyDto } from '../../company/dto/update-company.dto';
import { UpdateOrganizerDto } from '../../organizer/dto/update-organizer.dto';

export class UserProfileDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  // Exhibitor specific fields
  @IsOptional()
  @IsString()
  representativeFunction?: string;

  @IsOptional()
  @IsString()
  personalPhone?: string;

  @IsOptional()
  @IsString()
  personalPhoneCode?: string;

  // Company data for exhibitors
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCompanyDto)
  company?: UpdateCompanyDto;

  // Organization data for organizers
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateOrganizerDto)
  organization?: UpdateOrganizerDto;
}