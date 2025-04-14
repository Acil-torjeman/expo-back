// src/registration/dto/select-stands.dto.ts
import { IsNotEmpty, IsArray, IsMongoId, IsOptional, IsBoolean } from 'class-validator';

export class SelectStandsDto {
  @IsNotEmpty({ message: 'Stand IDs are required' })
  @IsArray({ message: 'Stand IDs must be an array' })
  @IsMongoId({ each: true, message: 'Each stand ID must be a valid MongoDB ID' })
  standIds: string[];

  @IsOptional()
  @IsBoolean({ message: 'Stand selection completed must be a boolean' })
  selectionCompleted?: boolean;
}