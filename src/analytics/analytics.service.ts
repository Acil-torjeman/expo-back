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

  async getDashboardData(organizerId: string, eventId?: string, period?: string): Promise<any> {
    try {
      this.logger.log(`Getting analytics for organizer: ${organizerId}`);
      
      const organizer = await this.organizerModel.findById(organizerId);
      if (!organizer) {
        throw new NotFoundException(`Organizer with ID ${organizerId} not found`);
      }

      const userId = organizer.user;
      const { startDate, endDate } = this.getDateRanges(period);
      
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
        events
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

  private async calculateAllKpis(
    organizerId: string, 
    eventIds: Types.ObjectId[], 
    startDate: Date, 
    endDate: Date,
    events: any[]
  ): Promise<any> {
    if (!eventIds || eventIds.length === 0) {
      return this.getEmptyKpiResponse();
    }
    
    try {
      const [
        processingTime,
        paymentTime,
        equipmentReserved,
        totalRevenue,
        standsReserved30Days,
        pendingRequests,
        validatedBeforeDeadline,
        standsOccupation,
        paymentTimeDistribution
      ] = await Promise.all([
        this.calculateAverageProcessingTime(eventIds, startDate, endDate),
        this.calculateAveragePaymentTime(eventIds, startDate, endDate),
        this.calculateEquipmentReserved(eventIds, startDate, endDate),
        this.calculateTotalRevenue(organizerId, eventIds, startDate, endDate),
        this.calculateStandsReserved30Days(eventIds, events),
        this.calculatePendingRequests(eventIds, startDate, endDate),
        this.calculateValidatedBeforeDeadline(eventIds, events),
        this.calculateStandsOccupation(eventIds),
        this.calculatePaymentTimeDistribution(eventIds, startDate, endDate)
      ]);
      
      return {
        processingTime,
        paymentTime,
        equipmentReserved,
        totalRevenue,
        standsReserved30Days,
        pendingRequests,
        validatedBeforeDeadline,
        standsOccupation,
        paymentTimeDistribution
      };
    } catch (error) {
      this.logger.error(`Error calculating KPIs: ${error.message}`, error.stack);
      return this.getEmptyKpiResponse();
    }
  }

  private async calculatePaymentTimeDistribution(
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
      
      const distribution = {
        'Under 24h': 0,
        '1-2 days': 0,
        '3-5 days': 0,
        '1 week+': 0,
        '2 weeks+': 0
      };
      
      let totalPayments = 0;
      
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
        
        totalPayments++;
        
        if (diffHours < 24) {
          distribution['Under 24h']++;
        } else if (diffHours < 48) {
          distribution['1-2 days']++;
        } else if (diffHours < 120) {
          distribution['3-5 days']++;
        } else if (diffHours < 168) {
          distribution['1 week+']++;
        } else {
          distribution['2 weeks+']++;
        }
      }
      
      // Convert counts to percentages
      const percentageDistribution = {};
      Object.keys(distribution).forEach(key => {
        percentageDistribution[key] = totalPayments > 0 
          ? parseFloat(((distribution[key] / totalPayments) * 100).toFixed(1))
          : 0;
      });
      
      return {
        labels: Object.keys(distribution),
        data: Object.values(percentageDistribution),
        totalPayments
      };
    } catch (error) {
      this.logger.error(`Error calculating payment time distribution: ${error.message}`, error.stack);
      return {
        labels: ['Under 24h', '1-2 days', '3-5 days', '1 week+', '2 weeks+'],
        data: [0, 0, 0, 0, 0],
        totalPayments: 0
      };
    }
  }
  
  private async calculateStandsReserved30Days(eventIds: Types.ObjectId[], events: any[]): Promise<any> {
    try {
      let totalStandsReserved30Days = 0;
      
      for (const event of events) {
        const eventStartDate = new Date(event.startDate);
        const thirtyDaysBeforeEvent = new Date(eventStartDate);
        thirtyDaysBeforeEvent.setDate(thirtyDaysBeforeEvent.getDate() - 30);
        
        const registrations = await this.registrationModel.find({
          event: event._id,
          status: { $in: [RegistrationStatus.APPROVED, RegistrationStatus.COMPLETED] },
          updatedAt: { $lte: thirtyDaysBeforeEvent }
        }).exec();
        
        for (const registration of registrations) {
          if (registration.stands && registration.stands.length > 0) {
            totalStandsReserved30Days += registration.stands.length;
          }
        }
      }
      
      return {
        value: totalStandsReserved30Days
      };
    } catch (error) {
      this.logger.error(`Error calculating stands reserved 30 days: ${error.message}`, error.stack);
      return { value: 0 };
    }
  }

  async getParticipantsByEvent(organizerId: string): Promise<any> {
  try {
    const events = await this.eventModel.find({ 
      organizer: new Types.ObjectId(organizerId) 
    }).exec();

    const eventParticipants = await Promise.all(
      events.map(async (event) => {
        const participantCount = await this.registrationModel.countDocuments({
          event: event._id,
          status: { $in: [RegistrationStatus.APPROVED, RegistrationStatus.COMPLETED] }
        }).exec();

        return {
          eventName: event.name,
          participants: participantCount
        };
      })
    );

    return {
      labels: eventParticipants.map(item => item.eventName),
      data: eventParticipants.map(item => item.participants),
      total: eventParticipants.reduce((sum, item) => sum + item.participants, 0)
    };
  } catch (error) {
    this.logger.error(`Error getting participants by event: ${error.message}`);
    return {
      labels: [],
      data: [],
      total: 0
    };
  }
}

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
        return { value: 0 };
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
        value: parseFloat(average.toFixed(2))
      };
    } catch (error) {
      this.logger.error(`Error calculating processing time: ${error.message}`, error.stack);
      return { value: 0 };
    }
  }

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
        return { value: 0 };
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
        value: parseFloat(average.toFixed(2))
      };
    } catch (error) {
      this.logger.error(`Error calculating payment time: ${error.message}`, error.stack);
      return { value: 0 };
    }
  }

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
        value: totalEquipmentReserved
      };
    } catch (error) {
      this.logger.error(`Error calculating equipment reserved: ${error.message}`, error.stack);
      return { value: 0 };
    }
  }

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
        value: parseFloat(totalRevenue.toFixed(2))
      };
    } catch (error) {
      this.logger.error(`Error calculating total revenue: ${error.message}`, error.stack);
      return { value: 0 };
    }
  }

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
        value: pendingCount
      };
    } catch (error) {
      this.logger.error(`Error calculating pending requests: ${error.message}`, error.stack);
      return { value: 0 };
    }
  }

  private async calculateValidatedBeforeDeadline(eventIds: Types.ObjectId[], events: any[]): Promise<any> {
    try {
      let totalValidated = 0;
      let totalValidatedBeforeDeadline = 0;
      
      for (const event of events) {
        const registrationDeadline = new Date(event.registrationDeadline);
        
        const allValidatedRegistrations = await this.registrationModel.find({
          event: event._id,
          status: { $in: [RegistrationStatus.APPROVED, RegistrationStatus.COMPLETED] }
        }).exec();
        
        totalValidated += allValidatedRegistrations.length;
        
        const validatedBeforeDeadline = allValidatedRegistrations.filter(reg => {
          const validationDate = reg.approvalDate || reg.updatedAt;
          return new Date(validationDate) <= registrationDeadline;
        });
        
        totalValidatedBeforeDeadline += validatedBeforeDeadline.length;
      }
      
      const percentage = totalValidated > 0 ? (totalValidatedBeforeDeadline / totalValidated) * 100 : 0;
      
      return {
        value: parseFloat(percentage.toFixed(1))
      };
    } catch (error) {
      this.logger.error(`Error calculating validated before deadline: ${error.message}`, error.stack);
      return { value: 0 };
    }
  }

  private async calculateStandsOccupation(eventIds: Types.ObjectId[]): Promise<any> {
    try {
      const events = await this.eventModel.find({ _id: { $in: eventIds } }).populate('plan').exec();
      
      let totalStands = 0;
      let occupiedStands = 0;
      let availableStands = 0;
      
      for (const event of events) {
        if (!event.plan) continue;
        
        const planId = typeof event.plan === 'object' ? event.plan._id : event.plan;
        const stands = await this.standModel.find({ plan: planId }).exec();
        
        totalStands += stands.length;
        
        for (const stand of stands) {
          if (stand.status === 'reserved') {
            occupiedStands++;
          } else if (stand.status === 'available') {
            availableStands++;
          }
        }
      }
      
      return {
        total: totalStands,
        occupied: occupiedStands,
        available: availableStands
      };
    } catch (error) {
      this.logger.error(`Error calculating stands occupation: ${error.message}`, error.stack);
      return { total: 0, occupied: 0, available: 0 };
    }
  }

  private async generateTimeSeriesData(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<any> {
    try {
      const datePoints = this.generateDatePoints(startDate, endDate, 8);
      
      const processingTimeData: number[] = [];
      const paymentTimeData: number[] = [];
      const revenueData: number[] = [];
      const pendingRequestsData: number[] = [];
      
      for (const date of datePoints) {
        const currentEndDate = new Date(date);
        
        const processingTime = await this.getProcessingTimeForDate(eventIds, startDate, currentEndDate);
        processingTimeData.push(processingTime);
        
        const paymentTime = await this.getPaymentTimeForDate(eventIds, startDate, currentEndDate);
        paymentTimeData.push(paymentTime);
        
        const revenue = await this.getRevenueForDate(eventIds, startDate, currentEndDate);
        revenueData.push(revenue);
        
        const pendingRequests = await this.getPendingRequestsForDate(eventIds, startDate, currentEndDate);
        pendingRequestsData.push(pendingRequests);
      }
      
      return {
        datePoints: datePoints.map(d => this.formatDateString(d)),
        processingTimeData,
        paymentTimeData,
        revenueData,
        pendingRequestsData
      };
    } catch (error) {
      this.logger.error(`Error generating time series data: ${error.message}`, error.stack);
      return this.generateEmptyTimeSeriesData(startDate, endDate);
    }
  }

  private getDateRanges(period?: string): { startDate: Date, endDate: Date } {
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
        startDate.setDate(startDate.getDate() - 30);
    }
    
    return { startDate, endDate };
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
      processingTime: { value: 0 },
      paymentTime: { value: 0 },
      equipmentReserved: { value: 0 },
      totalRevenue: { value: 0 },
      standsReserved30Days: { value: 0 },
      pendingRequests: { value: 0 },
      validatedBeforeDeadline: { value: 0 },
      standsOccupation: { total: 0, occupied: 0, available: 0 },
      paymentTimeDistribution: {
        labels: ['Under 24h', '1-2 days', '3-5 days', '1 week+', '2 weeks+'],
        data: [0, 0, 0, 0, 0],
        totalPayments: 0
      }
    };
  }

  private generateEmptyTimeSeriesData(startDate: Date, endDate: Date): any {
    const datePoints = this.generateDatePoints(startDate, endDate, 8);
    
    return {
      datePoints: datePoints.map(d => this.formatDateString(d)),
      processingTimeData: Array(datePoints.length).fill(0),
      paymentTimeData: Array(datePoints.length).fill(0),
      revenueData: Array(datePoints.length).fill(0),
      pendingRequestsData: Array(datePoints.length).fill(0)
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
  
  private async getRevenueForDate(eventIds: Types.ObjectId[], startDate: Date, endDate: Date): Promise<number> {
    try {
      const event = await this.eventModel.findOne({ _id: { $in: eventIds } }).exec();
      if (!event) return 0;
      
      const organizer = await this.organizerModel.findOne({ user: event.organizer }).exec();
      if (!organizer) return 0;
      
      const organizerIdString = (organizer._id as Types.ObjectId).toString();
      const result = await this.calculateTotalRevenue(organizerIdString, eventIds, startDate, endDate);
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