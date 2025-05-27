// src/event/event.service.ts
import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger, Inject, forwardRef, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { Multer } from 'multer';
import { Event } from './entities/event.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { PlanService } from '../plan/plan.service';
import { StandService } from '../stand/stand.service';
import { Stand } from '../stand/entities/stand.entity';
import { EquipmentService } from '../equipment/equipment.service';
import { UserRole } from '../user/entities/user.entity';
import { EventStatus, EventVisibility } from './entities/event.entity';

@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);
  private readonly uploadPath: string;
  isOwnedByUser: any;

  constructor(
    @InjectModel(Event.name) private readonly eventModel: Model<Event & { _id: Types.ObjectId }>,
    @Inject(forwardRef(() => PlanService)) private readonly planService: PlanService,
    @Inject(forwardRef(() => StandService)) private readonly standService: StandService,
    @Inject(forwardRef(() => EquipmentService)) private readonly equipmentService: EquipmentService,
    private readonly configService: ConfigService,
  ) {
    // Set upload path for images
    this.uploadPath = path.join(process.cwd(), '/uploads/events');
    // Create directory if it doesn't exist
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  /**
   * Check if a user is the owner of an event
   * @param eventId Event ID
   * @param userId User ID
   * @returns Boolean indicating if the user is the owner
   */
  async isOwner(eventId: string, userId: string): Promise<boolean> {
    try {
      // Direct database query to verify ownership
      const event = await this.eventModel.findById(eventId).exec();
      if (!event) {
        this.logger.warn(`Event not found for ownership check: ${eventId}`);
        return false;
      }
      
      // Convert both IDs to strings using toString() for consistent comparison
      const organizerId = event.organizer.toString();
      const userIdStr = userId.toString();
      
      this.logger.log(`Event ownership check: user=${userIdStr}, organizer=${organizerId}`);
      
      return organizerId === userIdStr;
    } catch (error) {
      this.logger.error(`Error checking event ownership: ${error.message}`);
      return false;
    }
  }

  /**
   * Create a new event
   */
  async create(createEventDto: CreateEventDto, organizerId: string): Promise<Event> {
    this.logger.log(`Creating event: ${createEventDto.name} for organizer ${organizerId}`);
    
    try {
      // Clean organizer ID
      const cleanOrganizerId = String(organizerId).trim();
      
      // Check if event with same name already exists for this organizer
      const existingEvent = await this.eventModel.findOne({
        name: createEventDto.name,
        organizer: new Types.ObjectId(cleanOrganizerId)
      });
      
      if (existingEvent) {
        throw new BadRequestException(`An event with this name already exists for this organizer`);
      }
      
      // Extract equipment IDs and create a clean event object
      const { equipmentIds, ...cleanEventData } = createEventDto;

      // Create base event data
      const eventData: any = {
        ...cleanEventData,
        organizer: new Types.ObjectId(cleanOrganizerId)
      };
      
      // Handle plan ID if provided
      if (cleanEventData.planId) {
        try {
          // Get the plan to verify ownership
          const plan = await this.planService.findOne(cleanEventData.planId);
          
          // Verify plan ownership
          const planOrganizerId = typeof plan.organizer === 'object' && plan.organizer._id
            ? String(plan.organizer._id).trim()
            : String(plan.organizer).trim();
            
          if (planOrganizerId !== cleanOrganizerId) {
            throw new BadRequestException('You can only use your own plans for events');
          }
          
          // Automatically activate the plan if it's not already active
          if (!plan.isActive) {
            this.logger.log(`Activating plan ${cleanEventData.planId} as it's being associated with new event`);
            await this.planService.activatePlan(cleanEventData.planId);
          }
          
          eventData.plan = new Types.ObjectId(cleanEventData.planId);
        } catch (error) {
          if (error instanceof BadRequestException) throw error;
          throw new BadRequestException(`Invalid plan ID: ${error.message}`);
        }
      }
      
      // Remove planId from the data we'll save
      delete eventData.planId;
      
      // Create the event
      const newEvent = new this.eventModel(eventData);
      const savedEvent = await newEvent.save();
      
      // Handle equipment associations separately
      if (equipmentIds && equipmentIds.length > 0) {
        this.logger.log(`Associating ${equipmentIds.length} equipment items with event ${savedEvent._id}`);
        
        const associationPromises = equipmentIds.map(async (equipmentId) => {
          try {
            await this.equipmentService.associateWithEvent(
              equipmentId,
              { eventId: String(savedEvent._id) },
              cleanOrganizerId,
              UserRole.ORGANIZER
            );
            return true;
          } catch (error) {
            this.logger.warn(`Failed to associate equipment ${equipmentId}: ${error.message}`);
            return false;
          }
        });
        
        // Wait for all equipment associations to complete
        await Promise.all(associationPromises);
      }
      
      return savedEvent;
    } catch (error) {
      // Handle errors
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error; // Pass through application errors
      }
      
      this.logger.error(`Error creating event: ${error.message}`, error.stack);
      
      // Provide clear error message
      throw new InternalServerErrorException(`Failed to create event: ${error.message}`);
    }
  }

  /**
   * Find all events with optional search
   */
  async findAll(search?: string, status?: string, upcoming?: boolean): Promise<Event[]> {
    const query: any = {};
    
    // Filter by search string (case-insensitive)
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'location.city': { $regex: search, $options: 'i' } },
        { 'location.country': { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter for upcoming events
    if (upcoming) {
      query.startDate = { $gte: new Date() };
    }
    
    return this.eventModel.find(query)
      .populate('organizer', 'username email')
      .populate('plan', 'name')
      .sort({ startDate: 1 }) // Sort by date ascending
      .exec();
  }

  /**
   * Find events by organizer
   */
  async findByOrganizer(organizerId: string): Promise<Event[]> {
    const cleanOrganizerId = String(organizerId).trim();
    return this.eventModel.find({ organizer: new Types.ObjectId(cleanOrganizerId) })
      .populate('plan', 'name')
      .sort({ startDate: 1 })
      .exec();
  }

  /**
   * Find event by ID
   */
  async findOne(id: string): Promise<Event> {
    try {
      const cleanId = String(id).trim();
      
      // Use aggregation to get equipment
      const events = await this.eventModel.aggregate([
        { $match: { _id: new Types.ObjectId(cleanId) } },
        { $lookup: {
            from: 'equipment',
            localField: '_id',
            foreignField: 'events',
            as: 'equipment'
          }
        }
      ]).exec();
      
      if (!events || events.length === 0) {
        this.logger.warn(`Event with ID ${cleanId} not found`);
        throw new NotFoundException(`Event with ID ${cleanId} not found`);
      }
      
      // Get the event with populated equipment
      const event = events[0];
      
      // Now get equipment IDs for the frontend
      const equipmentIds = event.equipment ? 
        event.equipment.map(eq => String(eq._id)) : [];
      
      // Now populate other fields using mongoose
      const populatedEvent = await this.eventModel.findById(cleanId)
        .populate('organizer', 'username email')
        .populate('plan', 'name')
        .exec();
  
      if (!populatedEvent) {
        throw new NotFoundException(`Event with ID ${cleanId} not found`);
      }
      
      // Merge the populated event with equipment IDs
      const result = populatedEvent.toObject();
      result.equipmentIds = equipmentIds;
      
      return result;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error finding event ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to find event');
    }
  }

  /**
   * Upload an image for an event
   */
  async uploadImage(id: string, file: Multer.File, userId: string): Promise<Event> {
    this.logger.log(`Uploading image for event ${id} by user ${userId}`);
    
    try {
      // Clean the IDs
      const cleanEventId = String(id).trim();
      const cleanUserId = String(userId).trim();
      
      // Check ownership with the simplified method
      const isOwner = await this.isOwner(cleanEventId, cleanUserId);
      
      if (!isOwner) {
        throw new ForbiddenException('You do not have permission to modify this event');
      }
      
      // Get the event
      const event = await this.eventModel.findById(cleanEventId).exec();
      
      if (!event) {
        throw new NotFoundException(`Event with ID ${cleanEventId} not found`);
      }
      
      // Delete old image if exists
      if (event.imagePath) {
        const oldFilePath = path.join(this.uploadPath, event.imagePath);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
          this.logger.log(`Deleted old image: ${oldFilePath}`);
        }
      }
      
      // Update the event with the image path
      const updatedEvent = await this.eventModel.findByIdAndUpdate(
        cleanEventId,
        { imagePath: file.filename },
        { new: true }
      )
      .populate('organizer', 'username email')
      .populate('plan', 'name')
      .exec();
      
      // Get the equipment IDs for the response
      const equipmentForEvent = await this.equipmentService.findByEvent(cleanEventId);
      const equipmentIds = equipmentForEvent.map(eq => String((eq as any)._id));
      
      // Merge the updated event with equipment IDs
      if (!updatedEvent) {
        throw new NotFoundException(`Event not found after update`);
      }

      const result = updatedEvent.toObject();
      result.equipmentIds = equipmentIds;
      
      return result;
    } catch (error) {
      // Pass through known exceptions
      if (error instanceof ForbiddenException || error instanceof NotFoundException) {
        throw error;
      }
      
      this.logger.error(`Error uploading image for event ${id}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to upload image');
    }
  }

  /**
   * Update event
   */
  async update(id: string, updateEventDto: UpdateEventDto, userId: string): Promise<Event> {
    this.logger.log(`Updating event with ID: ${id}`);
    
    try {
      // Clean the IDs
      const cleanEventId = String(id).trim();
      const cleanUserId = String(userId).trim();
      
      // Check ownership with the simplified method
      const isOwner = await this.isOwner(cleanEventId, cleanUserId);
      
      if (!isOwner) {
        throw new ForbiddenException('You do not have permission to modify this event');
      }
      
      // Extract equipmentIds to handle separately
      const { equipmentIds, ...updateData } = updateEventDto;
      
      // Handle planId if provided
      const updateModelData: any = { ...updateData };
      if (updateData.planId) {
        // Get the plan to verify ownership
        const plan = await this.planService.findOne(updateData.planId);
        
        // Check plan ownership
        const planOwnerIdStr = typeof plan.organizer === 'object' && plan.organizer._id
          ? String(plan.organizer._id).trim()
          : String(plan.organizer).trim();
            
        if (planOwnerIdStr !== cleanUserId) {
          throw new BadRequestException('You can only use your own plans for events');
        }
        
        // Automatically activate the plan if it's not already active
        if (!plan.isActive) {
          this.logger.log(`Activating plan ${updateData.planId} as it's being associated with event`);
          await this.planService.activatePlan(updateData.planId);
        }
        
        updateModelData.plan = new Types.ObjectId(updateData.planId);
        delete updateModelData.planId;
      } else if (updateData.planId === null) {
        updateModelData.plan = null;
        delete updateModelData.planId;
      }
      
      // Update the event
      const updatedEvent = await this.eventModel.findByIdAndUpdate(
        cleanEventId,
        { $set: updateModelData },
        { new: true }
      )
      .populate('organizer', 'username email')
      .populate('plan', 'name')
      .exec();
      
      if (!updatedEvent) {
        throw new NotFoundException(`Event with ID ${cleanEventId} not found after update`);
      }
      
      // Handle equipment updates if provided
      if (equipmentIds !== undefined) {
        // Get current equipment for the event
        const currentEquipment = await this.equipmentService.findByEvent(cleanEventId);
        const currentEquipmentIds = currentEquipment.map(eq => String((eq as any)._id));
      
        // Find equipment to add and remove
        const equipmentToAdd = equipmentIds.filter(
          eqId => !currentEquipmentIds.includes(eqId)
        );
        
        const equipmentToRemove = currentEquipmentIds.filter(
          eqId => !equipmentIds.includes(eqId)
        );
        
        // Associate new equipment
        for (const equipmentId of equipmentToAdd) {
          try {
            await this.equipmentService.associateWithEvent(
              equipmentId,
              { eventId: cleanEventId },
              cleanUserId,
              UserRole.ORGANIZER
            );
          } catch (error) {
            this.logger.warn(`Failed to associate equipment ${equipmentId} with event: ${error.message}`);
          }
        }
        
        // Dissociate removed equipment
        for (const equipmentId of equipmentToRemove) {
          try {
            await this.equipmentService.dissociateFromEvent(
              equipmentId,
              cleanEventId,
              cleanUserId,
              UserRole.ORGANIZER
            );
          } catch (error) {
            this.logger.warn(`Failed to dissociate equipment ${equipmentId} from event: ${error.message}`);
          }
        }
      }
      
      return updatedEvent;
    } catch (error) {
      if (error instanceof NotFoundException || 
          error instanceof ForbiddenException || 
          error instanceof BadRequestException) {
        throw error;
      }
      
      this.logger.error(`Error updating event: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to update event: ${error.message}`);
    }
  }

  /**
   * Remove event
   */
  async remove(id: string, userId: string): Promise<{ message: string }> {
    this.logger.log(`Removing event with ID: ${id}`);
    
    try {
      // Clean the IDs
      const cleanEventId = String(id).trim();
      const cleanUserId = String(userId).trim();
      
      // Check ownership with the simplified method
      const isOwner = await this.isOwner(cleanEventId, cleanUserId);
      
      if (!isOwner) {
        throw new ForbiddenException('You do not have permission to modify this event');
      }
      
      // Get the event
      const event = await this.eventModel.findById(cleanEventId).exec();
      
      if (!event) {
        throw new NotFoundException(`Event with ID ${cleanEventId} not found`);
      }
      
      // Delete the event image if exists
      if (event.imagePath) {
        const imagePath = path.join(this.uploadPath, event.imagePath);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }
      
      // Delete the event
      await this.eventModel.findByIdAndDelete(cleanEventId).exec();
      
      return { message: 'Event deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException || 
          error instanceof ForbiddenException) {
        throw error;
      }
      
      this.logger.error(`Error deleting event: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to delete event: ${error.message}`);
    }
  }

  /**
   * Associate a plan with an event
   */
  async associatePlan(id: string, planId: string, userId: string): Promise<Event> {
    this.logger.log(`Associating plan ${planId} with event ${id}`);
    
    try {
      // Clean the IDs
      const cleanEventId = String(id).trim();
      const cleanPlanId = String(planId).trim();
      const cleanUserId = String(userId).trim();
      
      // Check ownership with the simplified method
      const isOwner = await this.isOwner(cleanEventId, cleanUserId);
      
      if (!isOwner) {
        throw new ForbiddenException('You do not have permission to modify this event');
      }
      
      // Now verify plan exists and belongs to the user
      const plan = await this.planService.findOne(cleanPlanId);
      
      // Extract organizer ID properly whether it's a populated object or just an ID
      const planOrganizerId = typeof plan.organizer === 'object' && plan.organizer._id
        ? String(plan.organizer._id).trim()
        : typeof plan.organizer === 'string'
          ? String(plan.organizer).trim()
          : null;
      
      this.logger.debug(`Plan ownership check: Plan organizer=${planOrganizerId}, User=${cleanUserId}`);
      
      if (planOrganizerId !== cleanUserId) {
        throw new BadRequestException(`You can only associate your own plans with your event`);
      }
      
      // Automatically activate the plan if it's not already active
      if (!plan.isActive) {
        this.logger.log(`Activating plan ${cleanPlanId} as it's being associated with event`);
        await this.planService.activatePlan(cleanPlanId);
      }
      
      // Update the event with the plan
      const updatedEvent = await this.eventModel.findByIdAndUpdate(
        cleanEventId,
        { plan: new Types.ObjectId(cleanPlanId) },
        { new: true }
      )
      .populate('organizer', 'username email')
      .populate('plan', 'name')
      .exec();
      
      if (!updatedEvent) {
        throw new NotFoundException(`Event with ID ${cleanEventId} not found after update`);
      }
      
      return updatedEvent;
    } catch (error) {
      if (error instanceof NotFoundException || 
          error instanceof ForbiddenException || 
          error instanceof BadRequestException) {
        throw error;
      }
      
      this.logger.error(`Error associating plan: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to associate plan: ${error.message}`);
    }
  }

  /**
   * Dissociate plan from an event
   */
  async dissociatePlan(id: string, userId: string): Promise<Event> {
    this.logger.log(`Dissociating plan from event ${id}`);
    
    try {
      // Clean the IDs
      const cleanEventId = String(id).trim();
      const cleanUserId = String(userId).trim();
      
      // Check ownership with the simplified method
      const isOwner = await this.isOwner(cleanEventId, cleanUserId);
      
      if (!isOwner) {
        throw new ForbiddenException('You do not have permission to modify this event');
      }
      
      // Get event to check if it has a plan
      const event = await this.eventModel.findById(cleanEventId).exec();
      
      // Check if event has a plan
      if (!event || !event.plan) {
        throw new BadRequestException('This event does not have an associated plan');
      }
      
      // Update the event to remove the plan
      const updatedEvent = await this.eventModel.findByIdAndUpdate(
        cleanEventId,
        { $unset: { plan: "" } },
        { new: true }
      )
      .populate('organizer', 'username email')
      .exec();
      
      if (!updatedEvent) {
        throw new NotFoundException(`Event with ID ${cleanEventId} not found after update`);
      }
      
      return updatedEvent;
    } catch (error) {
      if (error instanceof NotFoundException || 
          error instanceof ForbiddenException || 
          error instanceof BadRequestException) {
        throw error;
      }
      
      this.logger.error(`Error dissociating plan: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to dissociate plan: ${error.message}`);
    }
  }

  /**
   * Find all stands for an event
   */
  async findStands(id: string): Promise<Stand[]> {
    this.logger.log(`Finding stands for event ${id}`);
    
    try {
      const cleanEventId = String(id).trim();
      
      // First check if event exists
      const event = await this.findOne(cleanEventId);
      
      // Check if event has a plan
      if (!event || !event.plan) {
        return [];
      }
      
      // Get the plan ID
      const planId = typeof event.plan === 'object' && event.plan._id 
        ? String(event.plan._id)
        : typeof event.plan === 'string' 
          ? event.plan 
          : null;
      
      if (!planId) {
        return [];
      }
      
      // Get all stands for this plan
      const stands = await this.standService.findByPlan(planId);
      
      return stands;
    } catch (error) {
      this.logger.error(`Error finding stands for event ${id}: ${error.message}`);
      return [];
    }
  }

  /**
   * Find all available stands for an event
   */
  async findAvailableStands(id: string): Promise<Stand[]> {
    this.logger.log(`Finding available stands for event ${id}`);
    
    try {
      const cleanEventId = String(id).trim();
      
      // First check if event exists
      const event = await this.findOne(cleanEventId);
      
      // Check if event has a plan
      if (!event || !event.plan) {
        return [];
      }
      
      // Get the plan ID
      const planId = typeof event.plan === 'object' && event.plan._id 
        ? String(event.plan._id)
        : typeof event.plan === 'string' 
          ? event.plan 
          : null;
      
      if (!planId) {
        return [];
      }
      
      // Get all stands for this plan
      const stands = await this.standService.findByPlan(planId);
      
      // Filter for available stands
      return stands.filter(stand => stand.status === 'available');
    } catch (error) {
      this.logger.error(`Error finding available stands for event ${id}: ${error.message}`);
      return [];
    }
  }
