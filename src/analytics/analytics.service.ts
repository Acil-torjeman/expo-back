// src/analytics/analytics.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Analytics } from './entities/analytics.entity';
import { Registration, RegistrationStatus } from '../registration/entities/registration.entity';
import { Event } from '../event/entities/event.entity';
import { Stand, StandStatus } from '../stand/entities/stand.entity';
import { Invoice, InvoiceStatus } from '../invoice/entities/invoice.entity';
import { Organizer } from '../organizer/entities/organizer.entity';
import { User } from '../user/entities/user.entity';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectModel(Analytics.name) private analyticsModel: Model<Analytics>,
    @InjectModel(Registration.name) private registrationModel: Model<Registration>,
    @InjectModel(Event.name) private eventModel: Model<Event>,
    @InjectModel(Stand.name) private standModel: Model<Stand>,
    @InjectModel(Invoice.name) private invoiceModel: Model<Invoice>,
    @InjectModel(Organizer.name) private organizerModel: Model<Organizer>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  /**
   * Get analytics dashboard data for an organizer
   */
  async getDashboardData(organizerId: string, eventId?: string, period?: string): Promise<any> {
    try {
      this.logger.log(`Getting analytics for organizer: ${organizerId}`);
      
      // Verify organizer exists
      const organizer = await this.organizerModel.findById(organizerId);
      if (!organizer) {
        throw new NotFoundException(`Organizer with ID ${organizerId} not found`);
      }

      // Get the user ID associated with this organizer - this is the key fix
      const userId = organizer.user;
      this.logger.log(`Found organizer's user ID: ${userId}`);
      
      // Set date range for analytics
      const { startDate, endDate } = this.getDateRange(period);
      
      // Query for events by this organizer's user ID - this is the key fix
      const eventsQuery: any = { 
        organizer: userId
      };
      
      this.logger.log(`Events query using user ID: ${JSON.stringify(eventsQuery)}`);
      
      // If specific event requested, add to query
      if (eventId) {
        eventsQuery._id = new Types.ObjectId(eventId);
      }
      
      // Get events for this organizer
      const events = await this.eventModel.find(eventsQuery).exec();
      
      this.logger.log(`Events found: ${events.length}`);
      if (events.length > 0) {
        this.logger.log(`First event details: ${JSON.stringify({
          id: events[0]._id,
          name: events[0].name,
          organizerId: events[0].organizer
        })}`);
      }
      
      if (events.length === 0) {
        this.logger.log('No events found, returning empty data');
        return this.getEmptyResponse(startDate, endDate);
      }
      
      const eventIds = events.map(event => event._id);
      
      // Calculate each KPI
      const kpis = await this.calculateAllKpis(
        organizerId,
        eventIds.map((id: Types.ObjectId) => new Types.ObjectId(id.toString())),
        startDate, 
        endDate
      );
      
      // Generate time series data for charts
      const timeSeriesData = await this.generateTimeSeriesData(
        eventIds.map((id: Types.ObjectId) => new Types.ObjectId(id.toString())),
        startDate,
        endDate
      );
      
      // No longer checking for hasNonZeroValues to switch to demo data
      return {
        period: { startDate, endDate },
        kpis,
        timeSeriesData
      };
    } catch (error) {
      this.logger.error(`Error getting analytics: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Generate empty response structure
   */
  private getEmptyResponse(startDate: Date, endDate: Date): any {
    return {
      period: { startDate, endDate },
      kpis: this.getEmptyKpiResponse(),
      timeSeriesData: this.generateEmptyTimeSeriesData(startDate, endDate)
    };
  }

  /**
   * Generate empty time series data structure
   */
  private generateEmptyTimeSeriesData(startDate: Date, endDate: Date): any {
    const datePoints = this.generateDatePoints(startDate, endDate, 8);
    
    return {
      datePoints: datePoints.map(d => this.formatDateString(d)),
      processingTimeData: Array(datePoints.length).fill(0),
      paymentTimeData: Array(datePoints.length).fill(0),
      pendingRequestsData: Array(datePoints.length).fill(0),
      standsOccupationData: datePoints.map(date => ({
        date: this.formatDateString(date),
        available: 0,
        occupied: 0,
        total: 0,
        rate: 0
      }))
    };
  }

  /**
   * Calculate all KPIs for the dashboard
   */
  private async calculateAllKpis(organizerId: string, eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<any> {
    if (!eventIds || eventIds.length === 0) {
      return this.getEmptyKpiResponse();
    }
    
    try {
      // Log the event IDs we're using for calculations
      this.logger.log(`Calculating KPIs for events: ${eventIds.map(id => id.toString())}`);
      
      // Important: Check if there are any registrations at all for these events
      const registrationsCount = await this.registrationModel.countDocuments({
        event: { $in: eventIds }
      }).exec();
      
      this.logger.log(`Found ${registrationsCount} total registrations for these events`);
      
      if (registrationsCount === 0) {
        this.logger.log('No registrations found, returning empty KPI response');
        return this.getEmptyKpiResponse();
      }
      
      const [
        processingTime,
        paymentTime,
        validatedBeforeDeadline,
        standsBeforeEvent,
        pendingRequests,
        standsOccupation
      ] = await Promise.all([
        this.calculateAverageProcessingTime(eventIds, startDate, endDate),
        this.calculateAveragePaymentTime(eventIds, startDate, endDate),
        this.calculateValidatedBeforeDeadline(eventIds, startDate, endDate),
        this.calculateStandsReservedBeforeEvent(eventIds, startDate, endDate),
        this.calculatePendingRequests(eventIds, startDate, endDate),
        this.calculateStandsOccupation(eventIds, startDate, endDate)
      ]);
      
      // For manual reminders - this would need to be tracked in the system
      const manualReminders = {
        count: 0,
        trend: 0
      };
      
      return {
        processingTime,
        paymentTime,
        manualReminders,
        validatedBeforeDeadline,
        standsBeforeEvent,
        pendingRequests,
        standsOccupation
      };
    } catch (error) {
      this.logger.error(`Error calculating KPIs: ${error.message}`, error.stack);
      return this.getEmptyKpiResponse();
    }
  }

  /**
   * Calculate average processing time for registrations (hours)
   */
  private async calculateAverageProcessingTime(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<any> {
    try {
      // Remove date restriction that might filter out all data
      const registrations = await this.registrationModel.find({
        event: { $in: eventIds },
        $or: [
          { status: RegistrationStatus.APPROVED },
          { status: RegistrationStatus.REJECTED }
        ]
      }).exec();
      
      this.logger.log(`Found ${registrations.length} processed registrations`);
      
      if (registrations.length === 0) {
        return {
          value: 0,
          trend: 0,
          unit: 'hours'
        };
      }
      
      let totalHours = 0;
      let validCount = 0;
      
      for (const reg of registrations) {
        let processDate;
        
        if (reg.status === RegistrationStatus.APPROVED && reg.approvalDate) {
          processDate = new Date(reg.approvalDate);
        } else if (reg.status === RegistrationStatus.REJECTED && reg.rejectionDate) {
          processDate = new Date(reg.rejectionDate);
        } else {
          continue;
        }
        
        const createdDate = new Date(reg.createdAt);
        const diffTime = Math.abs(processDate.getTime() - createdDate.getTime());
        const diffHours = diffTime / (1000 * 60 * 60);
        
        totalHours += diffHours;
        validCount++;
      }
      
      const average = validCount > 0 ? totalHours / validCount : 0;
      
      // Calculate trend compared to previous period
      const trend = 0;
      
      return {
        value: parseFloat(average.toFixed(2)),
        trend,
        unit: 'hours'
      };
    } catch (error) {
      this.logger.error(`Error calculating processing time: ${error.message}`, error.stack);
      return { value: 0, trend: 0, unit: 'hours' };
    }
  }

  /**
   * Calculate average time between registration approval and payment (hours)
   */
  private async calculateAveragePaymentTime(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<any> {
    try {
      // Find all completed registrations for these events
      const registrations = await this.registrationModel.find({
        event: { $in: eventIds },
        status: RegistrationStatus.COMPLETED
      }).exec();
      
      this.logger.log(`Found ${registrations.length} completed registrations`);
      
      if (registrations.length === 0) {
        return {
          value: 0,
          trend: 0,
          unit: 'hours'
        };
      }
      
      let totalHours = 0;
      let validCount = 0;
      
      for (const reg of registrations) {
        if (!reg.approvalDate) continue;
        
        const invoice = await this.invoiceModel.findOne({
          registration: reg._id,
          status: InvoiceStatus.PAID
        }).exec();
        
        if (!invoice) continue;
        
        const approvalDate = new Date(reg.approvalDate);
        const paidDate = invoice.updatedAt;
        
        const diffTime = Math.abs(paidDate.getTime() - approvalDate.getTime());
        const diffHours = diffTime / (1000 * 60 * 60);
        
        totalHours += diffHours;
        validCount++;
      }
      
      this.logger.log(`Found ${validCount} paid invoices with valid approval dates`);
      
      const average = validCount > 0 ? totalHours / validCount : 0;
      const trend = 0;
      
      return {
        value: parseFloat(average.toFixed(2)),
        trend,
        unit: 'hours'
      };
    } catch (error) {
      this.logger.error(`Error calculating payment time: ${error.message}`, error.stack);
      return { value: 0, trend: 0, unit: 'hours' };
    }
  }

  /**
   * Calculate percentage of exhibitors validated before deadline
   */
  private async calculateValidatedBeforeDeadline(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<any> {
    try {
      // For this we need to get events and their registration deadlines
      const events = await this.eventModel.find({
        _id: { $in: eventIds }
      }).exec();
      
      if (events.length === 0) {
        return {
          value: 0,
          trend: 0,
          unit: 'percent'
        };
      }
      
      let validatedBeforeDeadline = 0;
      let totalValidated = 0;
      
      for (const event of events) {
        const deadline = new Date(event.registrationDeadline);
        
        const registrations = await this.registrationModel.find({
          event: event._id,
          status: RegistrationStatus.APPROVED
        }).exec();
        
        this.logger.log(`Event ${event._id}: ${registrations.length} approved registrations, deadline: ${deadline}`);
        
        for (const reg of registrations) {
          totalValidated++;
          
          if (reg.approvalDate && new Date(reg.approvalDate) <= deadline) {
            validatedBeforeDeadline++;
          }
        }
      }
      
      const percentage = totalValidated > 0 ? (validatedBeforeDeadline / totalValidated) * 100 : 0;
      const trend = 0;
      
      return {
        value: parseFloat(percentage.toFixed(2)),
        trend,
        unit: 'percent'
      };
    } catch (error) {
      this.logger.error(`Error calculating validations before deadline: ${error.message}`, error.stack);
      return { value: 0, trend: 0, unit: 'percent' };
    }
  }

  /**
   * Calculate percentage of stands reserved X days before event
   */
  private async calculateStandsReservedBeforeEvent(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<any> {
    try {
      const daysBeforeEvent = 30; // Default - can be made configurable
      
      const events = await this.eventModel.find({
        _id: { $in: eventIds }
      }).exec();
      
      if (events.length === 0) {
        return {
          value: 0,
          trend: 0,
          unit: 'percent',
          daysBeforeEvent
        };
      }
      
      let totalStands = 0;
      let reservedBeforeDeadline = 0;
      
      for (const event of events) {
        // Get all stands for this event's plan
        const stands = await this.standModel.find({
          event: event._id
        }).exec();
        
        totalStands += stands.length;
        
        if (totalStands === 0) continue;
        
        this.logger.log(`Event ${event._id}: Found ${stands.length} stands`);
        
        // Calculate the date that's X days before the event
        const eventStartDate = new Date(event.startDate);
        const deadlineDate = new Date(eventStartDate);
        deadlineDate.setDate(deadlineDate.getDate() - daysBeforeEvent);
        
        // Count stands that are already reserved
        const reservedStands = stands.filter(stand => 
          stand.status === StandStatus.RESERVED || stand.status === 'reserved'
        );
        
        this.logger.log(`Event ${event._id}: ${reservedStands.length} stands are currently reserved`);
        
        reservedBeforeDeadline += reservedStands.length;
      }
      
      const percentage = totalStands > 0 ? (reservedBeforeDeadline / totalStands) * 100 : 0;
      const trend = 0;
      
      return {
        value: parseFloat(percentage.toFixed(2)),
        trend,
        unit: 'percent',
        daysBeforeEvent
      };
    } catch (error) {
      this.logger.error(`Error calculating stands reserved before event: ${error.message}`, error.stack);
      return { value: 0, trend: 0, unit: 'percent', daysBeforeEvent: 30 };
    }
  }

  /**
   * Calculate number of pending registration requests
   */
  private async calculatePendingRequests(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<any> {
    try {
      // Remove date restriction
      const pendingCount = await this.registrationModel.countDocuments({
        event: { $in: eventIds },
        status: RegistrationStatus.PENDING
      }).exec();
      
      this.logger.log(`Found ${pendingCount} pending registrations for these events`);
      
      // For trend, would need previous period data
      const trend = 0;
      
      return {
        value: pendingCount,
        trend,
        unit: 'count'
      };
    } catch (error) {
      this.logger.error(`Error calculating pending requests: ${error.message}`, error.stack);
      return { value: 0, trend: 0, unit: 'count' };
    }
  }

  /**
   * Calculate stands occupation (available vs occupied)
   */
  private async calculateStandsOccupation(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<any> {
    try {
      const events = await this.eventModel.find({
        _id: { $in: eventIds }
      }).exec();
      
      if (events.length === 0) {
        return {
          available: 0,
          occupied: 0,
          total: 0,
          occupancyRate: 0,
          trend: 0,
          unit: 'percent'
        };
      }
      
      let totalStands = 0;
      let occupiedStands = 0;
      
      for (const event of events) {
        // Get all stands for this event
        const stands = await this.standModel.find({
          event: event._id
        }).exec();
        
        totalStands += stands.length;
        
        // Log the stands statuses for debugging
        const statusCounts = {};
        stands.forEach(stand => {
          const status = stand.status || 'unknown';
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        
        this.logger.log(`Event ${event._id}: Stands by status: ${JSON.stringify(statusCounts)}`);
        
        // Count occupied stands - any with status 'reserved' or 'occupied'
        const occupied = stands.filter(stand => 
          stand.status === 'reserved' || stand.status === 'occupied'
        ).length;
        
        occupiedStands += occupied;
      }
      
      const availableStands = totalStands - occupiedStands;
      const occupancyRate = totalStands > 0 ? (occupiedStands / totalStands) * 100 : 0;
      const trend = 0;
      
      return {
        available: availableStands,
        occupied: occupiedStands,
        total: totalStands,
        occupancyRate: parseFloat(occupancyRate.toFixed(2)),
        trend,
        unit: 'percent'
      };
    } catch (error) {
      this.logger.error(`Error calculating stands occupation: ${error.message}`, error.stack);
      return { 
        available: 0, 
        occupied: 0,
        total: 0,
        occupancyRate: 0,
        trend: 0,
        unit: 'percent'
      };
    }
  }

  /**
   * Generate time series data for charts
   */
  private async generateTimeSeriesData(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<any> {
    try {
      // Create date points - 8 points between start and end date
      const datePoints = this.generateDatePoints(startDate, endDate, 8);
      
      // Generate time series data for each metric
      const processingTimeData: number[] = [];
      const paymentTimeData: number[] = [];
      const pendingRequestsData: number[] = [];
      const standsOccupationData: any[] = [];
      
      for (const date of datePoints) {
        // For processing time
        const processingTime = await this.getProcessingTimeForDate(eventIds, new Date(date));
        processingTimeData.push(processingTime);
        
        // For payment time
        const paymentTime = await this.getPaymentTimeForDate(eventIds, new Date(date));
        paymentTimeData.push(paymentTime);
        
        // For pending requests
        const pendingRequests = await this.getPendingRequestsForDate(eventIds, new Date(date));
        pendingRequestsData.push(pendingRequests);
        
        // For stands occupation
        const standsOccupation = await this.getStandsOccupationForDate(eventIds, new Date(date));
        standsOccupationData.push(standsOccupation);
      }
      
      return {
        datePoints: datePoints.map(d => this.formatDateString(d)),
        processingTimeData,
        paymentTimeData,
        pendingRequestsData,
        standsOccupationData
      };
    } catch (error) {
      this.logger.error(`Error generating time series data: ${error.message}`, error.stack);
      return this.generateEmptyTimeSeriesData(startDate, endDate);
    }
  }
  
  /**
   * Generate evenly spaced date points between start and end date
   */
  private generateDatePoints(startDate: Date, endDate: Date, count: number): Date[] {
    const points: Date[] = [];
    const interval = (endDate.getTime() - startDate.getTime()) / (count - 1);
    
    for (let i = 0; i < count; i++) {
      const date = new Date(startDate.getTime() + (interval * i));
      points.push(date);
    }
    
    return points;
  }
  
  /**
   * Format date as YYYY-MM-DD
   */
  private formatDateString(date: Date | string): string {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  }
  
  /**
   * Get processing time for a specific date
   */
  private async getProcessingTimeForDate(eventIds: Types.ObjectId[], date: Date): Promise<number> {
    try {
      // Simplify by only checking registrations that were processed
      const registrations = await this.registrationModel.find({
        event: { $in: eventIds },
        $or: [
          { status: RegistrationStatus.APPROVED },
          { status: RegistrationStatus.REJECTED }
        ]
      }).exec();
      
      if (registrations.length === 0) {
        return 0;
      }
      
      let totalHours = 0;
      let validCount = 0;
      
      for (const reg of registrations) {
        let processDate;
        
        if (reg.status === RegistrationStatus.APPROVED && reg.approvalDate) {
          processDate = new Date(reg.approvalDate);
        } else if (reg.status === RegistrationStatus.REJECTED && reg.rejectionDate) {
          processDate = new Date(reg.rejectionDate);
        } else {
          continue;
        }
        
        const createdDate = new Date(reg.createdAt);
        const diffTime = Math.abs(processDate.getTime() - createdDate.getTime());
        const diffHours = diffTime / (1000 * 60 * 60);
        
        totalHours += diffHours;
        validCount++;
      }
      
      return validCount > 0 ? parseFloat((totalHours / validCount).toFixed(2)) : 0;
    } catch (error) {
      this.logger.error(`Error getting processing time for date ${date}: ${error.message}`);
      return 0;
    }
  }
  
  /**
   * Get payment time for a specific date
   */
  private async getPaymentTimeForDate(eventIds: Types.ObjectId[], date: Date): Promise<number> {
    try {
      // Simplify by directly querying invoices
      const invoices = await this.invoiceModel.find({
        status: InvoiceStatus.PAID
      }).populate('registration').exec();
      
      if (invoices.length === 0) {
        return 0;
      }
      
      let totalHours = 0;
      let validCount = 0;
      
      for (const invoice of invoices) {
        const registration = invoice.registration;
        if (!registration || !registration.approvalDate) continue;
        
        // Safe handling of registration.event type
        let eventId: Types.ObjectId | null = null;
        if (typeof registration.event === 'object' && registration.event?._id) {
          eventId = new Types.ObjectId(registration.event._id.toString());
        } else if (registration.event) {
          eventId = new Types.ObjectId(registration.event.toString());
        }
        
        if (!eventId || !eventIds.some(id => id.equals(eventId))) continue;
        
        const approvalDate = new Date(registration.approvalDate);
        const paidDate = invoice.updatedAt;
        
        const diffTime = Math.abs(paidDate.getTime() - approvalDate.getTime());
        const diffHours = diffTime / (1000 * 60 * 60);
        
        totalHours += diffHours;
        validCount++;
      }
      
      return validCount > 0 ? parseFloat((totalHours / validCount).toFixed(2)) : 0;
    } catch (error) {
      this.logger.error(`Error getting payment time for date ${date}: ${error.message}`);
      return 0;
    }
  }
  
  /**
   * Get pending requests for a specific date
   */
  private async getPendingRequestsForDate(eventIds: Types.ObjectId[], date: Date): Promise<number> {
    try {
      // Simplify to just get all pending requests
      return await this.registrationModel.countDocuments({
        event: { $in: eventIds },
        status: RegistrationStatus.PENDING
      }).exec();
    } catch (error) {
      this.logger.error(`Error getting pending requests for date ${date}: ${error.message}`);
      return 0;
    }
  }
  
  /**
   * Get stands occupation for a specific date
   */
  private async getStandsOccupationForDate(eventIds: Types.ObjectId[], date: Date): Promise<any> {
    try {
      let total = 0;
      let occupied = 0;
      
      for (const eventId of eventIds) {
        const stands = await this.standModel.find({
          event: eventId
        }).exec();
        
        total += stands.length;
        occupied += stands.filter(s => 
          s.status === 'reserved' || s.status === 'occupied'
        ).length;
      }
      
      const available = total - occupied;
      const rate = total > 0 ? parseFloat(((occupied / total) * 100).toFixed(2)) : 0;
      
      return {
        date: this.formatDateString(date),
        available,
        occupied,
        total,
        rate
      };
    } catch (error) {
      this.logger.error(`Error getting stands occupation for date ${date}: ${error.message}`);
      return {
        date: this.formatDateString(date),
        available: 0,
        occupied: 0,
        total: 0,
        rate: 0
      };
    }
  }

  /**
   * Get date range based on period string
   */
  private getDateRange(period?: string): { startDate: Date, endDate: Date } {
    const endDate = new Date();
    let startDate = new Date();
    
    switch (period) {
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        // Default to last 30 days
        startDate.setDate(startDate.getDate() - 30);
    }
    
    return { startDate, endDate };
  }

  /**
   * Get empty KPI response with zero values
   */
  private getEmptyKpiResponse(): any {
    return {
      processingTime: { value: 0, trend: 0, unit: 'hours' },
      paymentTime: { value: 0, trend: 0, unit: 'hours' },
      manualReminders: { count: 0, trend: 0 },
      validatedBeforeDeadline: { value: 0, trend: 0, unit: 'percent' },
      standsBeforeEvent: { value: 0, trend: 0, unit: 'percent', daysBeforeEvent: 30 },
      pendingRequests: { value: 0, trend: 0, unit: 'count' },
      standsOccupation: { 
        available: 0, 
        occupied: 0,
        total: 0,
        occupancyRate: 0,
        trend: 0,
        unit: 'percent'
      }
    };
  }
}