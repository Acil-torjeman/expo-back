import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { CreateStandDto } from './create-stand.dto';

export class UpdateStandDto extends PartialType(CreateStandDto) {
  @IsOptional()
  @IsString({ message: 'Status must be a string' })
  @IsIn(['available', 'reserved', 'occupied', 'maintenance', 'unavailable'], { 
    message: 'Status must be one of: available, reserved, occupied, maintenance, unavailable' 
  })
  status?: string;
}
