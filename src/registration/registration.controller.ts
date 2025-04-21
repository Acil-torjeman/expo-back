// src/registration/registration.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
  Query,
  Logger,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
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
import { UserRole } from '../user/entities/user.entity';
import { IsPublic } from '../auth/decorators/public.decorator';
import { RegistrationStatus } from './entities/registration.entity';
import { ExhibitorService } from '../exhibitor/exhibitor.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Registration } from './entities/registration.entity';

@Controller('registrations')
export class RegistrationController {
  private readonly logger = new Logger(RegistrationController.name);

  constructor(
    private readonly registrationService: RegistrationService,
    private readonly exhibitorService: ExhibitorService,
    @InjectModel(Registration.name) private readonly registrationModel: Model<Registration>,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EXHIBITOR)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createRegistrationDto: CreateRegistrationDto, @Req() req) {
    this.logger.log(`Creating registration for exhibitor: ${req.user.id}`);
    // Pass the user ID from JWT token
    return this.registrationService.create(createRegistrationDto, req.user.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @Req() req,
    @Query('exhibitorId') exhibitorId?: string,
    @Query('eventId') eventId?: string,
    @Query('status') status?: string
  ) {
    const filters = { exhibitorId, eventId, status };
    
    this.logger.log(`Getting registrations with filters: ${JSON.stringify(filters)}`);
    
    // Exhibitors can only view their own registrations
    if (req.user.role === UserRole.EXHIBITOR) {
      filters.exhibitorId = req.user.id;
    }
    
    return this.registrationService.findAll(filters);
  }

  @Get('my-registrations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EXHIBITOR)
  async findMyRegistrations(@Req() req) {
    this.logger.log(`Getting registrations for exhibitor: ${req.user.id}`);
    
    try {
      // D'abord, obtenir l'ID d'exposant à partir de l'ID utilisateur
      const exhibitor = await this.exhibitorService.findByUserId(req.user.id);
      
      if (!exhibitor) {
        return [];
      }
      
      // Ensuite, obtenir les inscriptions pour cet exposant
      const registrations = await this.registrationModel.find({ 
        exhibitor: exhibitor._id 
      })
      .populate('event')
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
    this.logger.log(`Checking if exhibitor ${req.user.id} is registered for event ${eventId}`);
    
    try {
      // First get the exhibitor linked to this user
      const exhibitor = await this.exhibitorService.findByUserId(req.user.id);
      
      if (!exhibitor) {
        return { registered: false, registration: null };
      }
      
      // Look for a registration for this exhibitor and event
      const registrations = await this.registrationModel.find({
        exhibitor: exhibitor._id,
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
      this.logger.error(`Error checking registration: ${error.message}`, error.stack);
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

  @Get('event/:eventId/exhibitors')  // A simpler URL that might be easier to remember
  @IsPublic()
  @HttpCode(HttpStatus.OK)
  async getEventExhibitors(@Param('eventId') eventId: string) {
    this.logger.log(`Getting exhibitors for event: ${eventId}`);
    
    try {
      const registrations = await this.registrationService.findOfficialExhibitors(eventId);
      
      // Map to a simplified response structure if needed
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
  findOne(@Param('id') id: string, @Req() req) {
    this.logger.log(`Getting registration with ID: ${id}`);
    return this.registrationService.findOne(id);
  }

  @Post(':id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  review(
    @Param('id') id: string,
    @Body() reviewRegistrationDto: ReviewRegistrationDto,
    @Req() req
  ) {
    this.logger.log(`Reviewing registration ${id} with status ${reviewRegistrationDto.status}`);
    return this.registrationService.reviewRegistration(
      id,
      reviewRegistrationDto,
      req.user.id,
      req.user.role
    );
  }

  @Post(':id/select-stands')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EXHIBITOR)
  selectStands(
    @Param('id') id: string,
    @Body() selectStandsDto: SelectStandsDto,
    @Req() req
  ) {
    this.logger.log(`Selecting stands for registration ${id}`);
    return this.registrationService.selectStands(id, selectStandsDto, req.user.id);
  }

  @Post(':id/select-equipment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EXHIBITOR)
  selectEquipment(
    @Param('id') id: string,
    @Body() selectEquipmentDto: SelectEquipmentDto,
    @Req() req
  ) {
    this.logger.log(`Selecting equipment for registration ${id}`);
    return this.registrationService.selectEquipment(id, selectEquipmentDto, req.user.id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EXHIBITOR)
  async update(
    @Param('id') id: string,
    @Body() updateRegistrationDto: UpdateRegistrationDto,
    @Req() req
  ) {
    this.logger.log(`Updating registration ${id}`);
    try {
      const exhibitor = await this.exhibitorService.findByUserId(req.user.id);
      
      if (!exhibitor) {
        return [];
      }
      
      return this.registrationService.update(id, updateRegistrationDto, req.user.id);
    } catch (error) {
      this.logger.error(`Error updating registration: ${error.message}`);
      throw new InternalServerErrorException('Failed to update registration');
    }
  }
}