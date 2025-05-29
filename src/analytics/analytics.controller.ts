// src/analytics/analytics.controller.ts
import { 
  Controller, 
  Get, 
  Post,
  Param, 
  Query, 
  UseGuards, 
  Req, 
  Logger, 
  HttpStatus, 
  HttpCode,
  NotFoundException,
  BadRequestException,
  Inject, 
  forwardRef,
  Body
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../user/entities/user.entity';
import { AnalyticsService } from './analytics.service';
import { OrganizerService } from '../organizer/organizer.service';
import { EventService } from '../event/event.service';
import { StandService } from '../stand/stand.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Event } from '../event/entities/event.entity';
import { Stand } from '../stand/entities/stand.entity';
import { Invoice, InvoiceStatus } from '../invoice/entities/invoice.entity';
import { Registration, RegistrationStatus } from '../registration/entities/registration.entity';
import { StandDocument } from '../stand/interfaces/stand-document.interface';
import { RegistrationDocument } from '../registration/interfaces/registration-document.interface';
import { InvoiceDocument } from '../invoice/interfaces/invoice-document.interface';

@Controller('analytics')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(
    private readonly analyticsService: AnalyticsService,
    @Inject(forwardRef(() => OrganizerService)) private readonly organizerService: OrganizerService,
    @Inject(forwardRef(() => EventService)) private readonly eventService: EventService,
    @Inject(forwardRef(() => StandService)) private readonly standService: StandService,
    @InjectModel(Registration.name) private readonly registrationModel: Model<RegistrationDocument>,
    @InjectModel(Event.name) private readonly eventModel: Model<Event>,
    @InjectModel(Stand.name) private readonly standModel: Model<StandDocument>,
    @InjectModel(Invoice.name) private readonly invoiceModel: Model<InvoiceDocument>
  ) {}

  @Get('dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @HttpCode(HttpStatus.OK)
  async getDashboard(
    @Req() req,
    @Query('eventId') eventId?: string,
    @Query('period') period?: string
  ) {
    try {
      this.logger.log(`Getting dashboard analytics for organizer's user: ${req.user.id}, period: ${period || 'default'}`);
      
      // Get organizer from user ID
      const organizer = await this.getOrganizerByUserId(req.user.id);
      
      if (!organizer) {
        throw new NotFoundException('Organizer profile not found for this user');
      }
      
      this.logger.log(`Found organizer with ID: ${organizer._id}`);
      
      return this.analyticsService.getDashboardData(organizer._id.toString(), eventId, period);
    } catch (error) {
      this.logger.error(`Error getting dashboard analytics: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('events/:eventId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  @HttpCode(HttpStatus.OK)
  async getEventAnalytics(
    @Req() req,
    @Param('eventId') eventId: string,
    @Query('period') period?: string
  ) {
    try {
      this.logger.log(`Getting event analytics for event: ${eventId}, organizer's user: ${req.user.id}`);
      
      if (!eventId) {
        throw new BadRequestException('Event ID is required');
      }
      
      // Get organizer from user ID
      const organizer = await this.getOrganizerByUserId(req.user.id);
      
      if (!organizer) {
        throw new NotFoundException('Organizer profile not found for this user');
      }
      
      return this.analyticsService.getDashboardData(organizer._id.toString(), eventId, period);
    } catch (error) {
      this.logger.error(`Error getting event analytics: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Debug endpoint to verify organizer-user relationship
   */
  @Get('debug/organizer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  async debugOrganizerRelationship(@Req() req) {
    try {
      const userId = req.user.id;
      this.logger.log(`Debugging organizer relationship for user: ${userId}`);
      
      // Get organizer from user ID
      const organizer = await this.getOrganizerByUserId(userId);
      
      if (!organizer) {
        this.logger.warn(`No organizer found for user ID: ${userId}`);
        return {
          success: false,
          message: 'No organizer profile found for this user',
          userId
        };
      }
      
      this.logger.log(`Found organizer with ID: ${organizer._id} for user: ${userId}`);
      return {
        success: true,
        organizerId: organizer._id,
        organizationName: organizer.organizationName,
        userId
      };
    } catch (error) {
      this.logger.error(`Error debugging organizer relationship: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
        userId: req.user.id
      };
    }
  }
  
  /**
   * Debug endpoint to verify if events exist for the organizer
   */
  @Get('debug/events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  async debugEvents(@Req() req) {
    try {
      const userId = req.user.id;
      this.logger.log(`Debugging events for user: ${userId}`);
      
      // Get organizer from user ID
      const organizer = await this.getOrganizerByUserId(userId);
      
      if (!organizer) {
        return {
          success: false,
          message: 'No organizer profile found for this user',
          userId
        };
      }
      
      const organizerId = organizer._id;
      
      // Get events for this organizer
      const events = await this.eventModel.find({ 
        organizer: organizerId 
      }).exec();
      
      this.logger.log(`Found ${events.length} events for organizer: ${organizerId}`);
      
      return {
        success: true,
        organizerId,
        eventsCount: events.length,
        events: events.map(event => ({
          id: event._id,
          name: event.name,
          status: event.status,
          startDate: event.startDate,
          endDate: event.endDate,
          organizer: typeof event.organizer === 'object' ? event.organizer._id : event.organizer
        }))
      };
    } catch (error) {
      this.logger.error(`Error debugging events: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Debug endpoint to verify registrations for organizer's events
   */
  @Get('debug/registrations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  async debugRegistrations(@Req() req) {
    try {
      const userId = req.user.id;
      this.logger.log(`Debugging registrations for user: ${userId}`);
      
      // Get organizer from user ID
      const organizer = await this.getOrganizerByUserId(userId);
      
      if (!organizer) {
        return {
          success: false,
          message: 'No organizer profile found for this user',
          userId
        };
      }
      
      const organizerId = organizer._id;
      
      // Get events for this organizer
      const events = await this.eventModel.find({ 
        organizer: organizerId 
      }).exec();
      
      if (events.length === 0) {
        return {
          success: false,
          message: 'No events found for this organizer',
          organizerId
        };
      }
      
      const eventIds = events.map(event => event._id);
      
      // Get registrations for these events
      const registrations = await this.registrationModel.find({
        event: { $in: eventIds }
      }).exec();
      
      this.logger.log(`Found ${registrations.length} registrations for organizer's events`);
      
      // Count by status
      const countByStatus = {};
      for (const status of Object.values(RegistrationStatus)) {
        countByStatus[status] = registrations.filter(reg => reg.status === status).length;
      }
      
      return {
        success: true,
        organizerId,
        eventsCount: events.length,
        registrationsCount: registrations.length,
        countByStatus,
        sampleRegistration: registrations.length > 0 ? {
          id: registrations[0]._id,
          status: registrations[0].status,
          event: registrations[0].event,
          exhibitor: registrations[0].exhibitor,
          createdAt: registrations[0].createdAt,
          updatedAt: registrations[0].updatedAt,
          approvalDate: registrations[0].approvalDate,
          rejectionDate: registrations[0].rejectionDate
        } : null
      };
    } catch (error) {
      this.logger.error(`Error debugging registrations: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  @Get('participants-by-event')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ORGANIZER)
@HttpCode(HttpStatus.OK)
async getParticipantsByEvent(@Req() req) {
  try {
    const organizer = await this.getOrganizerByUserId(req.user.id);
    
    if (!organizer) {
      throw new NotFoundException('Organizer profile not found');
    }
    
    return this.analyticsService.getParticipantsByEvent(organizer._id.toString());
  } catch (error) {
    this.logger.error(`Error getting participants by event: ${error.message}`);
    throw error;
  }
}

   //Debug endpoint to verify stands for organizer's events
  @Get('debug/stands')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  async debugStands(@Req() req) {
    try {
      const userId = req.user.id;
      this.logger.log(`Debugging stands for user: ${userId}`);
      
      // Get organizer from user ID
      const organizer = await this.getOrganizerByUserId(userId);
      
      if (!organizer) {
        return {
          success: false,
          message: 'No organizer profile found for this user',
          userId
        };
      }
      
      const organizerId = organizer._id;
      
      // Get events for this organizer
      const events = await this.eventModel.find({ 
        organizer: organizerId 
      }).exec();
      
      if (events.length === 0) {
        return {
          success: false,
          message: 'No events found for this organizer',
          organizerId
        };
      }
      
      const eventIds = events.map(event => event._id);
      
      // Get stands for these events
      const stands = await this.standModel.find({
        event: { $in: eventIds }
      }).exec();
      
      this.logger.log(`Found ${stands.length} stands for organizer's events`);
      
      // Count by status
      const countByStatus = {};
      stands.forEach(stand => {
        if (!countByStatus[stand.status]) {
          countByStatus[stand.status] = 0;
        }
        countByStatus[stand.status]++;
      });
      
      return {
        success: true,
        organizerId,
        eventsCount: events.length,
        standsCount: stands.length,
        countByStatus,
        sampleStand: stands.length > 0 ? {
          id: stands[0]._id,
          number: stands[0].number,
          status: stands[0].status,
          event: stands[0].eventId
        } : null
      };
    } catch (error) {
      this.logger.error(`Error debugging stands: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Debug endpoint to verify invoices for organizer's events
   */
  @Get('debug/invoices')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  async debugInvoices(@Req() req) {
    try {
      const userId = req.user.id;
      this.logger.log(`Debugging invoices for user: ${userId}`);
      
      // Get organizer from user ID
      const organizer = await this.getOrganizerByUserId(userId);
      
      if (!organizer) {
        return {
          success: false,
          message: 'No organizer profile found for this user',
          userId
        };
      }
      
      const organizerId = organizer._id;
      
      // Get invoices for this organizer
      const invoices = await this.invoiceModel.find({
        organizer: organizerId
      }).exec();
      
      this.logger.log(`Found ${invoices.length} invoices for organizer: ${organizerId}`);
      
      // Count by status
      const countByStatus = {};
      for (const status of Object.values(InvoiceStatus)) {
        countByStatus[status] = invoices.filter(inv => inv.status === status).length;
      }
      
      return {
        success: true,
        organizerId,
        invoicesCount: invoices.length,
        countByStatus,
        sampleInvoice: invoices.length > 0 ? {
          id: invoices[0]._id,
          invoiceNumber: invoices[0].invoiceNumber,
          status: invoices[0].status,
          total: invoices[0].total,
          createdAt: invoices[0].createdAt
        } : null
      };
    } catch (error) {
      this.logger.error(`Error debugging invoices: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message
      };
    }
  }
  

  private async getOrganizerByUserId(userId: string): Promise<any> {
    this.logger.log(`Finding organizer for user ID: ${userId}`);
    
    try {
      // Use the organizerService to find the organizer by userId
      const organizer = await this.organizerService.findByUserId(userId);
      
      if (!organizer) {
        this.logger.warn(`No organizer found for user ID: ${userId}`);
        return null;
      }
      
      this.logger.log(`Found organizer: ${organizer._id} with user ID: ${organizer.user}`);
      return organizer;
    } catch (error) {
      this.logger.error(`Error finding organizer for user ${userId}: ${error.message}`);
      throw error;
    }
  }
}