// src/registration/registration.service.ts
import { 
  Injectable, 
  NotFoundException, 
  BadRequestException, 
  Logger, 
  ForbiddenException,
  Inject,
  forwardRef
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Registration, RegistrationStatus } from './entities/registration.entity';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { UpdateRegistrationDto } from './dto/update-registration.dto';
import { ReviewRegistrationDto } from './dto/review-registration.dto';
import { SelectStandsDto } from './dto/select-stands.dto';
import { SelectEquipmentDto } from './dto/select-equipment.dto';
import { EventService } from '../event/event.service';
import { ExhibitorService } from '../exhibitor/exhibitor.service';
import { StandService } from '../stand/stand.service';
import { EquipmentService } from '../equipment/equipment.service';
import { UserRole } from '../user/entities/user.entity';
import { MailService } from '../mail/mail.service';

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    @InjectModel(Registration.name) private registrationModel: Model<Registration>,
    @Inject(forwardRef(() => EventService)) private eventService: EventService,
    @Inject(forwardRef(() => ExhibitorService)) private exhibitorService: ExhibitorService,
    @Inject(forwardRef(() => StandService)) private standService: StandService,
    @Inject(forwardRef(() => EquipmentService)) private equipmentService: EquipmentService,
    private mailService: MailService
  ) {}

  /**
   * Create an initial registration for an event
   */
  async create(createRegistrationDto: CreateRegistrationDto, exhibitorId: string): Promise<Registration> {
    this.logger.log(`Creating registration for exhibitor ${exhibitorId} to event ${createRegistrationDto.eventId}`);
    
    try {
      // Validate event
      const event = await this.eventService.findOne(createRegistrationDto.eventId);
      
      // Check if the event allows registrations
      if (event.status !== 'published') {
        throw new BadRequestException('Cannot register to an unpublished event');
      }
      
      if (new Date(event.registrationDeadline) < new Date()) {
        throw new BadRequestException('Registration deadline has passed for this event');
      }
      
      // Check if the exhibitor already has a registration for this event
      const existingRegistration = await this.registrationModel.findOne({
        exhibitor: new Types.ObjectId(exhibitorId),
        event: new Types.ObjectId(createRegistrationDto.eventId)
      }).exec();
      
      if (existingRegistration) {
        throw new BadRequestException('You have already registered for this event');
      }
      
      // Create the registration
      const registration = new this.registrationModel({
        exhibitor: new Types.ObjectId(exhibitorId),
        event: new Types.ObjectId(createRegistrationDto.eventId),
        participationNote: createRegistrationDto.participationNote || '',
        status: RegistrationStatus.PENDING,
        stands: [],
        equipment: [],
        standSelectionCompleted: false,
        equipmentSelectionCompleted: false
      });
      
      // Save the registration
      const savedRegistration = await registration.save() as Registration & { _id: Types.ObjectId };
      
      return this.findOne(savedRegistration._id.toString());
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to create registration: ${error.message}`);
      throw new BadRequestException(`Failed to create registration: ${error.message}`);
    }
  }

  /**
   * Get all registrations
   */
  async findAll(filters: any = {}): Promise<Registration[]> {
    this.logger.log('Finding all registrations with filters:', filters);
    
    const query: any = {};
    
    if (filters.exhibitorId) {
      query.exhibitor = new Types.ObjectId(filters.exhibitorId);
    }
    
    if (filters.eventId) {
      query.event = new Types.ObjectId(filters.eventId);
    }
    
    if (filters.status) {
      query.status = filters.status;
    }
    
    return this.registrationModel.find(query)
      .populate('exhibitor', '-__v')
      .populate('event', '-__v')
      .populate('stands', '-__v')
      .populate('equipment', '-__v')
      .populate('reviewedBy', 'username email')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Get a registration by ID
   */
  async findOne(id: string): Promise<Registration> {
    this.logger.log(`Finding registration with ID: ${id}`);
    
    const registration = await this.registrationModel.findById(id)
      .populate('exhibitor', '-__v')
      .populate('event', '-__v')
      .populate('stands', '-__v')
      .populate('equipment', '-__v')
      .populate('reviewedBy', 'username email')
      .exec();
    
    if (!registration) {
      throw new NotFoundException(`Registration with ID ${id} not found`);
    }
    
    return registration;
  }

  /**
   * Find registrations by exhibitor ID
   */
  async findByExhibitor(exhibitorId: string): Promise<Registration[]> {
    this.logger.log(`Finding registrations for exhibitor: ${exhibitorId}`);
    
    return this.registrationModel.find({ exhibitor: new Types.ObjectId(exhibitorId) })
      .populate('event', '-__v')
      .populate('stands', '-__v')
      .populate('equipment', '-__v')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find registrations by event ID
   */
  async findByEvent(eventId: string): Promise<Registration[]> {
    this.logger.log(`Finding registrations for event: ${eventId}`);
    
    return this.registrationModel.find({ event: new Types.ObjectId(eventId) })
      .populate('exhibitor', '-__v')
      .populate('stands', '-__v')
      .populate('equipment', '-__v')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Review a registration (approve or reject)
   */
  async reviewRegistration(
    id: string,
    reviewDto: ReviewRegistrationDto,
    userId: string,
    userRole: UserRole
  ): Promise<Registration> {
    this.logger.log(`Reviewing registration ${id} with status ${reviewDto.status}`);
    
    // Only organizers can review registrations
    if (userRole !== UserRole.ORGANIZER && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only organizers can review registrations');
    }
    
    // Find the registration
    const registration = await this.findOne(id);
    
    // Check if registration is pending
    if (registration.status !== RegistrationStatus.PENDING) {
      throw new BadRequestException(`Registration has already been ${registration.status}`);
    }
    
    // Get event to verify organizer is the owner
    const eventId = registration.event._id ? registration.event._id.toString() : registration.event.toString();
    const event = await this.eventService.findOne(eventId);
    
    // Check if organizer is the event owner if not admin
    if (userRole === UserRole.ORGANIZER) {
      const isOwner = await this.eventService.isOwner(eventId, userId);
      if (!isOwner) {
        throw new ForbiddenException('You do not have permission to review this registration');
      }
    }
    
    // Prepare update data
    const updateData: any = {
      status: reviewDto.status,
      reviewedBy: new Types.ObjectId(userId)
    };
    
    // Add reason and dates based on status
    if (reviewDto.status === RegistrationStatus.APPROVED) {
      updateData.approvalDate = new Date();
    } else if (reviewDto.status === RegistrationStatus.REJECTED) {
      if (!reviewDto.reason) {
        throw new BadRequestException('Reason is required when rejecting a registration');
      }
      updateData.rejectionReason = reviewDto.reason;
      updateData.rejectionDate = new Date();
    }
    
    // Update the registration
    const updatedRegistration = await this.registrationModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    )
    .populate('exhibitor', '-__v')
    .populate('event', '-__v')
    .populate('reviewedBy', 'username email')
    .exec();
    
    if (!updatedRegistration) {
      throw new NotFoundException(`Registration with ID ${id} not found`);
    }
    
    // Send notification email based on status
    try {
      // Get exhibitor email
      const exhibitorUser = updatedRegistration.exhibitor.user;
      const exhibitorEmail = typeof exhibitorUser === 'object' && exhibitorUser.email
        ? exhibitorUser.email
        : await this.getExhibitorEmail(updatedRegistration.exhibitor);
      
      const eventName = typeof event === 'object' && event.name
        ? event.name
        : 'the event';
      
      if (exhibitorEmail) {
        if (reviewDto.status === RegistrationStatus.APPROVED) {
          await this.mailService.sendRegistrationApproved(
            exhibitorEmail,
            {
              eventName,
              exhibitorName: exhibitorEmail.split('@')[0], // Simplified
              message: reviewDto.reason || 'Your registration has been approved.',
              nextSteps: 'You can now login to your account and select stands and equipment for the event.'
            }
          );
        } else if (reviewDto.status === RegistrationStatus.REJECTED) {
          await this.mailService.sendRegistrationRejected(
            exhibitorEmail,
            {
              eventName,
              exhibitorName: exhibitorEmail.split('@')[0], // Simplified
              reason: reviewDto.reason || 'No reason provided.',
            }
          );
        }
      }
    } catch (error) {
      this.logger.error(`Failed to send notification email: ${error.message}`);
      // Don't throw, just log the error
    }
    
    return updatedRegistration;
  }

  /**
   * Select stands for a registration
   */
  async selectStands(
    id: string,
    selectStandsDto: SelectStandsDto,
    exhibitorId: string
  ): Promise<Registration> {
    this.logger.log(`Selecting stands for registration ${id}`);
    
    // Find the registration
    const registration = await this.findOne(id);
    
    // Check if registration is approved
    if (registration.status !== RegistrationStatus.APPROVED) {
      throw new BadRequestException('Cannot select stands for a registration that is not approved');
    }
    
    // Verify exhibitor owns this registration
    const regExhibitorId = registration.exhibitor._id 
      ? registration.exhibitor._id.toString() 
      : registration.exhibitor.toString();
    
    if (regExhibitorId !== exhibitorId) {
      throw new ForbiddenException('You do not have permission to update this registration');
    }
    
    // Get event to verify stand availability
    const eventId = registration.event._id 
      ? registration.event._id.toString() 
      : registration.event.toString();
    
    // Check if the stands are available for this event
    const availableStands = await this.eventService.findAvailableStands(eventId);
    const availableStandIds = availableStands.map(s => (s as { _id: Types.ObjectId })._id.toString());
    
    // Check if all stands are available
    for (const standId of selectStandsDto.standIds) {
      if (!availableStandIds.includes(standId)) {
        throw new BadRequestException(`Stand with ID ${standId} is not available`);
      }
    }
    
    // Convert stand IDs to ObjectIds
    const standObjectIds = selectStandsDto.standIds.map(id => new Types.ObjectId(id));
    
    // Update stands for each stand, mark as reserved
    for (const standId of selectStandsDto.standIds) {
      await this.standService.reserveStand(standId, id);
    }
    
    // Update the registration with selected stands
    const updateData: any = {
      stands: standObjectIds,
    };
    
    // Update stand selection status if provided
    if (selectStandsDto.selectionCompleted !== undefined) {
      updateData.standSelectionCompleted = selectStandsDto.selectionCompleted;
      
      // If both stand and equipment selection are completed, mark registration as completed
      if (selectStandsDto.selectionCompleted && registration.equipmentSelectionCompleted) {
        updateData.status = RegistrationStatus.COMPLETED;
      }
    }
    
    // Update the registration
    const updatedRegistration = await this.registrationModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    )
    .populate('exhibitor', '-__v')
    .populate('event', '-__v')
    .populate('stands', '-__v')
    .populate('equipment', '-__v')
    .populate('reviewedBy', 'username email')
    .exec();
    
    if (!updatedRegistration) {
      throw new NotFoundException(`Registration with ID ${id} not found`);
    }
    
    return updatedRegistration;
  }

  /**
   * Select equipment for a registration
   */
  async selectEquipment(
    id: string,
    selectEquipmentDto: SelectEquipmentDto,
    exhibitorId: string
  ): Promise<Registration> {
    this.logger.log(`Selecting equipment for registration ${id}`);
    
    // Find the registration
    const registration = await this.findOne(id);
    
    // Check if registration is approved
    if (registration.status !== RegistrationStatus.APPROVED && 
        registration.status !== RegistrationStatus.COMPLETED) {
      throw new BadRequestException('Cannot select equipment for a registration that is not approved');
    }
    
    // Verify exhibitor owns this registration
    const regExhibitorId = registration.exhibitor._id 
      ? registration.exhibitor._id.toString() 
      : registration.exhibitor.toString();
    
    if (regExhibitorId !== exhibitorId) {
      throw new ForbiddenException('You do not have permission to update this registration');
    }
    
    // Get event to verify equipment availability
    const eventId = registration.event._id 
      ? registration.event._id.toString() 
      : registration.event.toString();
    
    // Check if the equipment is available for this event
    const availableEquipment = await this.equipmentService.getAvailableForEvent(eventId);
    const availableEquipmentIds = availableEquipment.map(e => (e as { _id: Types.ObjectId })._id.toString());
    
    // If equipment IDs are provided, validate them
    if (selectEquipmentDto.equipmentIds.length > 0) {
      // Check if all equipment is available
      for (const equipmentId of selectEquipmentDto.equipmentIds) {
        if (!availableEquipmentIds.includes(equipmentId)) {
          throw new BadRequestException(`Equipment with ID ${equipmentId} is not available`);
        }
      }
    }
    
    // Convert equipment IDs to ObjectIds
    const equipmentObjectIds = selectEquipmentDto.equipmentIds.map(id => new Types.ObjectId(id));
    
    // Update the registration with selected equipment
    const updateData: any = {
      equipment: equipmentObjectIds,
    };
    
    // Update equipment selection status if provided
    if (selectEquipmentDto.selectionCompleted !== undefined) {
      updateData.equipmentSelectionCompleted = selectEquipmentDto.selectionCompleted;
      
      // If both stand and equipment selection are completed, mark registration as completed
      if (selectEquipmentDto.selectionCompleted && registration.standSelectionCompleted) {
        updateData.status = RegistrationStatus.COMPLETED;
      }
    }
    
    // Update the registration
    const updatedRegistration = await this.registrationModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    )
    .populate('exhibitor', '-__v')
    .populate('event', '-__v')
    .populate('stands', '-__v')
    .populate('equipment', '-__v')
    .populate('reviewedBy', 'username email')
    .exec();
    
    if (!updatedRegistration) {
      throw new NotFoundException(`Registration with ID ${id} not found`);
    }
    
    return updatedRegistration;
  }

  /**
   * Update a registration
   */
  async update(id: string, updateRegistrationDto: UpdateRegistrationDto, userId: string): Promise<Registration> {
    this.logger.log(`Updating registration ${id}`);
    
    // Find registration to check status and ownership
    const registration = await this.findOne(id);
    
    // Prepare update data
    const updateData: any = {};
    
    // Only copy allowed fields based on registration status
    if (updateRegistrationDto.participationNote !== undefined && registration.status === RegistrationStatus.PENDING) {
      updateData.participationNote = updateRegistrationDto.participationNote;
    }
    
    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No valid fields to update');
    }
    
    // Update the registration
    const updatedRegistration = await this.registrationModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    )
    .populate('exhibitor', '-__v')
    .populate('event', '-__v')
    .populate('stands', '-__v')
    .populate('equipment', '-__v')
    .populate('reviewedBy', 'username email')
    .exec();
    
    if (!updatedRegistration) {
      throw new NotFoundException(`Registration with ID ${id} not found`);
    }
    
    return updatedRegistration;
  }

  /**
   * Cancel a registration
   */
  async cancel(id: string, exhibitorId: string): Promise<Registration> {
    this.logger.log(`Cancelling registration ${id}`);
    
    // Find the registration
    const registration = await this.findOne(id);
    
    // Check if registration can be cancelled (pending or approved)
    if (registration.status !== RegistrationStatus.PENDING && 
        registration.status !== RegistrationStatus.APPROVED) {
      throw new BadRequestException('Cannot cancel a registration that is not pending or approved');
    }
    
    // Verify exhibitor owns this registration
    const regExhibitorId = registration.exhibitor._id 
      ? registration.exhibitor._id.toString() 
      : registration.exhibitor.toString();
    
    if (regExhibitorId !== exhibitorId) {
      throw new ForbiddenException('You do not have permission to cancel this registration');
    }
    
    // Free up any reserved stands
    if (registration.stands && registration.stands.length > 0) {
      for (const stand of registration.stands) {
        const standId = stand._id ? stand._id.toString() : stand.toString();
        await this.standService.freeStand(standId);
      }
    }
    
    // Update the registration
    const updatedRegistration = await this.registrationModel.findByIdAndUpdate(
      id,
      { 
        $set: { 
          status: RegistrationStatus.CANCELLED,
          stands: [],
          equipment: []
        } 
      },
      { new: true }
    )
    .populate('exhibitor', '-__v')
    .populate('event', '-__v')
    .populate('reviewedBy', 'username email')
    .exec();
    
    if (!updatedRegistration) {
      throw new NotFoundException(`Registration with ID ${id} not found`);
    }
    
    return updatedRegistration;
  }

  /**
   * Remove a registration - admin only
   */
  async remove(id: string): Promise<void> {
    this.logger.log(`Removing registration ${id}`);
    
    // Find the registration first
    const registration = await this.findOne(id);
    
    // Free up any reserved stands
    if (registration.stands && registration.stands.length > 0) {
      for (const stand of registration.stands) {
        const standId = stand._id ? stand._id.toString() : stand.toString();
        await this.standService.freeStand(standId);
      }
    }
    
    // Delete the registration
    const result = await this.registrationModel.findByIdAndDelete(id).exec();
    
    if (!result) {
      throw new NotFoundException(`Registration with ID ${id} not found`);
    }
  }

  /**
   * Helper method to get exhibitor email
   */
  private async getExhibitorEmail(exhibitor: any): Promise<string> {
    try {
      if (typeof exhibitor === 'object' && exhibitor.user) {
        if (typeof exhibitor.user === 'object' && exhibitor.user.email) {
          return exhibitor.user.email;
        }
        
        // If user is an ID, fetch the exhibitor
        const exhibitorId = exhibitor._id ? exhibitor._id.toString() : exhibitor.toString();
        const exhibitorDetails = await this.exhibitorService.findOne(exhibitorId);
        
        if (exhibitorDetails && exhibitorDetails.user && typeof exhibitorDetails.user === 'object') {
          return exhibitorDetails.user.email;
        }
      }
      
      return '';
    } catch (error) {
      this.logger.error(`Failed to get exhibitor email: ${error.message}`);
      return '';
    }
  }
}