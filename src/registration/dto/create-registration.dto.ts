// src/registration/dto/create-registration.dto.ts
import { IsNotEmpty, IsString, IsOptional, IsMongoId } from 'class-validator';

export class CreateRegistrationDto {
  @IsNotEmpty({ message: 'Event ID is required' })
  @IsMongoId({ message: 'Invalid event ID format' })
  eventId: string;

  @IsOptional()
  @IsString({ message: 'Participation note must be a string' })
  participationNote?: string;
}