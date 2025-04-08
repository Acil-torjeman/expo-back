// src/equipment/equipment.service.ts
import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Multer } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { Equipment } from './entities/equipment.entity';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';
import { AssociateEquipmentDto } from './dto/associate-equipment.dto';
import { UserRole } from '../user/entities/user.entity';
import { EventService } from '../event/event.service';

@Injectable()
export class EquipmentService {
  private readonly logger = new Logger(EquipmentService.name);
  private readonly uploadPath: string;

  constructor(
    @InjectModel(Equipment.name) private readonly equipmentModel: Model<Equipment>,
    @Inject(forwardRef(() => EventService)) private readonly eventService: EventService,
  ) {
    // Set upload path for equipment images
    this.uploadPath = path.join(process.cwd(), '/uploads/equipment-images');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
    }
  }

 
/**
 * Check if a user is the owner of an equipment item
 * @param equipmentId Equipment ID
 * @param userId User ID
 * @returns Boolean indicating if the user is the owner
 */
private async isOwner(equipmentId: string, userId: string): Promise<boolean> {
  try {
    // First convert both to string to ensure consistent comparison
    const equipId = equipmentId.toString();
    const uId = userId.toString();
    
    // Direct database query to verify ownership
    const equipment = await this.equipmentModel.findById(equipId).exec();
    if (!equipment) return false;
    
    // Convert organizer ID to string for proper comparison
    const organizerId = equipment.organizer.toString();
    
    this.logger.log(`Equipment ownership check: user=${uId}, organizer=${organizerId}`);
    
    return organizerId === uId;
  } catch (error) {
    this.logger.error(`Error checking ownership: ${error.message}`);
    return false;
  }
}

  /**
   * Create a new equipment
   */
  async create(createEquipmentDto: CreateEquipmentDto, organizerId: string): Promise<Equipment> {
    this.logger.log(`Creating new equipment: ${createEquipmentDto.name} for organizer ${organizerId}`);
    
    try {
      // Explicitly set the organizer ID as an ObjectId
      const equipmentData = {
        ...createEquipmentDto,
        organizer: new Types.ObjectId(organizerId),
        isAvailable: createEquipmentDto.isAvailable !== undefined ? createEquipmentDto.isAvailable : true
      };
      
      // Create and save the equipment
      const equipment = new this.equipmentModel(equipmentData);
      const savedEquipment = await equipment.save() as Equipment;
      
      this.logger.log(`Equipment created successfully with ID: ${savedEquipment._id}`);
      
      // Return the saved equipment
      return savedEquipment;
    } catch (error) {
      this.logger.error(`Error creating equipment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find all equipment with optional filters
   */
  async findAll(
    category?: string,
    isAvailable?: boolean,
    search?: string
  ): Promise<Equipment[]> {
    const query: any = {};
    
    if (category) {
      query.category = category;
    }
    
    if (isAvailable !== undefined) {
      query.isAvailable = isAvailable;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    
    this.logger.log(`Finding equipment with filters: ${JSON.stringify(query)}`);
    
    return this.equipmentModel.find(query)
      .populate('organizer', 'username email')
      .populate('events', 'name startDate endDate')
      .exec();
  }

  /**
   * Find equipment by organizer
   */
  async findByOrganizer(organizerId: string): Promise<Equipment[]> {
    this.logger.log(`Finding equipment for organizer: ${organizerId}`);
    
    try {
      // Explicitly convert organizerId to ObjectId and log for debugging
      const objId = new Types.ObjectId(organizerId);
      this.logger.log(`Converted organizer ID to: ${objId.toString()}`);
      
      const equipment = await this.equipmentModel.find({ organizer: objId })
        .populate('events', 'name startDate endDate')
        .exec();
        
      this.logger.log(`Found ${equipment.length} equipment items for organizer ${organizerId}`);
      return equipment;
    } catch (error) {
      this.logger.error(`Error finding equipment for organizer ${organizerId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Find equipment by event
   */
  async findByEvent(eventId: string): Promise<Equipment[]> {
    this.logger.log(`Finding equipment for event: ${eventId}`);
    
    return this.equipmentModel.find({ events: new Types.ObjectId(eventId) })
      .populate('organizer', 'username email')
      .exec();
  }

  /**
   * Find equipment by ID
   */
  async findOne(id: string): Promise<Equipment> {
    this.logger.log(`Finding equipment with ID: ${id}`);
    
    const equipment = await this.equipmentModel.findById(id)
      .populate({
        path: 'organizer',
        select: 'username email _id' // Explicitly select _id
      })
      .populate('events', 'name startDate endDate')
      .exec();
    
    if (!equipment) {
      this.logger.warn(`Equipment with ID ${id} not found`);
      throw new NotFoundException(`Equipment with ID ${id} not found`);
    }
    
    // Log organizer details for debugging
    if (equipment.organizer) {
      const organizerId = equipment.organizer._id ? equipment.organizer._id.toString() : 
                         (typeof equipment.organizer === 'string' ? equipment.organizer : 'unknown');
      this.logger.log(`Equipment belongs to organizer: ${organizerId}`);
    }
    
    return equipment;
  }

  /**
   * Update equipment
   */
  async update(id: string, updateEquipmentDto: UpdateEquipmentDto, userId: string): Promise<Equipment> {
    this.logger.log(`Updating equipment ${id} by user ${userId}`);
    
    // Check if user has permission using the new method
    if (!(await this.isOwner(id, userId))) {
      this.logger.warn(`User ${userId} does not have permission to update equipment ${id}`);
      throw new ForbiddenException('You do not have permission to update this equipment');
    }
    
    // Update the equipment
    const updatedEquipment = await this.equipmentModel.findByIdAndUpdate(
      id,
      { $set: updateEquipmentDto },
      { new: true }
    )
    .populate('organizer', 'username email')
    .populate('events', 'name startDate endDate')
    .exec();
    
    if (!updatedEquipment) {
      throw new NotFoundException(`Equipment with ID ${id} not found`);
    }
    
    this.logger.log(`Equipment ${id} updated successfully`);
    return updatedEquipment;
  }

  /**
   * Remove equipment
   */
  async remove(id: string, userId: string): Promise<Equipment> {
    this.logger.log(`Removing equipment ${id} by user ${userId}`);
    
    // Check if user has permission using the new method
    if (!(await this.isOwner(id, userId))) {
      this.logger.warn(`User ${userId} does not have permission to delete equipment ${id}`);
      throw new ForbiddenException('You do not have permission to delete this equipment');
    }
    
    // Get equipment info before deletion to check for image
    const equipment = await this.findOne(id);
    
    // Delete equipment image if exists
    if (equipment.imageUrl) {
      const imagePath = path.join(this.uploadPath, path.basename(equipment.imageUrl));
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        this.logger.log(`Deleted image file: ${imagePath}`);
      }
    }
    
    const deletedEquipment = await this.equipmentModel.findByIdAndDelete(id).exec();
    
    if (!deletedEquipment) {
      throw new NotFoundException(`Equipment with ID ${id} not found`);
    }
    
    this.logger.log(`Equipment ${id} deleted successfully`);
    return deletedEquipment;
  }

  /**
   * Upload image for equipment
   */
  async uploadImage(id: string, file: Multer.File, userId: string): Promise<Equipment> {
    this.logger.log(`Uploading image for equipment ${id}, requested by user ${userId}`);
    
    // Check if user has permission using the new method
    if (!(await this.isOwner(id, userId))) {
      this.logger.warn(`User ${userId} does not have permission to upload image for equipment ${id}`);
      throw new ForbiddenException('You do not have permission to upload image for this equipment');
    }
    
    // Get equipment info to check for existing image
    const equipment = await this.findOne(id);
    
    // Delete old image if exists
    if (equipment.imageUrl) {
      const oldImagePath = path.join(this.uploadPath, path.basename(equipment.imageUrl));
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
        this.logger.log(`Deleted old image file: ${oldImagePath}`);
      }
    }
    
    // Store the full URL path for the image
    const imageUrl = `/uploads/equipment-images/${file.filename}`;
    
    // Update equipment with image URL
    const updatedEquipment = await this.equipmentModel.findByIdAndUpdate(
      id,
      { imageUrl: imageUrl },
      { new: true }
    )
    .populate('organizer', 'username email')
    .populate('events', 'name startDate endDate')
    .exec();
    
    if (!updatedEquipment) {
      throw new NotFoundException(`Equipment with ID ${id} not found`);
    }
    
    this.logger.log(`Image uploaded successfully for equipment ${id}`);
    return updatedEquipment;
  }

  /**
   * Associate equipment with an event
   */
  async associateWithEvent(
    equipmentId: string,
    associateDto: AssociateEquipmentDto,
    userId: string,
    userRole: UserRole
  ): Promise<Equipment> {
    const { eventId, specialPrice, availableQuantity } = associateDto;
    
    this.logger.log(`Associating equipment ${equipmentId} with event ${eventId}`);
    
    // Check if user has permission using the new method
    if (!(await this.isOwner(equipmentId, userId))) {
      this.logger.warn(`User ${userId} does not have permission to associate equipment ${equipmentId}`);
      throw new ForbiddenException('You do not have permission to associate this equipment');
    }
    
    // Verify event exists
    const event = await this.eventService.findOne(eventId);
    
    // Convert both IDs to strings for comparison
    const eventOrganizerId = typeof event.organizer === 'object' && event.organizer._id 
      ? event.organizer._id.toString() 
      : event.organizer.toString();
      
    // Make sure the event belongs to the same organizer
    if (eventOrganizerId !== userId) {
      this.logger.warn(`Event ${eventId} does not belong to the same organizer as equipment ${equipmentId}`);
      throw new BadRequestException('You can only associate equipment with your own events');
    }
    
    // Get equipment to check if it's already associated with the event
    const equipment = await this.findOne(equipmentId);
    
    // Check if equipment is already associated with the event
    if (equipment.events && equipment.events.some(e => {
      const eventObjectId = typeof e === 'object' && e._id ? e._id.toString() : e.toString();
      return eventObjectId === eventId;
    })) {
      this.logger.warn(`Equipment ${equipmentId} is already associated with event ${eventId}`);
      throw new BadRequestException('Equipment is already associated with this event');
    }
    
    // Update the equipment
    const updatedEquipment = await this.equipmentModel.findByIdAndUpdate(
      equipmentId,
      { 
        $push: { events: new Types.ObjectId(eventId) },
        $set: {
          ...(specialPrice !== undefined && { specialPrice }),
          ...(availableQuantity !== undefined && { availableQuantity }),
        }
      },
      { new: true }
    )
    .populate('organizer', 'username email')
    .populate('events', 'name startDate endDate')
    .exec();
    
    if (!updatedEquipment) {
      throw new NotFoundException(`Equipment with ID ${equipmentId} not found`);
    }
    
    this.logger.log(`Equipment ${equipmentId} associated with event ${eventId} successfully`);
    return updatedEquipment;
    
  }

  /**
   * Dissociate equipment from an event
   */
  async dissociateFromEvent(
    equipmentId: string,
    eventId: string,
    userId: string,
    userRole: UserRole
  ): Promise<Equipment> {
    this.logger.log(`Dissociating equipment ${equipmentId} from event ${eventId}`);
    
    // Check if user has permission using the new method
    if (!(await this.isOwner(equipmentId, userId))) {
      this.logger.warn(`User ${userId} does not have permission to dissociate equipment ${equipmentId}`);
      throw new ForbiddenException('You do not have permission to dissociate this equipment');
    }
    
    // Get equipment to check if it's associated with the event
    const equipment = await this.findOne(equipmentId);
    
    // Check if equipment is associated with the event
    const isAssociated = equipment.events && equipment.events.some(e => {
      const eventObjectId = typeof e === 'object' && e._id ? e._id.toString() : e.toString();
      return eventObjectId === eventId;
    });
    
    if (!isAssociated) {
      this.logger.warn(`Equipment ${equipmentId} is not associated with event ${eventId}`);
      throw new BadRequestException('Equipment is not associated with this event');
    }
    
    // Update the equipment
    const updatedEquipment = await this.equipmentModel.findByIdAndUpdate(
      equipmentId,
      { $pull: { events: new Types.ObjectId(eventId) } },
      { new: true }
    )
    .populate('organizer', 'username email')
    .populate('events', 'name startDate endDate')
    .exec();
    
    if (!updatedEquipment) {
      throw new NotFoundException(`Equipment with ID ${equipmentId} not found`);
    }
    
    this.logger.log(`Equipment ${equipmentId} dissociated from event ${eventId} successfully`);
    return updatedEquipment;
  }

  /**
   * Get available equipment for an event
   */
  async getAvailableForEvent(eventId: string): Promise<Equipment[]> {
    this.logger.log(`Getting available equipment for event: ${eventId}`);
    
    // Verify event exists
    const event = await this.eventService.findOne(eventId);
    
    // Find equipment associated with this event
    return this.equipmentModel.find({
      events: new Types.ObjectId(eventId),
      isAvailable: true,
    })
    .populate('organizer', 'username email')
    .exec();
  }
}