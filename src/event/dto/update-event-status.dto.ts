import { IsNotEmpty, IsEnum, IsOptional, IsString } from 'class-validator';
import { EventStatus } from '../entities/event.entity';

export class UpdateEventStatusDto {
  @IsNotEmpty({ message: 'Status is required' })
  @IsEnum(EventStatus, { message: 'Invalid event status' })
  status: EventStatus;
  
  @IsOptional()
  @IsString({ message: 'Reason must be a string' })
  reason?: string;
}
