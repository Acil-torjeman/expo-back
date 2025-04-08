// src/plan/dto/associate-plan.dto.ts
import { IsNotEmpty, IsMongoId } from 'class-validator';

export class AssociatePlanDto {
  @IsNotEmpty({ message: 'Event ID is required' })
  @IsMongoId({ message: 'Invalid event ID format' })
  eventId: string;
}