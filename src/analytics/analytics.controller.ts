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
  
  /**
   * Debug endpoint to verify stands for organizer's events
   */
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
  
  /**
   * Create test data for development and debugging
   */
  @Post('debug/create-test-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  async createTestData(@Req() req, @Body() body: any) {
    try {
      const userId = req.user.id;
      this.logger.log(`Creating test data for user: ${userId}`);
      
      const count = body.count || 1;
      
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
      
      // Create a test event if none exists
      let event;
      const existingEvents = await this.eventModel.find({ organizer: organizerId }).exec();
      
      if (existingEvents.length === 0) {
        // Create an event for this organizer
        event = await this.eventModel.create({
          name: `Test Event ${Date.now()}`,
          type: 'Conference',
          description: 'Test event for analytics',
          startDate: new Date(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days later
          openingHours: '9:00 - 18:00',
          location: {
            address: '123 Test Street',
            city: 'Test City',
            postalCode: '12345',
            country: 'Test Country'
          },
          organizer: organizerId,
          allowedSectors: ['Technology', 'Business'],
          allowedSubsectors: ['Software', 'Hardware', 'Services'],
          registrationDeadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days later
          status: 'published',
          visibility: 'public'
        });
      } else {
        event = existingEvents[0];
      }
      
      this.logger.log(`Using event: ${event._id} for test data`);
      
      // Create test stands if none exist
      let stands = await this.standModel.find({ event: event._id }).exec();
      
      if (stands.length === 0) {
        const newStands: any[] = [];
        // Create a few stands
        for (let i = 1; i <= 5; i++) {
          // Create stand data
          const standData: any = {
            number: `S${i}`,
            event: event._id,
            area: 10 * i,
            basePrice: 100 * i,
            type: i % 2 === 0 ? 'premium' : 'standard',
            status: 'available',
            description: `Test stand ${i}`
          };
          newStands.push(standData);
        }
        
        const createdStands = await this.standModel.insertMany(newStands);
        stands = await this.standModel.find({ _id: { $in: createdStands.map(s => s._id) } });
        this.logger.log(`Created ${stands.length} test stands`);
      }
      
      // Create test registrations with various statuses
      const statuses = [
        RegistrationStatus.PENDING, 
        RegistrationStatus.APPROVED, 
        RegistrationStatus.COMPLETED,
        RegistrationStatus.REJECTED
      ];
      
      // Find an exhibitor (simplifying this part since the purpose is just to create test data)
      // In a real implementation, you'd need to create a proper exhibitor or use an existing one
      let exhibitorId = new Types.ObjectId();
      if (body.exhibitorId) {
        exhibitorId = new Types.ObjectId(body.exhibitorId);
      }
      
      // Create test registrations
      const registrations: any[] = [];
      const now = new Date();
      
      for (let i = 0; i < count; i++) {
        const status = statuses[i % statuses.length];
        const createdDate = new Date(now.getTime() - (10 - i) * 24 * 60 * 60 * 1000); // Different creation dates
        
        // Create registration data
        const registration: any = {
          exhibitor: exhibitorId,
          event: event._id,
          status,
          participationNote: `Test registration ${i+1}`,
          standSelectionCompleted: status === RegistrationStatus.COMPLETED,
          equipmentSelectionCompleted: status === RegistrationStatus.COMPLETED
        };
        
        // Add appropriate dates based on status
        if (status === RegistrationStatus.APPROVED || status === RegistrationStatus.COMPLETED) {
          registration['approvalDate'] = new Date(createdDate.getTime() + 12 * 60 * 60 * 1000); // 12 hours after creation
        }
        
        if (status === RegistrationStatus.REJECTED) {
          registration['rejectionDate'] = new Date(createdDate.getTime() + 24 * 60 * 60 * 1000); // 24 hours after creation
          registration['rejectionReason'] = 'Test rejection reason';
        }
        
        // For completed registrations, add stands
        if (status === RegistrationStatus.COMPLETED && stands.length > 0) {
          registration['stands'] = [stands[0]._id]; // Assign the first stand
          
          // Update stand status to reserved
          await this.standModel.findByIdAndUpdate(stands[0]._id, { status: 'reserved' });
        }
        
        registrations.push(registration);
      }
      
      const createdRegistrations = await this.registrationModel.insertMany(registrations);
      this.logger.log(`Created ${createdRegistrations.length} test registrations`);
      
      // Create test invoices for completed registrations
      const completedRegistrations = createdRegistrations.filter(
        reg => reg.status === RegistrationStatus.COMPLETED
      );
      
      if (completedRegistrations.length > 0) {
        const invoices: any[] = [];
        
        for (const reg of completedRegistrations) {
          // Create invoice data
          const invoice: any = {
            invoiceNumber: `INV-${Date.now()}-${reg._id}`.substring(0, 20),
            registration: reg._id,
            exhibitor: reg.exhibitor,
            organizer: organizerId,
            event: event._id,
            items: [
              {
                type: 'stand',
                name: 'Test Stand',
                description: 'Stand reservation fee',
                price: 1000,
                quantity: 1
              }
            ],
            subtotal: 1000,
            taxRate: 0.2,
            taxAmount: 200,
            total: 1200,
            status: Math.random() > 0.5 ? InvoiceStatus.PAID : InvoiceStatus.PENDING
          };
          
          invoices.push(invoice);
        }
        
        if (invoices.length > 0) {
          const createdInvoices = await this.invoiceModel.insertMany(invoices);
          this.logger.log(`Created ${createdInvoices.length} test invoices`);
        }
      }
      
      return {
        success: true,
        organizerId,
        eventId: event._id,
        standsCount: stands.length,
        registrationsCount: createdRegistrations.length
      };
    } catch (error) {
      this.logger.error(`Error creating test data: ${error.message}`, error.stack);
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