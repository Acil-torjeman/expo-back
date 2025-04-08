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
  BadRequestException,
} from '@nestjs/common';
import { Multer } from 'multer';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { PlanService } from './plan.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { AssociatePlanDto } from './dto/associate-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../user/entities/user.entity';

@Controller('plans')
export class PlanController {
  private readonly logger = new Logger(PlanController.name);

  constructor(private readonly planService: PlanService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @UseInterceptors(
    FileInterceptor('pdfFile', {
      storage: diskStorage({
        destination: './uploads/plans',
        filename: (req, file, cb) => {
          // Generate unique filename
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
      fileFilter: (req, file, cb) => {
        // Allow only PDF files
        if (file.mimetype !== 'application/pdf') {
          return cb(
            new Error('Only PDF files are allowed'), 
            false
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB size limit
      },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() createPlanDto: CreatePlanDto,
    @UploadedFile() pdfFile: Multer.File,
    @Req() req
  ) {
    this.logger.log(`Creating plan: ${createPlanDto.name}`);
    
    if (!pdfFile) {
      throw new BadRequestException('PDF file is required');
    }
    
    // Ensure userId is a string
    const userId = typeof req.user.id === 'string' ? req.user.id : req.user.id.toString();
    
    return this.planService.createWithPdf(createPlanDto, pdfFile, userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Query('search') search?: string) {
    this.logger.log(`Getting all plans${search ? ' with search: ' + search : ''}`);
    return this.planService.findAll(search);
  }

  @Get('organizer/:organizerId')
  @UseGuards(JwtAuthGuard)
  findByOrganizer(@Param('organizerId') organizerId: string) {
    this.logger.log(`Getting plans for organizer: ${organizerId}`);
    return this.planService.findByOrganizer(organizerId);
  }

  @Get('event/:eventId')
  @UseGuards(JwtAuthGuard)
  findByEvent(@Param('eventId') eventId: string) {
    this.logger.log(`Getting plans for event: ${eventId}`);
    return this.planService.findByEvent(eventId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    this.logger.log(`Getting plan with ID: ${id}`);
    return this.planService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @UseInterceptors(
    FileInterceptor('pdfFile', {
      storage: diskStorage({
        destination: './uploads/plans',
        filename: (req, file, cb) => {
          // Generate unique filename
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
      fileFilter: (req, file, cb) => {
        // Allow only PDF files
        if (file.mimetype !== 'application/pdf') {
          return cb(
            new Error('Only PDF files are allowed'), 
            false
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB size limit
      },
    }),
  )
  update(
    @Param('id') id: string,
    @Body() updatePlanDto: UpdatePlanDto,
    @UploadedFile() pdfFile: Multer.File,
    @Req() req,
  ) {
    // Manual conversion for backward compatibility and additional safety
    if (updatePlanDto.isActive !== undefined) {
      if (typeof updatePlanDto.isActive === 'string') {
        updatePlanDto.isActive = updatePlanDto.isActive === 'true';
      }
    }
    
    this.logger.log(`Updating plan with ID: ${id}`);
    
    // Ensure userId is a string
    const userId = typeof req.user.id === 'string' ? req.user.id : req.user.id.toString();
    
    return this.planService.update(id, updatePlanDto, pdfFile, userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @Req() req) {
    this.logger.log(`Deleting plan with ID: ${id}`);
    
    // Ensure userId is a string
    const userId = typeof req.user.id === 'string' ? req.user.id : req.user.id.toString();
    
    return this.planService.remove(id, userId);
  }

  @Post(':id/associate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  associateWithEvent(
    @Param('id') id: string,
    @Body() associateDto: AssociatePlanDto,
    @Req() req,
  ) {
    this.logger.log(`Associating plan ${id} with event ${associateDto.eventId}`);
    
    // Ensure userId is a string
    const userId = typeof req.user.id === 'string' ? req.user.id : req.user.id.toString();
    
    return this.planService.associateWithEvent(id, associateDto.eventId, userId);
  }

  @Delete(':id/dissociate/:eventId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  dissociateFromEvent(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @Req() req,
  ) {
    this.logger.log(`Dissociating plan ${id} from event ${eventId}`);
    
    // Ensure userId is a string
    const userId = typeof req.user.id === 'string' ? req.user.id : req.user.id.toString();
    
    return this.planService.dissociateFromEvent(id, eventId, userId);
  }
}