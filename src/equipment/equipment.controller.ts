// src/equipment/equipment.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
  Query,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Multer } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { EquipmentService } from './equipment.service';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';
import { AssociateEquipmentDto } from './dto/associate-equipment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../user/entities/user.entity';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('equipment')
export class EquipmentController {
  private readonly logger = new Logger(EquipmentController.name);
  private readonly uploadPath: string;

  constructor(private readonly equipmentService: EquipmentService) {
    // Set upload path for equipment images
    this.uploadPath = path.join(process.cwd(), '/uploads/equipment-images');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createEquipmentDto: CreateEquipmentDto, @Req() req) {
    this.logger.log(`Creating equipment: ${createEquipmentDto.name} by user ${req.user.id}`);
    return this.equipmentService.create(createEquipmentDto, req.user.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @Req() req,
    @Query('category') category?: string,
    @Query('isAvailable') isAvailable?: boolean,
    @Query('search') search?: string,
    @Query('currentUser') currentUser?: string
  ) {
    // If currentUser=true, get equipment for the current user
    if (currentUser === 'true' && req.user) {
      this.logger.log(`Getting equipment for current user: ${req.user.id}`);
      return this.equipmentService.findByOrganizer(req.user.id);
    }
    
    this.logger.log(`Getting all equipment with filters: ${JSON.stringify({ category, isAvailable, search })}`);
    return this.equipmentService.findAll(category, isAvailable, search);
  }

  @Get('event/:eventId')
  @UseGuards(JwtAuthGuard)
  findByEvent(@Param('eventId') eventId: string) {
    this.logger.log(`Getting equipment for event: ${eventId}`);
    return this.equipmentService.findByEvent(eventId);
  }

  @Get('available/:eventId')
  @UseGuards(JwtAuthGuard)
  getAvailableForEvent(@Param('eventId') eventId: string) {
    this.logger.log(`Getting available equipment for event: ${eventId}`);
    return this.equipmentService.getAvailableForEvent(eventId);
  }

  @Get('organizer/:organizerId')
  @UseGuards(JwtAuthGuard)
  findByOrganizer(@Param('organizerId') organizerId: string) {
    this.logger.log(`Getting equipment for organizer: ${organizerId}`);
    return this.equipmentService.findByOrganizer(organizerId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    // Only process if id is a valid ObjectId (24 character hex string)
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      this.logger.log(`Getting equipment with ID: ${id}`);
      return this.equipmentService.findOne(id);
    }
    
    // If not a valid ObjectId, return error response
    this.logger.warn(`Invalid equipment ID format: ${id}`);
    throw new BadRequestException(`Invalid ID format: ${id}`);
  }

  @Get(':id/available-quantity/:eventId')
@UseGuards(JwtAuthGuard)
async getAvailableQuantity(
  @Param('id') id: string,
  @Param('eventId') eventId: string
) {
  this.logger.log(`Getting available quantity for equipment ${id} in event ${eventId}`);
  const quantity = await this.equipmentService.getAvailableQuantity(id, eventId);
  return { availableQuantity: quantity };
}
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  update(
    @Param('id') id: string,
    @Body() updateEquipmentDto: UpdateEquipmentDto,
    @Req() req
  ) {
    // Detailed logging for debugging purposes
    this.logger.log(`Updating equipment ${id} - User ID: ${req.user.id}, Role: ${req.user.role}`);
    return this.equipmentService.update(id, updateEquipmentDto, req.user.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @Req() req) {
    // Detailed logging for debugging purposes
    this.logger.log(`Deleting equipment ${id} - User ID: ${req.user.id}, Role: ${req.user.role}`);
    return this.equipmentService.remove(id, req.user.id);
  }

  @Post(':id/upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: './uploads/equipment-images',
        filename: (_req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          return cb(
            null, 
            `${randomName}${extname(file.originalname)}`
          );
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
          return cb(
            new Error('Only image files are allowed'), 
            false
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    })
  )
  uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Multer.File,
    @Req() req,
  ) {
    this.logger.log(`Uploading image for equipment ${id} - User ID: ${req.user.id}, Role: ${req.user.role}`);
    return this.equipmentService.uploadImage(id, file, req.user.id);
  }
  
  @Post(':id/associate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @HttpCode(HttpStatus.OK)
  associateWithEvent(
    @Param('id') id: string,
    @Body() associateDto: AssociateEquipmentDto,
    @Req() req
  ) {
    this.logger.log(`Associating equipment ${id} with event ${associateDto.eventId} - User ID: ${req.user.id}, Role: ${req.user.role}`);
    return this.equipmentService.associateWithEvent(
      id, 
      associateDto, 
      req.user.id,
      req.user.role
    );
  }
  
  @Delete(':id/dissociate/:eventId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @HttpCode(HttpStatus.OK)
  dissociateFromEvent(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @Req() req
  ) {
    this.logger.log(`Dissociating equipment ${id} from event ${eventId} - User ID: ${req.user.id}, Role: ${req.user.role}`);
    return this.equipmentService.dissociateFromEvent(
      id, 
      eventId, 
      req.user.id,
      req.user.role
    );
  }
}