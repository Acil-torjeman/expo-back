// src/analytics/analytics.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Analytics } from './entities/analytics.entity';
import { Registration, RegistrationStatus } from '../registration/entities/registration.entity';
import { Event } from '../event/entities/event.entity';
import { Stand } from '../stand/entities/stand.entity';
import { Invoice, InvoiceStatus } from '../invoice/entities/invoice.entity';
import { Organizer } from '../organizer/entities/organizer.entity';

interface RegistrationWithTimestamps extends Registration {
    createdAt: Date;
    updatedAt: Date;
  }

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
      
      // Set date range for analytics
      const { startDate, endDate } = this.getDateRange(period);
      
      // Query for events by this organizer
      let eventsQuery: any = { organizer: new Types.ObjectId(organizerId) };
      
      // If specific event requested, add to query
      if (eventId) {
        eventsQuery._id = new Types.ObjectId(eventId);
      }
      
      // Get events for this organizer
      const events = await this.eventModel.find(eventsQuery).exec();
      
      if (events.length === 0) {
        return {
          period: { startDate, endDate },
          kpis: this.getEmptyKpiResponse()
        };
      }
      
      const eventIds = events.map(event => event._id);
      
      // Calculate each KPI
      const kpis = await this.calculateAllKpis(
        organizerId,
        eventIds.map((id: Types.ObjectId) => new Types.ObjectId(id.toString())),
        startDate, 
        endDate
      );
      
      return {
        period: { startDate, endDate },
        kpis
      };
    } catch (error) {
      this.logger.error(`Error getting analytics: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Calculate all KPIs for the dashboard
   */
  private async calculateAllKpis(organizerId: string, eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<any> {
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
    
    // For the manual reminders - this will need a new field to be added to your model 
    // as it's not currently tracked in the system
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
  }

  /**
   * Calculate average processing time for registrations (hours)
   */
  private async calculateAverageProcessingTime(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<any> {
    const registrations = await this.registrationModel.find({
      event: { $in: eventIds },
      createdAt: { $gte: startDate, $lte: endDate },
      $or: [
        { status: RegistrationStatus.APPROVED },
        { status: RegistrationStatus.REJECTED }
      ]
    }).exec();
    
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
    
    // Calculate trend - would compare to previous period in a real implementation
    const trend = 0;
    
    return {
      value: parseFloat(average.toFixed(2)),
      trend,
      unit: 'hours'
    };
  }

  /**
   * Calculate average time between registration approval and payment (hours)
   */
  private async calculateAveragePaymentTime(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<any> {
    const registrations = await this.registrationModel.find({
      event: { $in: eventIds },
      status: RegistrationStatus.COMPLETED,
      approvalDate: { $gte: startDate, $lte: endDate }
    }).exec();
    
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
    
    const average = validCount > 0 ? totalHours / validCount : 0;
    const trend = 0;
    
    return {
      value: parseFloat(average.toFixed(2)),
      trend,
      unit: 'hours'
    };
  }

  /**
   * Calculate percentage of exhibitors validated before deadline
   */
  private async calculateValidatedBeforeDeadline(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<any> {
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
        status: RegistrationStatus.APPROVED,
        approvalDate: { $lte: endDate }
      }).exec();
      
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
  }

  /**
   * Calculate percentage of stands reserved X days before event
   */
  private async calculateStandsReservedBeforeEvent(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<any> {
    const daysBeforeEvent = 30; // Default - can be made configurable
    
    const events = await this.eventModel.find({
      _id: { $in: eventIds },
      startDate: { $gte: startDate, $lte: endDate }
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
      // Get all stands for this event
      const stands = await this.standModel.find({
        event: event._id
      }).exec();
      
      totalStands += stands.length;
      
      // Calculate the date that's X days before the event
      const eventStartDate = new Date(event.startDate);
      const deadlineDate = new Date(eventStartDate);
      deadlineDate.setDate(deadlineDate.getDate() - daysBeforeEvent);
      
      // Get all completed registrations that have stands
      const completedRegistrations = await this.registrationModel.find({
        event: event._id,
        status: RegistrationStatus.COMPLETED,
        stands: { $exists: true, $ne: [] },
        updatedAt: { $lte: deadlineDate }
      }).exec();
      
      // Count unique stands that were reserved
      const reservedStandIds = new Set();
      
      for (const reg of completedRegistrations) {
        if (reg.stands) {
          reg.stands.forEach(stand => {
            const standId = stand._id ? stand._id.toString() : stand.toString();
            reservedStandIds.add(standId);
          });
        }
      }
      
      reservedBeforeDeadline += reservedStandIds.size;
    }
    
    const percentage = totalStands > 0 ? (reservedBeforeDeadline / totalStands) * 100 : 0;
    const trend = 0;
    
    return {
      value: parseFloat(percentage.toFixed(2)),
      trend,
      unit: 'percent',
      daysBeforeEvent
    };
  }

  /**
   * Calculate number of pending registration requests
   */
  private async calculatePendingRequests(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<any> {
    const pendingCount = await this.registrationModel.countDocuments({
      event: { $in: eventIds },
      status: RegistrationStatus.PENDING,
      createdAt: { $gte: startDate, $lte: endDate }
    }).exec();
    
    // For trend, calculate pending from previous period
    const trend = 0;
    
    return {
      value: pendingCount,
      trend,
      unit: 'count'
    };
  }

  /**
   * Calculate stands occupation (available vs occupied)
   */
  private async calculateStandsOccupation(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<any> {
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
      
      // Count occupied stands - any with status 'reserved'
      const occupied = stands.filter(stand => stand.status === 'reserved').length;
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