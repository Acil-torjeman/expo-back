// src/user/dto/update-user.dto.ts
import { IsEmail, IsEnum, IsOptional, IsString, MinLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole, UserStatus } from '../entities/user.entity';

export class UpdateUserDto {
  @IsOptional()
  @IsString({ message: 'Username must be a string' })
  username?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  @Transform(({ value }) => value?.trim().toLowerCase())
  email?: string;

  @IsOptional()
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, {
    message: 'Password must include at least one uppercase letter, one lowercase letter, one number, and one special character'
  })
  password?: string;

  @IsOptional()
  @IsEnum(UserRole, { message: 'Invalid user role' })
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus, { message: 'Invalid user status' })
  status?: UserStatus;
 
  avatar?: string;
  
}