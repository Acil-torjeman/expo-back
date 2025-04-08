import { IsNotEmpty, IsString, IsIn, IsOptional } from 'class-validator';

export class UpdateStandStatusDto {
  @IsNotEmpty({ message: 'Status is required' })
  @IsString({ message: 'Status must be a string' })
  @IsIn(['available', 'reserved', 'occupied', 'maintenance', 'unavailable'], { 
    message: 'Status must be one of: available, reserved, occupied, maintenance, unavailable' 
  })
  status: string;
  
  @IsOptional()
  @IsString({ message: 'Reason must be a string' })
  reason?: string;
}
