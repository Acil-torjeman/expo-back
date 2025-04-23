// src/stand/stand.service.ts
import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Stand, StandStatus } from './entities/stand.entity';
import { CreateStandDto } from './dto/create-stand.dto';
import { UpdateStandDto } from './dto/update-stand.dto';
import { UpdateStandStatusDto } from './dto/update-stand-status.dto';
import { PlanService } from '../plan/plan.service';
import { Plan } from '../plan/entities/plan.entity';

@Injectable()
export class StandService {
  private readonly logger = new Logger(StandService.name);

  constructor(
    @InjectModel(Stand.name) private readonly standModel: Model<Stand>,
    @Inject(forwardRef(() => PlanService)) private readonly planService: PlanService,
  ) {}

  /**
   * Create a new stand
   */
  async create(createStandDto: CreateStandDto, userId: string): Promise<Stand> {
    // Verify plan exists and user has permission to add stands to it
    const plan = await this.planService.findOne(createStandDto.plan);
    
    // Check if user is the owner of the plan
    let organizerId: string | undefined = undefined;
    
    if (plan.organizer) {
      if (typeof plan.organizer === 'object' && plan.organizer._id) {
        organizerId = plan.organizer._id.toString();
      } else if (typeof plan.organizer === 'string') {
        organizerId = plan.organizer;
      }
    }
    
    if (organizerId !== userId) {
      throw new ForbiddenException('You do not have permission to add stands to this plan');
    }
    
    // Check if a stand with this number already exists in the plan
    const existingStand = await this.standModel.findOne({
      number: createStandDto.number,
      plan: new Types.ObjectId(createStandDto.plan)
    });
    
    if (existingStand) {
      throw new BadRequestException(`A stand with number ${createStandDto.number} already exists in this plan`);
    }
    
    // Create new stand
    const stand = new this.standModel({
      ...createStandDto,
      plan: new Types.ObjectId(createStandDto.plan),
      status: StandStatus.AVAILABLE
    });
    
    return stand.save();
  }

  /**
   * Find all stands with optional filters
   */
  async findAll(type?: string, status?: string, search?: string): Promise<Stand[]> {
    const query: any = {};
    
    if (type) {
      query.type = type;
    }
    
    if (status) {
      query.status = status;
    }
    
    if (search) {
      query.number = { $regex: search, $options: 'i' };
    }
    
    return this.standModel.find(query)
      .populate({
        path: 'plan',
        select: 'name organizer',
        populate: {
          path: 'organizer',
          select: 'username email'
        }
      })
      .exec();
  }

  /**
   * Find stands by plan
   */
  async findByPlan(planId: string): Promise<Stand[]> {
    return this.standModel.find({ plan: new Types.ObjectId(planId) })
      .exec();
  }

  /**
   * Find stands by event
   */
  async findByEvent(eventId: string): Promise<Stand[]> {
    // First, find the plan associated with this event
    const plan = await this.planService.findByEvent(eventId);
    
    // If no plan, return empty array
    if (!plan) {
      return [];
    }
    
    // Safely get plan ID - ensure plan is a Plan object
    const planDoc = plan as Plan;
    const planId = planDoc._id ? planDoc._id.toString() : '';
    
    if (!planId) {
      this.logger.warn(`No valid plan ID found for event ${eventId}`);
      return [];
    }
    
    // Find all stands for this plan
    return this.standModel.find({
      plan: new Types.ObjectId(planId)
    })
      .populate({
        path: 'plan',
        select: 'name organizer',
        populate: {
          path: 'organizer',
          select: 'username email'
        }
      })
      .exec();
  }

  /**
   * Find available stands for an event
   */
  async findAvailableByEvent(eventId: string): Promise<Stand[]> {
    // First, find the plan associated with this event
    const plan = await this.planService.findByEvent(eventId);
    
    // If no plan, return empty array
    if (!plan) {
      return [];
    }
    
    // Safely get plan ID - ensure plan is a Plan object
    const planDoc = plan as Plan;
    const planId = planDoc._id ? planDoc._id.toString() : '';
    
    if (!planId) {
      this.logger.warn(`No valid plan ID found for event ${eventId}`);
      return [];
    }
    
    // Find all available stands for this plan
    return this.standModel.find({
      plan: new Types.ObjectId(planId),
      status: StandStatus.AVAILABLE
    })
      .populate({
        path: 'plan',
        select: 'name',
        populate: {
          path: 'organizer',
          select: 'username email'
        }
      })
      .exec();
  }

