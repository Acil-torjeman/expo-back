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
      
      const organizer = await this.organizerModel.findById(organizerId);
      if (!organizer) {
        throw new NotFoundException(`Organizer with ID ${organizerId} not found`);
      }

      const userId = organizer.user;
      const { startDate, endDate, previousStartDate, previousEndDate } = this.getDateRanges(period);
      
      const eventsQuery: any = { organizer: userId };
      if (eventId) {
        eventsQuery._id = new Types.ObjectId(eventId);
      }
      
      const events = await this.eventModel.find(eventsQuery).exec();
      
      if (events.length === 0) {
        return this.getEmptyResponse(startDate, endDate);
      }
      
      const eventIds = events.map(event => event._id);
      
      const kpis = await this.calculateAllKpis(
        organizerId,
        eventIds.map((id: Types.ObjectId) => new Types.ObjectId(id.toString())),
        startDate, 
        endDate,
        previousStartDate,
        previousEndDate
      );
      
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
   * Calculate all KPIs for the dashboard
   */
  private async calculateAllKpis(
    organizerId: string, 
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
      // Calculate current period KPIs
      const [
        processingTime,
        paymentTime,
        pendingRequests,
        equipmentReserved,
        totalRevenue
      ] = await Promise.all([
        this.calculateAverageProcessingTime(eventIds, startDate, endDate),
        this.calculateAveragePaymentTime(eventIds, startDate, endDate),
        this.calculatePendingRequests(eventIds, startDate, endDate),
        this.calculateEquipmentReserved(eventIds, startDate, endDate),
        this.calculateTotalRevenue(organizerId, eventIds, startDate, endDate)
      ]);
      
      // Calculate previous period KPIs for trends
      const [
        previousProcessingTime,
        previousPaymentTime,
        previousPendingRequests,
        previousEquipmentReserved,
        previousTotalRevenue
      ] = await Promise.all([
        this.calculateAverageProcessingTime(eventIds, previousStartDate, previousEndDate),
        this.calculateAveragePaymentTime(eventIds, previousStartDate, previousEndDate),
        this.calculatePendingRequests(eventIds, previousStartDate, previousEndDate),
        this.calculateEquipmentReserved(eventIds, previousStartDate, previousEndDate),
        this.calculateTotalRevenue(organizerId, eventIds, previousStartDate, previousEndDate)
      ]);
      
      // Calculate trends
      processingTime.trend = this.calculateTrend(processingTime.value, previousProcessingTime.value, true);
      paymentTime.trend = this.calculateTrend(paymentTime.value, previousPaymentTime.value, true);
      pendingRequests.trend = this.calculateTrend(pendingRequests.value, previousPendingRequests.value, true);
      equipmentReserved.trend = this.calculateTrend(equipmentReserved.value, previousEquipmentReserved.value);
      totalRevenue.trend = this.calculateTrend(totalRevenue.value, previousTotalRevenue.value);
      
      return {
        processingTime,
        paymentTime,
        pendingRequests,
        equipmentReserved,
        totalRevenue
      };
    } catch (error) {
      this.logger.error(`Error calculating KPIs: ${error.message}`, error.stack);
      return this.getEmptyKpiResponse();
    }
  }

  /**
   * Calculate number of equipment reserved
   */
  private async calculateEquipmentReserved(
    eventIds: Types.ObjectId[], 
    startDate: Date, 
    endDate: Date
  ): Promise<any> {
    try {
      const registrations = await this.registrationModel.find({
        event: { $in: eventIds },
        status: { $in: [RegistrationStatus.APPROVED, RegistrationStatus.COMPLETED] },
        createdAt: { $gte: startDate, $lte: endDate }
      }).exec();
      
      let totalEquipmentReserved = 0;
      
      for (const registration of registrations) {
        if (registration.equipmentQuantities && registration.equipmentQuantities.length > 0) {
          for (const item of registration.equipmentQuantities) {
            totalEquipmentReserved += item.quantity || 1;
          }
        } else if (registration.equipment && registration.equipment.length > 0) {
          totalEquipmentReserved += registration.equipment.length;
        }
      }
      
      return {
        value: totalEquipmentReserved,
        trend: 0,
        unit: 'count'
      };
    } catch (error) {
      this.logger.error(`Error calculating equipment reserved: ${error.message}`, error.stack);
      return { value: 0, trend: 0, unit: 'count' };
    }
  }

  /**
   * Calculate total revenue from paid invoices
   */
  private async calculateTotalRevenue(
    organizerId: string,
    eventIds: Types.ObjectId[], 
    startDate: Date, 
    endDate: Date
  ): Promise<any> {
    try {
      const paidInvoices = await this.invoiceModel.find({
        organizer: new Types.ObjectId(organizerId),
        event: { $in: eventIds },
        status: InvoiceStatus.PAID,
        createdAt: { $gte: startDate, $lte: endDate }
      }).exec();
      
      const totalRevenue = paidInvoices.reduce((sum, invoice) => sum + (invoice.total || 0), 0);
      
      return {
        value: parseFloat(totalRevenue.toFixed(2)),
        trend: 0,
        unit: 'currency'
      };
    } catch (error) {
      this.logger.error(`Error calculating total revenue: ${error.message}`, error.stack);
      return { value: 0, trend: 0, unit: 'currency' };
    }
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
      const registrations = await this.registrationModel.find({
        event: { $in: eventIds },
        $or: [
          { status: RegistrationStatus.APPROVED },
          { status: RegistrationStatus.REJECTED }
        ],
        createdAt: { $gte: startDate, $lte: endDate }
      }).exec();
      
      if (registrations.length === 0) {
        return { value: 0, trend: 0, unit: 'hours' };
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
        trend: 0,
        unit: 'hours'
      };
    } catch (error) {
      this.logger.error(`Error calculating processing time: ${error.message}`, error.stack);
      return { value: 0, trend: 0, unit: 'hours' };
    }
  }

  /**
   * Calculate average payment time
   */
  private async calculateAveragePaymentTime(
    eventIds: Types.ObjectId[], 
    startDate: Date, 
    endDate: Date
  ): Promise<any> {
    try {
      const registrations = await this.registrationModel.find({
        event: { $in: eventIds },
        status: RegistrationStatus.COMPLETED,
        createdAt: { $gte: startDate, $lte: endDate }
      }).exec();
      
      if (registrations.length === 0) {
        return { value: 0, trend: 0, unit: 'hours' };
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
      
      const average = validCount > 0 ? totalHours / validCount : 0;
      
      return {
        value: parseFloat(average.toFixed(2)),
        trend: 0,
        unit: 'hours'
      };
    } catch (error) {
      this.logger.error(`Error calculating payment time: ${error.message}`, error.stack);
      return { value: 0, trend: 0, unit: 'hours' };
    }
  }

  /**
   * Calculate pending requests
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
      
      return {
        value: pendingCount,
        trend: 0,
        unit: 'count'
      };
    } catch (error) {
      this.logger.error(`Error calculating pending requests: ${error.message}`, error.stack);
      return { value: 0, trend: 0, unit: 'count' };
    }
  }

  /**
   * Generate time series data for charts
   */
  private async generateTimeSeriesData(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<any> {
    try {
      const datePoints = this.generateDatePoints(startDate, endDate, 8);
      
      const processingTimeData: number[] = [];
      const paymentTimeData: number[] = [];
      const pendingRequestsData: number[] = [];
      const equipmentReservedData: number[] = [];
      const revenueData: number[] = [];
      
      for (const date of datePoints) {
        const currentEndDate = new Date(date);
        
        const processingTime = await this.getProcessingTimeForDate(eventIds, startDate, currentEndDate);
        processingTimeData.push(processingTime);
        
        const paymentTime = await this.getPaymentTimeForDate(eventIds, startDate, currentEndDate);
        paymentTimeData.push(paymentTime);
        
        const pendingRequests = await this.getPendingRequestsForDate(eventIds, startDate, currentEndDate);
        pendingRequestsData.push(pendingRequests);
        
        const equipmentReserved = await this.getEquipmentReservedForDate(eventIds, startDate, currentEndDate);
        equipmentReservedData.push(equipmentReserved);
        
        const revenue = await this.getRevenueForDate(eventIds, startDate, currentEndDate);
        revenueData.push(revenue);
      }
      
      return {
        datePoints: datePoints.map(d => this.formatDateString(d)),
        processingTimeData,
        paymentTimeData,
        pendingRequestsData,
        equipmentReservedData,
        revenueData
      };
    } catch (error) {
      this.logger.error(`Error generating time series data: ${error.message}`, error.stack);
      return this.generateEmptyTimeSeriesData(startDate, endDate);
    }
  }

  /**
   * Get equipment reserved for date range
   */
  private async getEquipmentReservedForDate(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<number> {
    try {
      const result = await this.calculateEquipmentReserved(eventIds, startDate, endDate);
      return result.value;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get revenue for date range
   */
  private async getRevenueForDate(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<number> {
    try {
      // Find organizer for these events
      const event = await this.eventModel.findOne({ _id: { $in: eventIds } }).exec();
      if (!event) return 0;
      
      const organizer = await this.organizerModel.findOne({ user: event.organizer }).exec();
      if (!organizer) return 0;
      
      // Fix the TypeScript error by properly typing the organizer._id
      const organizerIdString = (organizer._id as Types.ObjectId).toString();
      const result = await this.calculateTotalRevenue(organizerIdString, eventIds, startDate, endDate);
      return result.value;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Helper methods
   */
  private calculateTrend(currentValue: number, previousValue: number, inversed: boolean = false): number {
    if (previousValue === 0) {
      return currentValue > 0 ? (inversed ? -100 : 100) : 0;
    }
    
    const trend = ((currentValue - previousValue) / previousValue) * 100;
    return inversed ? -trend : trend;
  }

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
        startDate.setDate(startDate.getDate() - 30);
        durationInDays = 30;
    }
    
    const previousEndDate = new Date(startDate);
    previousEndDate.setDate(previousEndDate.getDate() - 1);
    
    const previousStartDate = new Date(previousEndDate);
    previousStartDate.setDate(previousStartDate.getDate() - durationInDays);
    
    return { startDate, endDate, previousStartDate, previousEndDate };
  }

  private getEmptyResponse(startDate: Date, endDate: Date): any {
    return {
      period: { startDate, endDate },
      kpis: this.getEmptyKpiResponse(),
      timeSeriesData: this.generateEmptyTimeSeriesData(startDate, endDate)
    };
  }

  private getEmptyKpiResponse(): any {
    return {
      processingTime: { value: 0, trend: 0, unit: 'hours' },
      paymentTime: { value: 0, trend: 0, unit: 'hours' },
      pendingRequests: { value: 0, trend: 0, unit: 'count' },
      equipmentReserved: { value: 0, trend: 0, unit: 'count' },
      totalRevenue: { value: 0, trend: 0, unit: 'currency' }
    };
  }

  private generateEmptyTimeSeriesData(startDate: Date, endDate: Date): any {
    const datePoints = this.generateDatePoints(startDate, endDate, 8);
    
    return {
      datePoints: datePoints.map(d => this.formatDateString(d)),
      processingTimeData: Array(datePoints.length).fill(0),
      paymentTimeData: Array(datePoints.length).fill(0),
      pendingRequestsData: Array(datePoints.length).fill(0),
      equipmentReservedData: Array(datePoints.length).fill(0),
      revenueData: Array(datePoints.length).fill(0)
    };
  }

  private generateDatePoints(startDate: Date, endDate: Date, count: number): Date[] {
    const points: Date[] = [];
    const interval = (endDate.getTime() - startDate.getTime()) / (count - 1);
    
    for (let i = 0; i < count; i++) {
      const date = new Date(startDate.getTime() + (interval * i));
      points.push(date);
    }
    
    return points;
  }
  
  private formatDateString(date: Date | string): string {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  }
  
  private async getProcessingTimeForDate(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<number> {
    try {
      const result = await this.calculateAverageProcessingTime(eventIds, startDate, endDate);
      return result.value;
    } catch (error) {
      return 0;
    }
  }
  
  private async getPaymentTimeForDate(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<number> {
    try {
      const result = await this.calculateAveragePaymentTime(eventIds, startDate, endDate);
      return result.value;
    } catch (error) {
      return 0;
    }
  }
  
  private async getPendingRequestsForDate(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<number> {
    try {
      const result = await this.calculatePendingRequests(eventIds, startDate, endDate);
      return result.value;
    } catch (error) {
      return 0;
    }
  }
}