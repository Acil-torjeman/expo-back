// src/user/user.controller.ts
import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
  Query,
  Post
} from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, UserStatus } from './entities/user.entity';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('users')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(private readonly userService: UserService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll(
    @Query('search') search?: string,
    @Query('status') status?: UserStatus,
    @Query('role') role?: UserRole,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    this.logger.log(`Getting users with filters: ${JSON.stringify({ search, status, role, startDate, endDate, includeDeleted })}`);
    const includeDeletedBool = includeDeleted === 'true';
    return this.userService.findAll(search, status, role, startDate, endDate, includeDeletedBool);
  }

  @Get('trash')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAllDeleted(
    @Query('search') search?: string,
    @Query('role') role?: UserRole,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    this.logger.log(`Getting deleted users with filters: ${JSON.stringify({ search, role, startDate, endDate })}`);
    return this.userService.findAllDeleted(search, role, startDate, endDate);
  }

  @Get('by-role/:role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findByRole(@Param('role') role: UserRole) {
    this.logger.log(`Getting users with role: ${role}`);
    return this.userService.findByRole(role);
  }

  @Get('by-status/:status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findByStatus(@Param('status') status: UserStatus) {
    this.logger.log(`Getting users with status: ${status}`);
    return this.userService.findByStatus(status);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    this.logger.log(`Getting user with ID: ${id}`);
    return this.userService.findOne(id);
  }

  @Get('email/:email')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findByEmail(@Param('email') email: string) {
    this.logger.log(`Getting user with email: ${email}`);
    return this.userService.findByEmail(email);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    this.logger.log(`Updating user with ID: ${id}`);
    return this.userService.update(id, updateUserDto);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateStatus(
    @Param('id') id: string, 
    @Query('status') status: UserStatus
  ) {
    this.logger.log(`Updating status for user with ID: ${id} to ${status}`);
    return this.userService.updateStatus(id, status);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    this.logger.log(`Soft-deleting user with ID: ${id}`);
    return this.userService.remove(id);
  }

  @Post(':id/restore')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  restore(@Param('id') id: string) {
    this.logger.log(`Restoring user with ID: ${id} from trash`);
    return this.userService.restoreUser(id);
  }

  @Delete(':id/permanent')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  permanentDelete(@Param('id') id: string) {
    this.logger.log(`Permanently deleting user with ID: ${id}`);
    return this.userService.permanentlyDeleteUser(id);
  }
}