  /**
   * Find stand by ID
   */
  async findOne(id: string): Promise<Stand> {
    const stand = await this.standModel.findById(id)
      .populate({
        path: 'plan',
        select: 'name organizer pdfPath',
        populate: {
          path: 'organizer',
          select: 'username email'
        }
      })
      .exec();
    
    if (!stand) {
      throw new NotFoundException(`Stand with ID ${id} not found`);
    }
    
    return stand;
  }

  /**
   * Update stand
   */
  async update(id: string, updateStandDto: UpdateStandDto, userId: string): Promise<Stand> {
    const stand = await this.findOne(id);
    
    // Check if user has permission (is the organizer of the plan)
    let organizerId: string | undefined = undefined;
    
    if (stand.plan && typeof stand.plan === 'object' && stand.plan.organizer) {
      if (typeof stand.plan.organizer === 'object' && stand.plan.organizer._id) {
        organizerId = stand.plan.organizer._id.toString();
      } else if (typeof stand.plan.organizer === 'string') {
        organizerId = stand.plan.organizer;
      }
    }
    
    if (organizerId !== userId) {
      throw new ForbiddenException('You do not have permission to update this stand');
    }
    
    // If plan ID is being changed, verify new plan exists and user has permission
    if (updateStandDto.plan && stand.plan && typeof stand.plan === 'object' && 
        stand.plan._id && updateStandDto.plan !== stand.plan._id.toString()) {
      const newPlan = await this.planService.findOne(updateStandDto.plan);
      
      // Check if user is the owner of the new plan
      let newPlanOrganizerId: string | undefined = undefined;
      
      if (newPlan.organizer) {
        if (typeof newPlan.organizer === 'object' && newPlan.organizer._id) {
          newPlanOrganizerId = newPlan.organizer._id.toString();
        } else if (typeof newPlan.organizer === 'string') {
          newPlanOrganizerId = newPlan.organizer;
        }
      }
      
      if (newPlanOrganizerId !== userId) {
        throw new ForbiddenException('You do not have permission to move this stand to the specified plan');
      }
      
      // Check if a stand with this number already exists in the new plan
      if (updateStandDto.number) {
        const existingStand = await this.standModel.findOne({
          number: updateStandDto.number,
          plan: new Types.ObjectId(updateStandDto.plan),
          _id: { $ne: id } // Exclude current stand
        });
        
        if (existingStand) {
          throw new BadRequestException(`A stand with number ${updateStandDto.number} already exists in the destination plan`);
        }
      }
    } else if (updateStandDto.number && updateStandDto.number !== stand.number && 
              stand.plan && typeof stand.plan === 'object' && stand.plan._id) {
      // If only the number is changing, check for duplicates in the same plan
      const existingStand = await this.standModel.findOne({
        number: updateStandDto.number,
        plan: stand.plan._id,
        _id: { $ne: id } // Exclude current stand
      });
      
      if (existingStand) {
        throw new BadRequestException(`A stand with number ${updateStandDto.number} already exists in this plan`);
      }
    }
    
    // Update the stand
    const updatedStand = await this.standModel.findByIdAndUpdate(
      id,
      { $set: updateStandDto },
      { new: true }
    )
    .populate({
      path: 'plan',
      select: 'name organizer pdfPath',
      populate: {
        path: 'organizer',
        select: 'username email'
      }
    })
    .exec();
    
    if (!updatedStand) {
      throw new NotFoundException(`Stand with ID ${id} not found`);
    }
    
    return updatedStand;
  }

