import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Query,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { StandService } from './stand.service';
import { CreateStandDto } from './dto/create-stand.dto';
import { UpdateStandDto } from './dto/update-stand.dto';
import { UpdateStandStatusDto } from './dto/update-stand-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../user/entities/user.entity';

@Controller('stands')
export class StandController {
  private readonly logger = new Logger(StandController.name);

  constructor(private readonly standService: StandService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createStandDto: CreateStandDto, @Req() req) {
    this.logger.log(`Creating stand: ${createStandDto.number} for plan ${createStandDto.plan}`);
    
    // Ensure userId is a string - this was missing compared to plan controller
    const userId = typeof req.user.id === 'string' ? req.user.id : req.user.id.toString();
    
    return this.standService.create(createStandDto, userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    this.logger.log(`Getting all stands with filters: ${JSON.stringify({ type, status, search })}`);
    return this.standService.findAll(type, status, search);
  }

  @Get('plan/:planId')
  @UseGuards(JwtAuthGuard)
  findByPlan(@Param('planId') planId: string) {
    this.logger.log(`Getting stands for plan: ${planId}`);
    return this.standService.findByPlan(planId);
  }

  @Get('event/:eventId')
  @UseGuards(JwtAuthGuard)
  findByEvent(@Param('eventId') eventId: string) {
    this.logger.log(`Getting stands for event: ${eventId}`);
    return this.standService.findByEvent(eventId);
  }

  @Get('available/event/:eventId')
  @UseGuards(JwtAuthGuard)
  findAvailableForEvent(@Param('eventId') eventId: string) {
    this.logger.log(`Getting available stands for event: ${eventId}`);
    return this.standService.findAvailableByEvent(eventId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    this.logger.log(`Getting stand with ID: ${id}`);
    return this.standService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  update(
    @Param('id') id: string,
    @Body() updateStandDto: UpdateStandDto,
    @Req() req,
  ) {
    this.logger.log(`Updating stand with ID: ${id}`);
    
    // Ensure userId is a string here too
    const userId = typeof req.user.id === 'string' ? req.user.id : req.user.id.toString();
    
    return this.standService.update(id, updateStandDto, userId);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  updateStatus(
    @Param('id') id: string,
    @Body() updateStandStatusDto: UpdateStandStatusDto,
    @Req() req,
  ) {
    this.logger.log(`Updating status of stand ${id} to ${updateStandStatusDto.status}`);
    
    // Ensure userId is a string here too
    const userId = typeof req.user.id === 'string' ? req.user.id : req.user.id.toString();
    
    return this.standService.updateStatus(id, updateStandStatusDto, userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @Req() req) {
    this.logger.log(`Deleting stand with ID: ${id}`);
    
    // Ensure userId is a string here too
    const userId = typeof req.user.id === 'string' ? req.user.id : req.user.id.toString();
    
    return this.standService.remove(id, userId);
  }
}