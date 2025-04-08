// src/event/event.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  Query,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { Multer } from 'multer';
import { extname } from 'path';
import { EventService } from './event.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../user/entities/user.entity';

@Controller('events')
export class EventController {
  private readonly logger = new Logger(EventController.name);

  constructor(private readonly eventService: EventService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createEventDto: CreateEventDto, @Req() req) {
    this.logger.log(`Creating event: ${createEventDto.name}`);
    
    // Ensure userId is a string - very important for consistent ID handling
    const userId = String(req.user.id).trim();
    
    this.logger.log(`User ID from request: ${userId}`);
    return this.eventService.create(createEventDto, userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('upcoming') upcoming?: string,
  ) {
    this.logger.log(`Getting all events with filters: ${JSON.stringify({ search, status, upcoming })}`);
 
    const isUpcoming = upcoming === 'true';
    
    return this.eventService.findAll(search, status, isUpcoming);
  }

  @Get('organizer/:organizerId')
  @UseGuards(JwtAuthGuard)
  findByOrganizer(@Param('organizerId') organizerId: string) {
    this.logger.log(`Getting events for organizer: ${organizerId}`);
    return this.eventService.findByOrganizer(organizerId);
  }

  @Get('dashboard/organizer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  getOrganizerDashboard(@Req() req) {
    // Ensure userId is a string
    const userId = String(req.user.id).trim();
    
    this.logger.log(`Getting dashboard data for organizer: ${userId}`);
    return this.eventService.getOrganizerDashboard(userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    this.logger.log(`Getting event with ID: ${id}`);
    return this.eventService.findOne(id);
  }

  @Post(':id/upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/events',
        filename: (_req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          return cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
          return cb(new Error('Only image files are allowed'), false);
        }
        cb(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  )
  uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Multer.File,
    @Req() req,
  ) {
    // Ensure userId is a string
    const userId = String(req.user.id).trim();
    
    this.logger.log(`Uploading image for event ${id} by user ${userId}`);
    return this.eventService.uploadImage(id, file, userId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  update(
    @Param('id') id: string,
    @Body() updateEventDto: UpdateEventDto,
    @Req() req,
  ) {
    // Ensure userId is a string
    const userId = String(req.user.id).trim();
    
    this.logger.log(`Updating event with ID: ${id} by user ${userId}`);
    return this.eventService.update(id, updateEventDto, userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @Req() req) {
    // Ensure userId is a string
    const userId = String(req.user.id).trim();
    
    this.logger.log(`Deleting event with ID: ${id} by user ${userId}`);
    return this.eventService.remove(id, userId);
  }

  @Get(':id/stands')
  @UseGuards(JwtAuthGuard)
  findStands(@Param('id') id: string) {
    this.logger.log(`Getting stands for event: ${id}`);
    return this.eventService.findStands(id);
  }

  @Get(':id/stands/available')
  @UseGuards(JwtAuthGuard)
  findAvailableStands(@Param('id') id: string) {
    this.logger.log(`Getting available stands for event: ${id}`);
    return this.eventService.findAvailableStands(id);
  }

  @Get(':id/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  getEventStats(@Param('id') id: string, @Req() req) {
    this.logger.log(`Getting statistics for event: ${id}`);
    // No userId needed for this operation
    return this.eventService.getEventStats(id);
  }

  @Post(':id/plan')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  associatePlan(
    @Param('id') id: string,
    @Body() body: { planId: string },
    @Req() req,
  ) {
    // Ensure userId is a string
    const userId = String(req.user.id).trim();
    
    this.logger.log(`User ${userId} associating plan ${body.planId} with event ${id}`);
    return this.eventService.associatePlan(id, body.planId, userId);
  }

  @Delete(':id/plan')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  dissociatePlan(
    @Param('id') id: string,
    @Req() req,
  ) {
    // Ensure userId is a string
    const userId = String(req.user.id).trim();
    
    this.logger.log(`User ${userId} dissociating plan from event ${id}`);
    return this.eventService.dissociatePlan(id, userId);
  }
}