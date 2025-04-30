// src/company/dto/update-company.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateCompanyDto } from './create-company.dto';
import { IsOptional, IsString } from 'class-validator';

export class UpdateCompanyDto extends PartialType(CreateCompanyDto) {
  // Add additional fields that can be updated but aren't in CreateCompanyDto
  @IsOptional()
  @IsString()
  companyLogoPath?: string;
  
  @IsOptional()
  @IsString()
  kbisDocumentPath?: string;
  
  @IsOptional()
  @IsString()
  insuranceCertificatePath?: string;
}