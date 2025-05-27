// src/registration/registration.controller.ts
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
  NotFoundException,
  InternalServerErrorException,
  ForbiddenException,
} from '@nestjs/common';
import { RegistrationService } from './registration.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { UpdateRegistrationDto } from './dto/update-registration.dto';
import { ReviewRegistrationDto } from './dto/review-registration.dto';
import { SelectStandsDto } from './dto/select-stands.dto';
import { SelectEquipmentDto } from './dto/select-equipment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { User, UserRole } from '../user/entities/user.entity';
import { IsPublic } from '../auth/decorators/public.decorator';
import { ExhibitorService } from '../exhibitor/exhibitor.service';
import { Registration } from './entities/registration.entity';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OrganizerService } from '../organizer/organizer.service';
import { Exhibitor } from '../exhibitor/entities/exhibitor.entity';
import { Organizer } from '../organizer/entities/organizer.entity';

@Controller('registrations')
export class RegistrationController {
  private readonly logger = new Logger(RegistrationController.name);

 constructor(
  private readonly registrationService: RegistrationService,
  private readonly exhibitorService: ExhibitorService,
  private readonly organizerService: OrganizerService, 
  @InjectModel(Registration.name) private readonly registrationModel: Model<Registration>,
) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EXHIBITOR)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createRegistrationDto: CreateRegistrationDto, @Req() req) {
    this.logger.log(`Creating registration for user: ${req.user.id}`);
    
    try {
      // Create registration using user ID
      return await this.registrationService.create(createRegistrationDto, req.user.id);
    } catch (error) {
      this.logger.error(`Error creating registration: ${error.message}`);
      throw error;
    }
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Req() req,
    @Query('exhibitorId') exhibitorId?: string,
    @Query('eventId') eventId?: string,
    @Query('status') status?: string
  ) {
    const filters = { exhibitorId, eventId, status };
    
    this.logger.log(`Getting registrations with filters: ${JSON.stringify(filters)}`);
    
    // Exhibitors can only view their own registrations
    if (req.user.role === UserRole.EXHIBITOR) {
      try {
        const exhibitor = await this.exhibitorService.findByUserId(req.user.id);
        if (exhibitor) {
          filters.exhibitorId = (exhibitor._id as unknown as Types.ObjectId).toString();
        }
      } catch (error) {
        this.logger.error(`Error finding exhibitor: ${error.message}`);
        return [];
      }
    }
    
    return this.registrationService.findAll(filters);
  }

  @Get('my-registrations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EXHIBITOR)
  async findMyRegistrations(@Req() req) {
    this.logger.log(`Getting registrations for user: ${req.user.id}`);
    
    try {
      // Get exhibitor ID from user ID
      const exhibitor = await this.exhibitorService.findByUserId(req.user.id);
      
      if (!exhibitor) {
        return [];
      }
      
      // Get registrations for this exhibitor
      const registrations = await this.registrationModel.find({ 
        exhibitor: exhibitor._id as unknown as Types.ObjectId 
      })
      .populate('event')
      .populate('stands')
      .populate('equipment')
      .sort({ createdAt: -1 })
      .exec();
      
      return registrations;
    } catch (error) {
      this.logger.error(`Error finding exhibitor registrations: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch your registrations');
    }
  }

  @Get('check/:eventId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EXHIBITOR)
  @HttpCode(HttpStatus.OK)
  async checkRegistration(@Param('eventId') eventId: string, @Req() req) {
    this.logger.log(`Checking if user ${req.user.id} is registered for event ${eventId}`);
    
    try {
      // First get the exhibitor linked to this user
      const exhibitor = await this.exhibitorService.findByUserId(req.user.id);
      
      if (!exhibitor) {
        return { registered: false, registration: null };
      }
      
      // Look for a registration for this exhibitor and event
      const registrations = await this.registrationModel.find({
        exhibitor: exhibitor._id as unknown as Types.ObjectId,
        event: new Types.ObjectId(eventId)
      })
      .populate('event', 'name startDate endDate')
      .populate('exhibitor')
      .exec();
      
      if (registrations.length > 0) {
        return { registered: true, registration: registrations[0] };
      }
      
      return { registered: false, registration: null };
    } catch (error) {
      this.logger.error(`Error checking registration: ${error.message}`);
      throw new InternalServerErrorException('Failed to check registration status');
    }
  }

  @Get('event/:eventId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  findByEvent(@Param('eventId') eventId: string) {
    this.logger.log(`Getting registrations for event: ${eventId}`);
    return this.registrationService.findByEvent(eventId);
  }

  @Get('event/:eventId/official')
  @IsPublic()
  @HttpCode(HttpStatus.OK)
  getOfficialExhibitors(@Param('eventId') eventId: string) {
    this.logger.log(`Getting official exhibitors for event: ${eventId}`);
    return this.registrationService.findOfficialExhibitors(eventId);
  }

  @Get('event/:eventId/exhibitors')
  @IsPublic()
  @HttpCode(HttpStatus.OK)
  async getEventExhibitors(@Param('eventId') eventId: string) {
    this.logger.log(`Getting exhibitors for event: ${eventId}`);
    
    try {
      const registrations = await this.registrationService.findOfficialExhibitors(eventId);
      
      // Map to a simplified response structure
      return registrations.map(reg => {
        const company = reg.exhibitor?.company;
        return {
          registrationId: reg._id,
          exhibitorId: reg.exhibitor?._id,
          company: company ? {
            name: company.companyName,
            logo: company.companyLogoPath,
            country: company.country,
            sector: company.sector,
            description: company.companyDescription,
            website: company.website
          } : null,
          stands: reg.stands?.map(stand => ({
            id: stand._id,
            number: stand.number,
            area: stand.area,
            type: stand.type,
            basePrice: stand.basePrice
          }))
        };
      });
    } catch (error) {
      this.logger.error(`Error getting exhibitors for event ${eventId}: ${error.message}`);
      return [];
    }
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string, @Req() req) {
    this.logger.log(`Getting registration with ID: ${id}`);
    
    try {
      const registration = await this.registrationService.findOne(id);
      
      // If the user is an exhibitor, verify they own this registration
      if (req.user.role === UserRole.EXHIBITOR) {
        const exhibitor = await this.exhibitorService.findByUserId(req.user.id);
        
        if (!exhibitor) {
          throw new NotFoundException('Exhibitor profile not found');
        }
        
        const exhibitorId = (exhibitor._id as unknown as Types.ObjectId).toString();
        const registrationExhibitorId = typeof registration.exhibitor === 'object' && registration.exhibitor?._id
          ? (registration.exhibitor._id as unknown as Types.ObjectId).toString() 
          : String(registration.exhibitor);
        
        if (exhibitorId !== registrationExhibitorId) {
          throw new ForbiddenException('You do not have permission to view this registration');
        }
      }
      
      return registration;
    } catch (error) {
      this.logger.error(`Error finding registration: ${error.message}`);
      throw error;
    }
  }

  @Post(':id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  async review(
    @Param('id') id: string,
    @Body() reviewRegistrationDto: ReviewRegistrationDto,
    @Req() req
  ) {
    this.logger.log(`Reviewing registration ${id} with status ${reviewRegistrationDto.status}`);
    
    try {
      return await this.registrationService.reviewRegistration(
        id,
        reviewRegistrationDto,
        req.user.id,
        req.user.role
      );
    } catch (error) {
      this.logger.error(`Error reviewing registration: ${error.message}`);
      throw error;
    }
  }

  @Post(':id/select-stands')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EXHIBITOR)
  async selectStands(
    @Param('id') id: string,
    @Body() selectStandsDto: SelectStandsDto,
    @Req() req
  ) {
    this.logger.log(`Selecting stands for registration ${id}`);
    
    try {
      // Get exhibitor ID from user ID - this is the key fix
      const exhibitor = await this.exhibitorService.findByUserId(req.user.id);
      
      if (!exhibitor) {
        throw new NotFoundException('Exhibitor profile not found for this user');
      }
      
      // Pass the exhibitor ID to the service, not the user ID
      return await this.registrationService.selectStands(id, selectStandsDto, (exhibitor._id as unknown as Types.ObjectId).toString());
    } catch (error) {
      this.logger.error(`Error selecting stands: ${error.message}`);
      throw error;
    }
  }

  @Post(':id/select-equipment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EXHIBITOR)
  async selectEquipment(
    @Param('id') id: string,
    @Body() selectEquipmentDto: SelectEquipmentDto,
    @Req() req
  ) {
    this.logger.log(`Selecting equipment for registration ${id}`);
    
    try {
      // Get exhibitor ID from user ID - same fix needed here
      const exhibitor = await this.exhibitorService.findByUserId(req.user.id);
      
      if (!exhibitor) {
        throw new NotFoundException('Exhibitor profile not found for this user');
      }
      
      // Pass the exhibitor ID to the service, not the user ID
      return await this.registrationService.selectEquipment(id, selectEquipmentDto, (exhibitor._id as unknown as Types.ObjectId).toString());
    } catch (error) {
      this.logger.error(`Error selecting equipment: ${error.message}`);
      throw error;
    }
  }
@Post(':id/cancel')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.EXHIBITOR, UserRole.ORGANIZER, UserRole.ADMIN)
async cancel(@Param('id') id: string, @Req() req) {
  this.logger.log(`Cancelling registration ${id} by user with role ${req.user.role}`);
  
  try {
    return await this.registrationService.cancel(
      id, 
      req.user.id,
      req.user.role,
      req.body?.reason
    );
  } catch (error) {
    this.logger.error(`Error cancelling registration: ${error.message}`);
    throw error;
  }
}
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateRegistrationDto: UpdateRegistrationDto,
    @Req() req
  ) {
    this.logger.log(`Updating registration ${id}`);
    
    try {
      // For exhibitors, verify ownership
      if (req.user.role === UserRole.EXHIBITOR) {
        const exhibitor = await this.exhibitorService.findByUserId(req.user.id);
        
        if (!exhibitor) {
          throw new NotFoundException('Exhibitor profile not found');
        }
        
        // Use exhibitor ID for the update, not user ID
        return await this.registrationService.update(id, updateRegistrationDto, (exhibitor._id as unknown as Types.ObjectId).toString());
      }
      
      // For admin and organizers, use their user ID
      return await this.registrationService.update(id, updateRegistrationDto, req.user.id);
    } catch (error) {
      this.logger.error(`Error updating registration: ${error.message}`);
      throw error;
    }
  }

  @Post(':id/complete')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.EXHIBITOR)
async complete(@Param('id') id: string, @Req() req) {
  this.logger.log(`Completing registration ${id}`);
  
  try {
    // Get exhibitor ID from user ID
    const exhibitor = await this.exhibitorService.findByUserId(req.user.id);
    
    if (!exhibitor) {
      throw new NotFoundException('Exhibitor profile not found for this user');
    }
    
    // Complete the registration
    const exhibitorId = (exhibitor._id as unknown as Types.ObjectId).toString();
    return await this.registrationService.complete(id, exhibitorId);
  } catch (error) {
    this.logger.error(`Error completing registration: ${error.message}`);
    throw error;
  }
}
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    this.logger.log(`Removing registration ${id}`);
    
    try {
      await this.registrationService.remove(id);
    } catch (error) {
      this.logger.error(`Error removing registration: ${error.message}`);
      throw error;
    }
  }
}