/**
 * Get public events with filters
 */
async getPublicEvents(search?: string, sector?: string, upcoming: boolean = true): Promise<Event[]> {
  this.logger.log(`Finding public events with filters: search=${search}, sector=${sector}, upcoming=${upcoming}`);
  
  const query: any = {
    status: EventStatus.PUBLISHED,
    visibility: EventVisibility.PUBLIC,
  };
  
  // Filter by search string (case-insensitive)
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { 'location.city': { $regex: search, $options: 'i' } },
      { 'location.country': { $regex: search, $options: 'i' } }
    ];
  }

  // Filter by sector if provided
  if (sector) {
    query.allowedSectors = sector;
  }

  // Filter for upcoming events
  if (upcoming) {
    query.startDate = { $gte: new Date() };
  }
  
  return this.eventModel.find(query)
    .populate('organizer', 'username email')
    .populate('plan', 'name')
    .sort({ startDate: 1 })
    .exec();
}
async findPublicEvents(search?: string, sector?: string, upcoming: boolean = true): Promise<Event[]> {
  this.logger.log(`Finding public events with filters: search=${search}, sector=${sector}, upcoming=${upcoming}`);
  
  try {
    const query: any = {
      status: EventStatus.PUBLISHED,
      visibility: EventVisibility.PUBLIC,
    };
    
    // Filter by search string (case-insensitive)
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'location.city': { $regex: search, $options: 'i' } },
        { 'location.country': { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by sector if provided
    if (sector) {
      query.allowedSectors = sector;
    }

    // Filter for upcoming events
    if (upcoming) {
      query.startDate = { $gte: new Date() };
    }
    
    return this.eventModel.find(query)
      .populate('organizer', 'username email')
      .populate('plan', 'name')
      .sort({ startDate: 1 })
      .exec();
  } catch (error) {
    this.logger.error(`Error finding public events: ${error.message}`, error.stack);
    throw new InternalServerErrorException('Failed to find public events');
  }
}
  /**
   * Get statistics for an event
   */
  async getEventStats(id: string): Promise<any> {
    this.logger.log(`Getting statistics for event ${id}`);
    
    try {
      const cleanEventId = String(id).trim();
      const event = await this.findOne(cleanEventId);
      
      if (!event) {
        throw new NotFoundException(`Event with ID ${cleanEventId} not found`);
      }
      
      const stands = await this.findStands(cleanEventId);
      
      // Count stands by status
      const totalStands = stands.length;
      const availableStands = stands.filter(s => s.status === 'available').length;
      const reservedStands = stands.filter(s => s.status === 'reserved').length;
      const unavailableStands = stands.filter(s => s.status === 'unavailable').length;
      
      // Calculate revenue potential based on stand base prices
      let totalRevenuePotential = 0;
      let currentRevenue = 0;
      
      for (const stand of stands) {
        if (stand.basePrice) {
          totalRevenuePotential += stand.basePrice;
          
          if (stand.status === 'reserved') {
            currentRevenue += stand.basePrice;
          }
        }
      }
      
      // Get stand IDs for reporting
      const standIds = stands.map(s => {
        if (s && typeof s === 'object' && s._id) {
          return String(s._id);
        }
        return '';
      }).filter(id => id !== '');
      
      // Ensure event._id is safely handled
      const eventId = event._id ? String(event._id) : cleanEventId;
      
      return {
        eventId: eventId,
        eventName: event.name,
        startDate: event.startDate,
        endDate: event.endDate,
        location: event.location,
        status: event.status,
        statistics: {
          totalStands,
          availableStands,
          reservedStands,
          unavailableStands,
          occupancyRate: totalStands > 0 ? (reservedStands / totalStands * 100).toFixed(2) : '0',
          totalRevenuePotential,
          currentRevenue,
          revenuePercentage: totalRevenuePotential > 0 ? (currentRevenue / totalRevenuePotential * 100).toFixed(2) : '0',
        },
        standIds
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      this.logger.error(`Error getting event stats: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to get event statistics: ${error.message}`);
    }
  }
  
  /**
   * Get dashboard data for all events of an organizer
   */
  async getOrganizerDashboard(organizerId: string): Promise<any> {
    this.logger.log(`Getting dashboard data for organizer ${organizerId}`);
    
    const cleanOrganizerId = String(organizerId).trim();
    
    // Get all events for this organizer
    const events = await this.findByOrganizer(cleanOrganizerId);
    
    if (!events.length) {
      return {
        totalEvents: 0,
        upcomingEvents: 0,
        ongoingEvents: 0,
        pastEvents: 0,
        totalStands: 0,
        totalReservations: 0,
        totalRevenue: 0,
        events: []
      };
    }
    
    const now = new Date();
    
    // Count event statistics
    const upcomingEvents = events.filter(e => new Date(e.startDate) > now).length;
    const ongoingEvents = events.filter(e => new Date(e.startDate) <= now && new Date(e.endDate) >= now).length;
    const pastEvents = events.filter(e => new Date(e.endDate) < now).length;
    
    // Get stand statistics
    let totalStands = 0;
    let totalReservations = 0;
    let totalRevenue = 0;
    
    // Get stands for all events
    const allStands: Stand[] = [];
    
    for (const event of events) {
      // Safely get event ID
      const eventId = event._id ? String(event._id) : '';
      if (!eventId) continue;
      
      const stands = await this.findStands(eventId);
      totalStands += stands.length;
      totalReservations += stands.filter(s => s.status === 'reserved').length;
      
      // Calculate revenue
      for (const stand of stands) {
        if (stand.status === 'reserved' && stand.basePrice) {
          totalRevenue += stand.basePrice;
        }
      }
      
      allStands.push(...stands);
    }
    
    // Get stand IDs for reporting
    const standIds = allStands.map(s => {
      if (s && typeof s === 'object' && s._id) {
        return String(s._id);
      }
      return '';
    }).filter(id => id !== '');
    
    // Create simplified event summaries
    const eventSummaries = events.map(event => {
      // Safely get event ID
      const eventId = event._id ? String(event._id) : '';
      if (!eventId) return null;
      
      // Get stands for this event
      const eventStands = allStands.filter(s => {
        if (!s.plan || typeof s.plan !== 'object') return false;
        
        const standPlanId = s.plan._id ? String(s.plan._id) : '';
        const eventPlanId = typeof event.plan === 'object' && event.plan && event.plan._id
          ? String(event.plan._id)
          : typeof event.plan === 'string'
            ? event.plan
            : '';
            
        return standPlanId === eventPlanId;
      });
      
      const reservedStands = eventStands.filter(s => s.status === 'reserved').length;
      
      return {
        id: eventId,
        name: event.name,
        startDate: event.startDate,
        endDate: event.endDate,
        status: event.status,
        totalStands: eventStands.length,
        reservedStands,
        occupancyRate: eventStands.length > 0 ? (reservedStands / eventStands.length * 100).toFixed(2) : '0'
      };
    }).filter(summary => summary !== null);
    
    return {
      totalEvents: events.length,
      upcomingEvents,
      ongoingEvents,
      pastEvents,
      totalStands,
      totalReservations,
      totalRevenue,
      occupancyRate: totalStands > 0 ? (totalReservations / totalStands * 100).toFixed(2) : '0',
      events: eventSummaries,
      standIds
    };
  }
}