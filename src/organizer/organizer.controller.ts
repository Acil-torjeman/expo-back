// src/organizer/organizer.controller.ts - Ajout d'endpoint signup
import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete,
  UseInterceptors,
  UploadedFiles,
  UseGuards,
  Logger,
  HttpStatus,
  HttpCode
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { OrganizerService } from './organizer.service';
import { CreateOrganizerDto } from './dto/create-organizer.dto';
import { UpdateOrganizerDto } from './dto/update-organizer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../user/entities/user.entity';
import { RolesGuard } from '../auth/guards/roles.guard';
import { File as MulterFile } from 'multer';

@Controller('organizer')
export class OrganizerController {
  private readonly logger = new Logger(OrganizerController.name);

  constructor(private readonly organizerService: OrganizerService) {}

  @Post('signup')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'organizationLogo', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: './uploads/organization-logos',
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
          // Allow only image files for logo
          if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
            return cb(
              new Error('Only JPG, PNG, and GIF files are allowed for the logo'), 
              false
            );
          }
          cb(null, true);
        },
        limits: {
          fileSize: 2 * 1024 * 1024, // 2MB file size limit for logos
        },
      }
    )
  )
  @HttpCode(HttpStatus.CREATED)
  async signup(
    @Body() organizerSignupDto: any, // Utiliser le DTO approprié
    @UploadedFiles()
    files: {
      organizationLogo?: MulterFile[];
    },
  ) {
    try {
      this.logger.log(`Received organizer signup request for email: ${organizerSignupDto.email}`);
      
      return await this.organizerService.signup(organizerSignupDto, files);
    } catch (error) {
      // Log the error for server-side tracking
      this.logger.error(`Organizer signup error for ${organizerSignupDto.email}: ${error.message}`, error.stack);
      throw error;
    }
  }
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createOrganizerDto: CreateOrganizerDto) {
    this.logger.log('Creating organizer');
    return this.organizerService.create(createOrganizerDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll() {
    this.logger.log('Getting all organizers');
    return this.organizerService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    this.logger.log(`Getting organizer with ID: ${id}`);
    return this.organizerService.findOne(+id);
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
  findByUserId(@Param('userId') userId: string) {
    this.logger.log(`Getting organizer for user ID: ${userId}`);
    return this.organizerService.findByUserId(userId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
  update(@Param('id') id: string, @Body() updateOrganizerDto: UpdateOrganizerDto) {
    this.logger.log(`Updating organizer with ID: ${id}`);
    return this.organizerService.update(id, updateOrganizerDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    this.logger.log(`Deleting organizer with ID: ${id}`);
    return this.organizerService.remove(+id);
  }
}