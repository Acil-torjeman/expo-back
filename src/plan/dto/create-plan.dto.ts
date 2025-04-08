// src/plan/dto/create-plan.dto.ts
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreatePlanDto {
  @IsNotEmpty({ message: 'Plan name is required' })
  @IsString({ message: 'Plan name must be a string' })
  name: string;
  
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

}