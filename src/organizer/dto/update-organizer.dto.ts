// src/organizer/dto/update-organizer.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateOrganizerDto } from './create-organizer.dto';
import { IsOptional, IsString } from 'class-validator';

export class UpdateOrganizerDto extends PartialType(CreateOrganizerDto) {
  // Add the organizationLogoPath field explicitly
  @IsOptional()
  @IsString()
  organizationLogoPath?: string;
}