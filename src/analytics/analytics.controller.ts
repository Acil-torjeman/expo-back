// src/analytics/analytics.controller.ts
import { 
    Controller, 
    Get, 
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
    forwardRef
  } from '@nestjs/common';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { RolesGuard } from '../auth/guards/roles.guard';
  import { Roles } from '../auth/decorators/roles.decorator';
  import { UserRole } from '../user/entities/user.entity';
  import { AnalyticsService } from './analytics.service';
  import { OrganizerService } from '../organizer/organizer.service';
  
  @Controller('analytics')
  export class AnalyticsController {
    private readonly logger = new Logger(AnalyticsController.name);
  
    constructor(
      private readonly analyticsService: AnalyticsService,
      @Inject(forwardRef(() => OrganizerService)) private readonly organizerService: OrganizerService
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
     * Helper method to get organizer from user ID
     * Uses the OrganizerService to fetch the organizer
     */
    private async getOrganizerByUserId(userId: string): Promise<any> {
      this.logger.log(`Finding organizer for user ID: ${userId}`);
      
      try {
        // Use the organizerService to find the organizer by userId
        const organizer = await this.organizerService.findByUserId(userId);
        
        if (!organizer) {
          this.logger.warn(`No organizer found for user ID: ${userId}`);
          return null;
        }
        
        this.logger.log(`Found organizer: ${organizer._id}`);
        return organizer;
      } catch (error) {
        this.logger.error(`Error finding organizer for user ${userId}: ${error.message}`);
        throw error;
      }
    }
  }