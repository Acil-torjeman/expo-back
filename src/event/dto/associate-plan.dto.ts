import { IsNotEmpty, IsMongoId, IsOptional, IsObject } from 'class-validator';

export class AssociatePlanDto {
  @IsNotEmpty({ message: 'Plan ID is required' })
  @IsMongoId({ message: 'Invalid plan ID format' })
  planId: string;
  
  @IsOptional()
  @IsObject({ message: 'Stand pricing must be an object' })
  standPricing?: Record<string, number>;
}