  /**
   * Update stand status
   */
  async updateStatus(id: string, updateStandStatusDto: UpdateStandStatusDto, userId: string): Promise<Stand> {
    const stand = await this.findOne(id);
    
    // Check if user has permission (is the organizer of the plan)
    let organizerId: string | undefined = undefined;
    
    if (stand.plan && typeof stand.plan === 'object' && stand.plan.organizer) {
      if (typeof stand.plan.organizer === 'object' && stand.plan.organizer._id) {
        organizerId = stand.plan.organizer._id.toString();
      } else if (typeof stand.plan.organizer === 'string') {
        organizerId = stand.plan.organizer;
      }
    }
    
    if (organizerId !== userId) {
      throw new ForbiddenException('You do not have permission to update the status of this stand');
    }
    
    // Update the stand status
    const updatedStand = await this.standModel.findByIdAndUpdate(
      id,
      { 
        $set: { 
          status: updateStandStatusDto.status,
          ...(updateStandStatusDto.reason && { statusReason: updateStandStatusDto.reason })
        } 
      },
      { new: true }
    )
    .populate({
      path: 'plan',
      select: 'name organizer pdfPath',
      populate: {
        path: 'organizer',
        select: 'username email'
      }
    })
    .exec();
    
    if (!updatedStand) {
      throw new NotFoundException(`Stand with ID ${id} not found`);
    }
    
    return updatedStand;
  }
  
  /**
   * Reserve a stand for a registration
   */
  async reserveStand(id: string, registrationId: string): Promise<Stand> {
    this.logger.log(`Reserving stand ${id} for registration ${registrationId}`);
    
    // Get the stand
    const stand = await this.findOne(id);
    
    // Check if stand is available
    if (stand.status !== 'available') {
      throw new BadRequestException(`Stand with ID ${id} is not available`);
    }
    
    // Update the stand status
    const updatedStand = await this.standModel.findByIdAndUpdate(
      id,
      { 
        status: 'reserved',
        reservation: new Types.ObjectId(registrationId)
      },
      { new: true }
    )
    .populate('plan')
    .exec();
    
    if (!updatedStand) {
      throw new NotFoundException(`Stand with ID ${id} not found`);
    }
    
    return updatedStand;
  }

 /**
 * Free a reserved stand
 */
async freeStand(id: string): Promise<Stand> {
  this.logger.log(`Freeing stand ${id}`);
  
  // Get the stand
  const stand = await this.findOne(id);
  
  // If stand is not reserved, just return it
  if (stand.status !== StandStatus.RESERVED) {
    this.logger.log(`Stand ${id} is not reserved, no action needed`);
    return stand;
  }
  
  // Update the stand status to available
  const updatedStand = await this.standModel.findByIdAndUpdate(
    id,
    { 
      status: StandStatus.AVAILABLE,
      $unset: { 
        reservation: 1,
        exhibitorId: 1,
        eventId: 1
      }
    },
    { new: true }
  )
  .populate('plan')
  .exec();
  
  if (!updatedStand) {
    throw new NotFoundException(`Stand with ID ${id} not found`);
  }
  
  this.logger.log(`Stand ${id} has been freed and is now available`);
  return updatedStand;
}

  /**
   * Remove stand
   */
  async remove(id: string, userId: string): Promise<{ message: string }> {
    const stand = await this.findOne(id);
    
    // Check if user has permission (is the organizer of the plan)
    let organizerId: string | undefined = undefined;
    
    if (stand.plan && typeof stand.plan === 'object' && stand.plan.organizer) {
      if (typeof stand.plan.organizer === 'object' && stand.plan.organizer._id) {
        organizerId = stand.plan.organizer._id.toString();
      } else if (typeof stand.plan.organizer === 'string') {
        organizerId = stand.plan.organizer;
      }
    }
    
    if (organizerId !== userId) {
      throw new ForbiddenException('You do not have permission to delete this stand');
    }
    
    // Check if stand is reserved or occupied
    if (stand.status === StandStatus.RESERVED) {
      throw new BadRequestException('Cannot delete a stand that is reserved');
    }
    
    // Delete the stand
    await this.standModel.findByIdAndDelete(id).exec();
    
    return { message: 'Stand deleted successfully' };
  }
}