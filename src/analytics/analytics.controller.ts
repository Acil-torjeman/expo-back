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
    BadRequestException 
  } from '@nestjs/common';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { RolesGuard } from '../auth/guards/roles.guard';
  import { Roles } from '../auth/decorators/roles.decorator';
  import { UserRole } from '../user/entities/user.entity';
  import { AnalyticsService } from './analytics.service';
  
  @Controller('analytics')
  export class AnalyticsController {
    private readonly logger = new Logger(AnalyticsController.name);
  
    constructor(private readonly analyticsService: AnalyticsService) {}
  
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
     * Note: In your real implementation, this would be handled by your OrganizerService
     */
    private async getOrganizerByUserId(userId: string): Promise<any> {
      // This would call your actual organizer service
      // For now, it's a placeholder - replace with actual implementation
      return { _id: 'placeholder-organizer-id' };
    }
  }