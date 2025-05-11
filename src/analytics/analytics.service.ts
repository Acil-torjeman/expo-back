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
import { Plan } from '../plan/entities/plan.entity';

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
    @InjectModel(Plan.name) private planModel: Model<Plan>,
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

      // Get the user ID associated with this organizer
      const userId = organizer.user;
      this.logger.log(`Found organizer's user ID: ${userId}`);
      
      // Set date range for analytics
      const { startDate, endDate, previousStartDate, previousEndDate } = this.getDateRanges(period);
      
      // Query for events by this organizer's user ID
      const eventsQuery: any = { 
        organizer: userId
      };
      
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
        endDate,
        previousStartDate,
        previousEndDate
      );
      
      // Generate time series data for charts
      const timeSeriesData = await this.generateTimeSeriesData(
        eventIds.map((id: Types.ObjectId) => new Types.ObjectId(id.toString())),
        startDate,
        endDate
      );
      
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
  private async calculateAllKpis(
    _organizerId: string, 
    eventIds: Types.ObjectId[], 
    startDate: Date, 
    endDate: Date,
    previousStartDate: Date,
    previousEndDate: Date
  ): Promise<any> {
    if (!eventIds || eventIds.length === 0) {
      return this.getEmptyKpiResponse();
    }
    
    try {
      // Log the event IDs we're using for calculations
      this.logger.log(`Calculating KPIs for events: ${eventIds.map(id => id.toString())}`);
      
      // Check if there are any registrations for these events
      const registrationsCount = await this.registrationModel.countDocuments({
        event: { $in: eventIds }
      }).exec();
      
      this.logger.log(`Found ${registrationsCount} total registrations for these events`);
      
      // Calculate current period KPIs
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
      
      // Calculate previous period KPIs for trends
      const [
        previousProcessingTime,
        previousPaymentTime,
        previousValidatedBeforeDeadline,
        previousStandsBeforeEvent,
        previousPendingRequests,
        previousStandsOccupation
      ] = await Promise.all([
        this.calculateAverageProcessingTime(eventIds, previousStartDate, previousEndDate),
        this.calculateAveragePaymentTime(eventIds, previousStartDate, previousEndDate),
        this.calculateValidatedBeforeDeadline(eventIds, previousStartDate, previousEndDate),
        this.calculateStandsReservedBeforeEvent(eventIds, previousStartDate, previousEndDate),
        this.calculatePendingRequests(eventIds, previousStartDate, previousEndDate),
        this.calculateStandsOccupation(eventIds, previousStartDate, previousEndDate)
      ]);
      
      // Calculate trends
      processingTime.trend = this.calculateTrend(processingTime.value, previousProcessingTime.value, true);
      paymentTime.trend = this.calculateTrend(paymentTime.value, previousPaymentTime.value, true);
      validatedBeforeDeadline.trend = this.calculateTrend(validatedBeforeDeadline.value, previousValidatedBeforeDeadline.value);
      standsBeforeEvent.trend = this.calculateTrend(standsBeforeEvent.value, previousStandsBeforeEvent.value);
      pendingRequests.trend = this.calculateTrend(pendingRequests.value, previousPendingRequests.value, true);
      standsOccupation.trend = this.calculateTrend(standsOccupation.occupancyRate, previousStandsOccupation.occupancyRate);
      
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
   * Calculate trend percentage between current and previous values
   * @param currentValue Current period value
   * @param previousValue Previous period value
   * @param inversed Set to true if lower values are better (like processing time)
   * @returns Trend percentage
   */
  private calculateTrend(currentValue: number, previousValue: number, inversed: boolean = false): number {
    if (previousValue === 0) {
      return currentValue > 0 ? (inversed ? -100 : 100) : 0;
    }
    
    const trend = ((currentValue - previousValue) / previousValue) * 100;
    
    // If inversed, multiply by -1 (e.g., for processing time, lower is better)
    return inversed ? -trend : trend;
  }

  /**
   * Calculate average processing time for registrations (hours)
   */
  private async calculateAverageProcessingTime(
    eventIds: Types.ObjectId[], 
    startDate: Date, 
    endDate: Date
  ): Promise<any> {
    try {
      // Find registrations that were processed within the date range
      const registrations = await this.registrationModel.find({
        event: { $in: eventIds },
        $or: [
          { status: RegistrationStatus.APPROVED },
          { status: RegistrationStatus.REJECTED }
        ],
        createdAt: { $gte: startDate, $lte: endDate }
      }).exec();
      
      this.logger.log(`Found ${registrations.length} processed registrations in date range`);
      
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
      
      return {
        value: parseFloat(average.toFixed(2)),
        trend: 0, // Will be calculated later
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
  private async calculateAveragePaymentTime(
    eventIds: Types.ObjectId[], 
    startDate: Date, 
    endDate: Date
  ): Promise<any> {
    try {
      // Find completed registrations within the date range
      const registrations = await this.registrationModel.find({
        event: { $in: eventIds },
        status: RegistrationStatus.COMPLETED,
        createdAt: { $gte: startDate, $lte: endDate }
      }).exec();
      
      this.logger.log(`Found ${registrations.length} completed registrations in date range`);
      
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
          status: InvoiceStatus.PAID,
          createdAt: { $gte: startDate, $lte: endDate }
        }).exec();
        
        if (!invoice) continue;
        
        const approvalDate = new Date(reg.approvalDate);
        const paidDate = invoice.updatedAt;
        
        const diffTime = Math.abs(paidDate.getTime() - approvalDate.getTime());
        const diffHours = diffTime / (1000 * 60 * 60);
        
        totalHours += diffHours;
        validCount++;
      }
      
      this.logger.log(`Found ${validCount} paid invoices with valid approval dates in date range`);
      
      const average = validCount > 0 ? totalHours / validCount : 0;
      
      return {
        value: parseFloat(average.toFixed(2)),
        trend: 0, // Will be calculated later
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
  private async calculateValidatedBeforeDeadline(
    eventIds: Types.ObjectId[], 
    startDate: Date, 
    endDate: Date
  ): Promise<any> {
    try {
      // Get events and their registration deadlines
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
          status: RegistrationStatus.APPROVED,
          approvalDate: { $gte: startDate, $lte: endDate }
        }).exec();
        
        this.logger.log(`Event ${event._id}: ${registrations.length} approved registrations in date range, deadline: ${deadline}`);
        
        for (const reg of registrations) {
          totalValidated++;
          
          if (reg.approvalDate && new Date(reg.approvalDate) <= deadline) {
            validatedBeforeDeadline++;
          }
        }
      }
      
      const percentage = totalValidated > 0 ? (validatedBeforeDeadline / totalValidated) * 100 : 0;
      
      return {
        value: parseFloat(percentage.toFixed(2)),
        trend: 0, // Will be calculated later
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
  private async calculateStandsReservedBeforeEvent(
    eventIds: Types.ObjectId[], 
    startDate: Date, 
    endDate: Date
  ): Promise<any> {
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
        // Get the plan associated with this event
        if (!event.plan) {
          this.logger.warn(`Event ${event._id} has no associated plan`);
          continue;
        }
        
        const planId = typeof event.plan === 'object' && event.plan._id
          ? new Types.ObjectId(event.plan._id.toString())
          : new Types.ObjectId(event.plan.toString());
          
        // Get all stands for this plan
        const stands = await this.standModel.find({
          plan: planId
        }).exec();
        
        totalStands += stands.length;
        
        if (stands.length === 0) {
          this.logger.warn(`No stands found for plan ${planId} of event ${event._id}`);
          continue;
        }
        
        this.logger.log(`Event ${event._id}: Found ${stands.length} stands for plan ${planId}`);
        
        // Calculate the date that's X days before the event
        const eventStartDate = new Date(event.startDate);
        const deadlineDate = new Date(eventStartDate);
        deadlineDate.setDate(deadlineDate.getDate() - daysBeforeEvent);
        
        // Count stands that are reserved
        const reservedStands = stands.filter(stand => {
          const isReserved = stand.status === StandStatus.RESERVED || stand.status === 'reserved';
          const updatedAtDate = this.getDateProperty(stand, 'updatedAt');
          
          // If we can't determine the update date, just check the status
          if (!updatedAtDate) return isReserved;
          
          return isReserved && updatedAtDate >= startDate && updatedAtDate <= endDate;
        });
        
        this.logger.log(`Event ${event._id}: ${reservedStands.length} stands reserved in date range`);
        
        reservedBeforeDeadline += reservedStands.length;
      }
      
      const percentage = totalStands > 0 ? (reservedBeforeDeadline / totalStands) * 100 : 0;
      
      return {
        value: parseFloat(percentage.toFixed(2)),
        trend: 0, // Will be calculated later
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
  private async calculatePendingRequests(
    eventIds: Types.ObjectId[], 
    startDate: Date, 
    endDate: Date
  ): Promise<any> {
    try {
      const pendingCount = await this.registrationModel.countDocuments({
        event: { $in: eventIds },
        status: RegistrationStatus.PENDING,
        createdAt: { $gte: startDate, $lte: endDate }
      }).exec();
      
      this.logger.log(`Found ${pendingCount} pending registrations in date range`);
      
      return {
        value: pendingCount,
        trend: 0, // Will be calculated later
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
  private async calculateStandsOccupation(
    eventIds: Types.ObjectId[], 
    startDate: Date, 
    endDate: Date
  ): Promise<any> {
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
        // Get the plan associated with this event
        if (!event.plan) {
          this.logger.warn(`Event ${event._id} has no associated plan`);
          continue;
        }
        
        const planId = typeof event.plan === 'object' && event.plan._id
          ? new Types.ObjectId(event.plan._id.toString())
          : new Types.ObjectId(event.plan.toString());
        
        // Get all stands for this plan
        const stands = await this.standModel.find({
          plan: planId
        }).exec();
        
        totalStands += stands.length;
        
        if (stands.length === 0) {
          this.logger.warn(`No stands found for plan ${planId} of event ${event._id}`);
          continue;
        }
        
        // Log the stands statuses for debugging
        const statusCounts = {};
        stands.forEach(stand => {
          const status = stand.status || 'unknown';
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        
        this.logger.log(`Event ${event._id}: Stands by status: ${JSON.stringify(statusCounts)}`);
        
        // Count occupied stands - any with status 'reserved' or 'occupied'
        const occupied = stands.filter(stand => {
          const isOccupied = stand.status === 'reserved' || stand.status === 'occupied';
          const updatedAtDate = this.getDateProperty(stand, 'updatedAt');
          
          // If we can't determine the update date, just check the status
          if (!updatedAtDate) return isOccupied;
          
          return isOccupied && updatedAtDate >= startDate && updatedAtDate <= endDate;
        }).length;
        
        occupiedStands += occupied;
      }
      
      const availableStands = totalStands - occupiedStands;
      const occupancyRate = totalStands > 0 ? (occupiedStands / totalStands) * 100 : 0;
      
      return {
        available: availableStands,
        occupied: occupiedStands,
        total: totalStands,
        occupancyRate: parseFloat(occupancyRate.toFixed(2)),
        trend: 0, // Will be calculated later
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
        const currentEndDate = new Date(date);
        
        // For processing time
        const processingTime = await this.getProcessingTimeForDate(eventIds, startDate, currentEndDate);
        processingTimeData.push(processingTime);
        
        // For payment time
        const paymentTime = await this.getPaymentTimeForDate(eventIds, startDate, currentEndDate);
        paymentTimeData.push(paymentTime);
        
        // For pending requests
        const pendingRequests = await this.getPendingRequestsForDate(eventIds, startDate, currentEndDate);
        pendingRequestsData.push(pendingRequests);
        
        // For stands occupation
        const standsOccupation = await this.getStandsOccupationForDate(eventIds, startDate, currentEndDate);
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
   * Get processing time for a specific date range
   */
  private async getProcessingTimeForDate(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<number> {
    try {
      const result = await this.calculateAverageProcessingTime(eventIds, startDate, endDate);
      return result.value;
    } catch (error) {
      this.logger.error(`Error getting processing time for date range ${startDate} - ${endDate}: ${error.message}`);
      return 0;
    }
  }
  
  /**
   * Get payment time for a specific date range
   */
  private async getPaymentTimeForDate(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<number> {
    try {
      const result = await this.calculateAveragePaymentTime(eventIds, startDate, endDate);
      return result.value;
    } catch (error) {
      this.logger.error(`Error getting payment time for date range ${startDate} - ${endDate}: ${error.message}`);
      return 0;
    }
  }
  
  /**
   * Get pending requests for a specific date range
   */
  private async getPendingRequestsForDate(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<number> {
    try {
      const result = await this.calculatePendingRequests(eventIds, startDate, endDate);
      return result.value;
    } catch (error) {
      this.logger.error(`Error getting pending requests for date range ${startDate} - ${endDate}: ${error.message}`);
      return 0;
    }
  }
  
  /**
   * Get stands occupation for a specific date range
   */
  private async getStandsOccupationForDate(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<any> {
    try {
      const result = await this.calculateStandsOccupation(eventIds, startDate, endDate);
      
      return {
        date: this.formatDateString(endDate),
        available: result.available,
        occupied: result.occupied,
        total: result.total,
        rate: result.occupancyRate
      };
    } catch (error) {
      this.logger.error(`Error getting stands occupation for date range ${startDate} - ${endDate}: ${error.message}`);
      return {
        date: this.formatDateString(endDate),
        available: 0,
        occupied: 0,
        total: 0,
        rate: 0
      };
    }
  }

  /**
   * Get date ranges for current and previous periods based on period string
   */
  private getDateRanges(period?: string): { 
    startDate: Date, 
    endDate: Date,
    previousStartDate: Date,
    previousEndDate: Date  
  } {
    const endDate = new Date();
    let startDate = new Date();
    let durationInDays: number;
    
    switch (period) {
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        durationInDays = 7;
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        durationInDays = 30;
        break;
      case 'quarter':
        startDate.setMonth(startDate.getMonth() - 3);
        durationInDays = 90;
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        durationInDays = 365;
        break;
      default:
        // Default to last 30 days
        startDate.setDate(startDate.getDate() - 30);
        durationInDays = 30;
    }
    
    // Calculate previous period dates (same duration, immediately before current period)
    const previousEndDate = new Date(startDate);
    previousEndDate.setDate(previousEndDate.getDate() - 1);
    
    const previousStartDate = new Date(previousEndDate);
    previousStartDate.setDate(previousStartDate.getDate() - durationInDays);
    
    return { startDate, endDate, previousStartDate, previousEndDate };
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
  
  /**
   * Check if a date property exists on an object
   * Helper method to safely work with Mongoose timestamps
   */
  private getDateProperty(obj: any, propertyName: string): Date | null {
    if (obj && obj[propertyName] && obj[propertyName] instanceof Date) {
      return obj[propertyName];
    }
    
    if (obj && obj[propertyName] && typeof obj[propertyName] === 'string') {
      return new Date(obj[propertyName]);
    }
    
    return null;
  }
}