// src/exhibitor/exhibitor.controller.ts - Ajout d'endpoint signup
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
  HttpStatus,
  HttpCode,
  UseInterceptors,
  UploadedFiles
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ExhibitorService } from './exhibitor.service';
import { CreateExhibitorDto } from './dto/create-exhibitor.dto';
import { UpdateExhibitorDto } from './dto/update-exhibitor.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../user/entities/user.entity';
import { RolesGuard } from '../auth/guards/roles.guard';
import { File as MulterFile } from 'multer';

@Controller('exhibitor')
export class ExhibitorController {
  private readonly logger = new Logger(ExhibitorController.name);

  constructor(private readonly exhibitorService: ExhibitorService) {}

  @Post('signup')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'kbisDocument', maxCount: 1 },
        { name: 'companyLogo', maxCount: 1 },
        { name: 'insuranceCertificate', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: './uploads/exhibitor-documents',
          filename: (_req, file, cb) => {
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
        fileFilter: (_req, file, cb) => {
          // Allow only specific file types
          if (!file.originalname.match(/\.(pdf|jpg|jpeg|png)$/)) {
            return cb(
              new Error('Only PDF, JPG, and PNG files are allowed'), 
              false
            );
          }
          cb(null, true);
        },
        limits: {
          fileSize: 5 * 1024 * 1024, // 5MB file size limit
        },
      }
    )
  )
  @HttpCode(HttpStatus.CREATED)
  async signup(
    @Body() exhibitorSignupDto: any, // Utiliser le DTO approprié 
    @UploadedFiles()
    files: {
      kbisDocument?: MulterFile[];
      companyLogo?: MulterFile[];
      insuranceCertificate?: MulterFile[];
    },
  ) {
    try {
      this.logger.log(`Received signup request for email: ${exhibitorSignupDto.email}`);
      
      return await this.exhibitorService.signup(exhibitorSignupDto, files);
    } catch (error) {
      // Log the error for server-side tracking
      this.logger.error(`Signup error for ${exhibitorSignupDto.email}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createExhibitorDto: CreateExhibitorDto) {
    this.logger.log('Creating exhibitor');
    return this.exhibitorService.create(createExhibitorDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
  findAll() {
    this.logger.log('Getting all exhibitors');
    return this.exhibitorService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    this.logger.log(`Getting exhibitor with ID: ${id}`);
    return this.exhibitorService.findOne(id);
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
  findByUserId(@Param('userId') userId: string) {
    this.logger.log(`Getting exhibitor for user ID: ${userId}`);
    return this.exhibitorService.findByUserId(userId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ORGANIZER, UserRole.EXHIBITOR)
  update(@Param('id') id: string, @Body() updateExhibitorDto: UpdateExhibitorDto) {
    this.logger.log(`Updating exhibitor with ID: ${id}`);
    return this.exhibitorService.update(id, updateExhibitorDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    this.logger.log(`Deleting exhibitor with ID: ${id}`);
    return this.exhibitorService.remove(id);
  }
}

function Req(): (target: ExhibitorController, propertyKey: "findCurrent", parameterIndex: 0) => void {
  throw new Error('Function not implemented.');
  
}
