// src/plan/plan.service.ts - Modified to support auto-activation
import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { Multer } from 'multer';
import { Plan } from './entities/plan.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { EventService } from '../event/event.service';
import { StandService } from '../stand/stand.service';

@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);
  private readonly uploadPath: string;

  constructor(
    @InjectModel(Plan.name) private readonly planModel: Model<Plan>,
    @Inject(forwardRef(() => EventService)) private readonly eventService: EventService,
    @Inject(forwardRef(() => StandService)) private readonly standService: StandService,
    private readonly configService: ConfigService,
  ) {
    // Set upload path for PDF files
    this.uploadPath = path.join(process.cwd(), '/uploads/plans');
    // Create directory if it doesn't exist
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  /**
   * Create a new plan with PDF
   */
  async createWithPdf(createPlanDto: CreatePlanDto, pdfFile: Multer.File, organizerId: string): Promise<Plan> {
    this.logger.log(`Creating plan: ${createPlanDto.name} for organizer ${organizerId}`);
    
    // Check if plan with same name already exists for this organizer
    const existingPlan = await this.planModel.findOne({
      name: createPlanDto.name,
      organizer: new Types.ObjectId(organizerId)
    });
    
    if (existingPlan) {
      throw new BadRequestException(`A plan with this name already exists for this organizer`);
    }
    
    const plan = new this.planModel({
      name: createPlanDto.name,
      description: createPlanDto.description,
      organizer: new Types.ObjectId(organizerId),
      pdfPath: pdfFile.filename,
    });
    
    return plan.save();
  }
  /**
   * Find all plans with optional search
   */
  async findAll(search?: string): Promise<Plan[]> {
    const query: any = {};
    
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    this.logger.log(`Finding plans with filters: ${JSON.stringify(query)}`);
    
    return this.planModel.find(query)
      .populate('organizer', 'username email')
      .exec();
  }

  /**
   * Find plans by organizer
   */
  async findByOrganizer(organizerId: string): Promise<Plan[]> {
    this.logger.log(`Finding plans for organizer: ${organizerId}`);
    
    return this.planModel.find({ organizer: new Types.ObjectId(organizerId) })
      .exec();
  }

  /**
   * Find plan associated with an event
   */
  async findByEvent(eventId: string): Promise<Plan | null> {
    this.logger.log(`Finding plan for event: ${eventId}`);
    
    try {
      // Get event
      const event = await this.eventService.findOne(eventId);
      
      // If event doesn't have a plan, return null
      if (!event.plan) {
        return null;
      }
      
      // Extract plan ID
      const planId = typeof event.plan === 'object' && event.plan._id 
        ? event.plan._id.toString() 
        : typeof event.plan === 'string' 
          ? event.plan 
          : null;
      
      if (!planId) {
        return null;
      }
      
      // Get plan
      return this.findOne(planId);
    } catch (error) {
      this.logger.error(`Error finding plan for event ${eventId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Find plan by ID
   */
  async findOne(id: string): Promise<Plan> {
    this.logger.log(`Finding plan with ID: ${id}`);
    
    const plan = await this.planModel.findById(id)
      .populate('organizer', 'username email')
      .exec();
    
    if (!plan) {
      this.logger.warn(`Plan with ID ${id} not found`);
      throw new NotFoundException(`Plan with ID ${id} not found`);
    }
    
    return plan;
  }

  /**
   * Update plan with optional PDF
   */
  async update(id: string, updatePlanDto: UpdatePlanDto, pdfFile: Multer.File | undefined, userId: string): Promise<Plan> {
    this.logger.log(`Updating plan with ID: ${id} by user ${userId}`);
    
    const plan = await this.findOne(id);
    
    // Check if user has permission - extract organizer ID
    const organizerId = typeof plan.organizer === 'object' && plan.organizer._id
      ? plan.organizer._id.toString()
      : typeof plan.organizer === 'string'
        ? plan.organizer
        : null;
    
    if (organizerId !== userId) {
      this.logger.warn(`User ${userId} does not have permission to update plan ${id}`);
      throw new ForbiddenException('You do not have permission to update this plan');
    }
    
    // Copy updatePlanDto to avoid modifying original
    const updateData = { ...updatePlanDto };
    
    // Ensure isActive is properly converted to boolean
    if (updateData.isActive !== undefined) {
      updateData.isActive = typeof updateData.isActive === 'string' 
        ? updateData.isActive === 'true'
        : Boolean(updateData.isActive);
    }
    
    // Update PDF if provided
    if (pdfFile) {
      // Delete old PDF if exists
      if (plan.pdfPath) {
        const oldFilePath = path.join(this.uploadPath, plan.pdfPath);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
          this.logger.log(`Deleted old PDF file: ${oldFilePath}`);
        }
      }
      
      updateData['pdfPath'] = pdfFile.filename;
    }
    
    // Update the plan
    const updatedPlan = await this.planModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    )
    .populate('organizer', 'username email')
    .exec();
    
    if (!updatedPlan) {
      throw new NotFoundException(`Plan with ID ${id} not found`);
    }
    
    return updatedPlan;
  }

  /**
   * Remove plan
   */
 async remove(id: string, userId: string): Promise<{ message: string }> {
  this.logger.log(`Removing plan with ID: ${id} by user ${userId}`);
  
  const plan = await this.findOne(id);
  
  // Check if user has permission - extract organizer ID
  const organizerId = typeof plan.organizer === 'object' && plan.organizer._id
    ? plan.organizer._id.toString()
    : typeof plan.organizer === 'string'
      ? plan.organizer
      : null;
  
  if (organizerId !== userId) {
    this.logger.warn(`User ${userId} does not have permission to delete plan ${id}`);
    throw new ForbiddenException('You do not have permission to delete this plan');
  }
  
  // Check if plan is associated with any events
  const events = await this.eventService.findAll();
  const eventsUsingPlan = events.filter(event => {
    if (!event.plan) return false;
    
    const eventPlanId = typeof event.plan === 'object' && event.plan._id
      ? event.plan._id.toString()
      : typeof event.plan === 'string'
        ? event.plan
        : null;
        
    return eventPlanId === id;
  });
  
  if (eventsUsingPlan.length > 0) {
    this.logger.warn(`Plan ${id} is associated with ${eventsUsingPlan.length} events and cannot be deleted`);
    throw new BadRequestException(`Cannot delete a plan that is associated with events. Please dissociate it from all events first.`);
  }
  
  // Delete all stands for this plan
  await this.standService.removeByPlan(id);
  
  // Delete the plan
  await this.planModel.findByIdAndDelete(id).exec();
  
  // Delete the PDF file if it exists
  if (plan.pdfPath) {
    const filePath = path.join(this.uploadPath, plan.pdfPath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      this.logger.log(`Deleted PDF file: ${filePath}`);
    }
  }
  
  return { message: 'Plan and associated stands deleted successfully' };
}

  /**
   * Associate plan with an event
   */
  async associateWithEvent(planId: string, eventId: string, userId: string): Promise<Plan> {
    this.logger.log(`Associating plan ${planId} with event ${eventId}`);
    
    // Verify plan exists and belongs to user
    const plan = await this.findOne(planId);
    
    // Check permissions
    const organizerId = typeof plan.organizer === 'object' && plan.organizer._id
      ? plan.organizer._id.toString()
      : typeof plan.organizer === 'string'
        ? plan.organizer
        : null;
    
    if (organizerId !== userId) {
      this.logger.warn(`User ${userId} does not have permission to associate plan ${planId}`);
      throw new ForbiddenException('You do not have permission to associate this plan');
    }
    
    // Delegate association to event service
    await this.eventService.associatePlan(eventId, planId, userId);
    
    // ** KEY CHANGE: Automatically set plan to active when associated with an event
    if (!plan.isActive) {
      this.logger.log(`Automatically activating plan ${planId} upon first association with event`);
      await this.planModel.findByIdAndUpdate(
        planId,
        { $set: { isActive: true } },
        { new: true }
      );
    }
    
    // Return the updated plan
    return this.findOne(planId);
  }
  /**
   * Dissociate plan from an event
   */
  async dissociateFromEvent(planId: string, eventId: string, userId: string): Promise<Plan> {
    this.logger.log(`Dissociating plan ${planId} from event ${eventId}`);
    
    // Verify plan exists and belongs to user
    const plan = await this.findOne(planId);
    
    // Check permissions
    const organizerId = typeof plan.organizer === 'object' && plan.organizer._id
      ? plan.organizer._id.toString()
      : typeof plan.organizer === 'string'
        ? plan.organizer
        : null;
    
    if (organizerId !== userId) {
      this.logger.warn(`User ${userId} does not have permission to dissociate plan ${planId}`);
      throw new ForbiddenException('You do not have permission to dissociate this plan');
    }
    
    // Verify event exists and uses this plan
    const event = await this.eventService.findOne(eventId);
    
    const eventPlanId = typeof event.plan === 'object' && event.plan._id
      ? event.plan._id.toString()
      : typeof event.plan === 'string'
        ? event.plan
        : null;
        
    if (eventPlanId !== planId) {
      throw new BadRequestException('This event is not associated with this plan');
    }
    
    // Delegate dissociation to event service
    await this.eventService.dissociatePlan(eventId, userId);
    
    // Check if the plan is still associated with any events
    const planWithEvents = await this.planModel.findById(planId).populate('events').exec();
    
    // If the plan has no more associated events, set it to inactive
    if (planWithEvents && (!planWithEvents.events || planWithEvents.events.length === 0)) {
      await this.planModel.findByIdAndUpdate(
        planId,
        { $set: { isActive: false } },
        { new: true }
      );
    }
    
    // Return the updated plan
    return this.findOne(planId);
  }
  /**
 * Check if a user owns a plan
 */
private async isOwner(planId: string, userId: string): Promise<boolean> {
  try {
    const plan = await this.planModel.findById(planId).exec();
    if (!plan) return false;
    
    // Convert both to strings for comparison
    const planOrganizerId = plan.organizer.toString();
    const userIdStr = userId.toString();
    
    this.logger.debug(`Plan ownership check: Plan owned by ${planOrganizerId}, request by ${userIdStr}`);
    
    return planOrganizerId === userIdStr;
  } catch (error) {
    this.logger.error(`Error checking plan ownership: ${error.message}`);
    return false;
  }
}

/**
 * Ensure plan is active
 * Activates a plan if it's not already active
 */
async activatePlan(planId: string): Promise<Plan> {
  this.logger.log(`Ensuring plan ${planId} is active`);
  
  const plan = await this.findOne(planId);
  
  // If already active, just return it
  if (plan.isActive) {
    return plan;
  }
  
  // Activate the plan
  const activatedPlan = await this.planModel.findByIdAndUpdate(
    planId,
    { $set: { isActive: true } },
    { new: true }
  )
  .populate('organizer', 'username email')
  .exec();
  
  if (!activatedPlan) {
    throw new NotFoundException(`Plan with ID ${planId} not found after activation`);
  }
  
  this.logger.log(`Plan ${planId} has been activated`);
  return activatedPlan;
}
}