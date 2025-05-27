// src/registration/registration.service.ts
import { Injectable, NotFoundException, Logger, BadRequestException, ForbiddenException, InternalServerErrorException, Inject, forwardRef } from '@nestjs/common';
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
   * Find official exhibitors for an event
   * These are exhibitors with completed registrations or at least approved ones with selected stands
   */
  async findOfficialExhibitors(eventId: string): Promise<Registration[]> {
    this.logger.log(`Finding official exhibitors for event: ${eventId}`);
    
    try {
      // Find either completed registrations or approved with stands selected
      const registrations = await this.registrationModel.find({
        event: new Types.ObjectId(eventId),
        $or: [
          { status: RegistrationStatus.COMPLETED },
          { 
            status: RegistrationStatus.APPROVED,
            standSelectionCompleted: true,
            stands: { $exists: true, $ne: [] }
          }
        ]
      })
      .populate({
        path: 'exhibitor',
        populate: [
          { 
            path: 'user',
            select: 'username email -_id'
          },
          { 
            path: 'company',
            select: 'companyName companyLogoPath country sector subsector companyDescription website'
          }
        ]
      })
      .populate('stands', 'number area type basePrice status description')
      .sort({ createdAt: -1 })
      .exec();
      
      return registrations;
    } catch (error) {
      this.logger.error(`Error finding official exhibitors for event ${eventId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Create an initial registration for an event
   */
  async create(createRegistrationDto: CreateRegistrationDto, userId: string): Promise<Registration> {
    this.logger.log(`Creating registration for user ${userId} to event ${createRegistrationDto.eventId}`);
    
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
      
      // First, get the exhibitor associated with this user
      const exhibitor = await this.exhibitorService.findByUserId(userId);
      
      if (!exhibitor) {
        throw new BadRequestException('No exhibitor profile found for this user');
      }

      if (!exhibitor._id) {
        throw new InternalServerErrorException('Invalid exhibitor data');
      }
      
      // Ensure exhibitor ID is properly converted to ObjectId
      const exhibitorId = new Types.ObjectId(String(exhibitor._id));
      
      // Check if the exhibitor already has a registration for this event
      const existingRegistration = await this.registrationModel.findOne({
        exhibitor: exhibitorId,
        event: new Types.ObjectId(createRegistrationDto.eventId)
      }).exec();
      
      if (existingRegistration) {
        throw new BadRequestException('You have already registered for this event');
      }
      
      // Create the registration with the EXHIBITOR ID (not user ID)
      const registration = new this.registrationModel({
        exhibitor: exhibitorId,
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
      // Error handling
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
      .populate({
        path: 'exhibitor',
        populate: [
          { 
            path: 'user',
            select: 'username email'
          },
          { 
            path: 'company',
            select: 'companyName registrationNumber companyAddress postalCity country sector subsector companyDescription contactPhone contactPhoneCode companyLogoPath'
          }
        ]
      })
      .populate('event', 'name startDate endDate location type')
      .populate('stands', 'number area type basePrice status')
      .populate('equipment', 'name description price type')
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
      .populate({
        path: 'exhibitor',
        populate: [
          { 
            path: 'user',
            select: 'username email'
          },
          { 
            path: 'company',
            select: 'companyName tradeName companyAddress postalCity country sector subsector registrationNumber companySize website contactPhone contactPhoneCode companyDescription kbisDocumentPath companyLogoPath insuranceCertificatePath'
          }
        ]
      })
      .populate('event', 'name startDate endDate location type')
      .populate('stands', 'number area type basePrice status')
      .populate('equipment', 'name description price type')
      .populate('reviewedBy', 'username email')
      .exec();
    
    if (!registration) {
      throw new NotFoundException(`Registration with ID ${id} not found`);
    }
    
    return registration;
  }
   // Find registrations by exhibitor ID

  async findByExhibitor(exhibitorId: string): Promise<Registration[]> {
    this.logger.log(`Finding registrations for exhibitor: ${exhibitorId}`);
    
    return this.registrationModel.find({ exhibitor: new Types.ObjectId(exhibitorId) })
      .populate('event', 'name startDate endDate location type')
      .populate('stands', 'number area type basePrice status')
      .populate('equipment', 'name description price type')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find registrations by event ID
   */
  async findByEvent(eventId: string): Promise<Registration[]> {
    this.logger.log(`Finding registrations for event: ${eventId}`);
    
    return this.registrationModel.find({ event: new Types.ObjectId(eventId) })
      .populate({
        path: 'exhibitor',
        populate: [
          { 
            path: 'user',
            select: 'username email'
          },
          { 
            path: 'company',
            select: 'companyName registrationNumber companyAddress postalCity country sector subsector companyDescription contactPhone contactPhoneCode companyLogoPath'
          }
        ]
      })
      .populate('event', 'name startDate endDate location type openingHours')
      .populate('stands', 'number area type basePrice status')
      .populate('equipment', 'name description price type')
      .populate('reviewedBy', 'username email')
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
    .populate({
      path: 'exhibitor',
      populate: [
        { 
          path: 'user',
          select: 'username email'
        },
        { 
          path: 'company',
          select: 'companyName companyLogoPath country sector subsector'
        }
      ]
    })
    .populate('event', 'name startDate endDate')
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
  this.logger.log(`Selecting stands for registration ${id} by exhibitor ${exhibitorId}`);
  
  // Find the registration
  const registration = await this.findOne(id);
  
  // Check if registration is approved
  if (registration.status !== RegistrationStatus.APPROVED) {
    throw new BadRequestException('Cannot select stands for a registration that is not approved');
  }
  
  // Verify exhibitor owns this registration
  let regExhibitorId: string;
  
  if (registration.exhibitor) {
    if (typeof registration.exhibitor === 'object' && registration.exhibitor._id) {
      regExhibitorId = String(registration.exhibitor._id);
    } else {
      regExhibitorId = String(registration.exhibitor);
    }
  } else {
    throw new NotFoundException('Registration has no associated exhibitor');
  }
  
  // Convert the provided exhibitor ID to a clean string
  const providedExhibitorId = String(exhibitorId).trim();
  
  // DEBUG: Log the IDs being compared
  this.logger.debug(`Comparing registration exhibitor ID: "${regExhibitorId}" with provided exhibitor ID: "${providedExhibitorId}"`);
  
  if (regExhibitorId !== providedExhibitorId) {
    throw new ForbiddenException('You do not have permission to update this registration');
  }
  
  // Get event to verify stand availability
  const eventId = typeof registration.event === 'object' && registration.event._id
    ? registration.event._id.toString() 
    : String(registration.event);
  
  // Get available stands for this event (including ones this user already selected)
  const allStands = await this.eventService.findStands(eventId);
  
  // Get previously selected stand IDs for this registration
  const previouslySelectedStands = registration.stands ? 
    registration.stands.map(stand => typeof stand === 'object' && stand._id ? 
      String(stand._id) : String(stand)) : [];
  
  // Check if the selected stands are available or already selected by this user
  for (const standId of selectStandsDto.standIds) {
    // Find the stand in all stands
    const stand = allStands.find(s => String(s._id) === standId);
    
    if (!stand) {
      throw new BadRequestException(`Stand with ID ${standId} not found`);
    }
    
    // Only check availability if the stand wasn't previously selected by this user
    if (!previouslySelectedStands.includes(standId) && stand.status !== 'available') {
      throw new BadRequestException(`Stand with ID ${standId} is not available`);
    }
  }
  
  // Convert stand IDs to ObjectIds
  const standObjectIds = selectStandsDto.standIds.map(id => new Types.ObjectId(id));
  
  // Update the registration with selected stands
  const updateData: any = {
    stands: standObjectIds,
  };
  
  // Update stand selection status if provided
  if (selectStandsDto.selectionCompleted !== undefined) {
    updateData.standSelectionCompleted = selectStandsDto.selectionCompleted;
  }
  
  // Update the registration
  const updatedRegistration = await this.registrationModel.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true }
  )
  .populate({
    path: 'exhibitor',
    populate: [
      { 
        path: 'user',
        select: 'username email'
      },
      { 
        path: 'company',
        select: 'companyName companyLogoPath country sector subsector'
      }
    ]
  })
  .populate('event', 'name startDate endDate location type')
  .populate('stands', 'number area type basePrice status')
  .populate('equipment', 'name description price type')
  .populate('reviewedBy', 'username email')
  .exec();
  
  if (!updatedRegistration) {
    throw new NotFoundException(`Registration with ID ${id} not found`);
  }
  
  return updatedRegistration;
}
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
  let regExhibitorId: string;
  
  if (registration.exhibitor) {
    if (typeof registration.exhibitor === 'object' && registration.exhibitor._id) {
      regExhibitorId = String(registration.exhibitor._id);
    } else {
      regExhibitorId = String(registration.exhibitor);
    }
  } else {
    throw new NotFoundException('Registration has no associated exhibitor');
  }
  
  // Convert the provided exhibitor ID to a clean string
  const providedExhibitorId = String(exhibitorId).trim();
  
  if (regExhibitorId !== providedExhibitorId) {
    throw new ForbiddenException('You do not have permission to update this registration');
  }
  
  // Get event ID
  const eventId = typeof registration.event === 'object' && registration.event._id
    ? registration.event._id.toString() 
    : String(registration.event);
  
  // For backward compatibility, keep both formats
  const equipmentIds = selectEquipmentDto.equipmentIds.map(id => new Types.ObjectId(id));
  
  // Create equipmentQuantities array with type annotation
  const equipmentQuantities: { equipment: Types.ObjectId; quantity: number }[] = [];

  // Extract quantities from the DTO metadata if available
  if (selectEquipmentDto.metadata && selectEquipmentDto.metadata.equipmentQuantities) {
    for (const equipmentId of selectEquipmentDto.equipmentIds) {
      const quantity = selectEquipmentDto.metadata.equipmentQuantities[equipmentId] || 1;
      
      // Check if quantity doesn't exceed available quantity
      const availableQuantity = await this.equipmentService.getAvailableQuantity(equipmentId, eventId);
      if (quantity > availableQuantity) {
        throw new BadRequestException(`Only ${availableQuantity} units of equipment ${equipmentId} are available`);
      }
      
      equipmentQuantities.push({
        equipment: new Types.ObjectId(equipmentId),
        quantity: quantity
      });
    }
  } else {
    // Default to quantity 1 for each equipment
    for (const equipmentId of selectEquipmentDto.equipmentIds) {
      equipmentQuantities.push({
        equipment: new Types.ObjectId(equipmentId),
        quantity: 1
      });
    }
  }
  
  // Update the registration
  const updateData: any = {
    equipment: equipmentIds,
    equipmentQuantities: equipmentQuantities
  };
  
  // Store quantities in metadata for compatibility
  if (selectEquipmentDto.metadata && selectEquipmentDto.metadata.equipmentQuantities) {
    updateData.metadata = {
      ...(registration.metadata || {}),
      equipmentQuantities: selectEquipmentDto.metadata.equipmentQuantities
    };
  }
  
  // Update selection status if provided
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
  .populate('event', 'name startDate endDate location type')
  .populate('stands', 'number area type basePrice status')
  .populate('equipment', 'name description price type')
  .populate('equipmentQuantities.equipment', 'name description price type imageUrl')
  .populate('reviewedBy', 'username email')
  .exec();
  
  if (!updatedRegistration) {
    throw new NotFoundException(`Registration with ID ${id} not found`);
  }
  
  return updatedRegistration;
}
  
/**
 * Complete a registration
 */
async complete(id: string, exhibitorId: string): Promise<Registration> {
  this.logger.log(`Completing registration ${id}`);
  
  // Find the registration
  const registration = await this.findOne(id);
  
  // Check if registration is approved
  if (registration.status !== RegistrationStatus.APPROVED) {
    throw new BadRequestException('Cannot complete a registration that is not approved');
  }
  
  // Check if stands have been selected
  if (!registration.stands || registration.stands.length === 0) {
    throw new BadRequestException('Cannot complete registration without selecting stands');
  }
  
  // Verify exhibitor owns this registration
  let regExhibitorId: string;
  
  if (registration.exhibitor) {
    if (typeof registration.exhibitor === 'object' && registration.exhibitor._id) {
      regExhibitorId = String(registration.exhibitor._id);
    } else {
      regExhibitorId = String(registration.exhibitor);
    }
  } else {
    throw new NotFoundException('Registration has no associated exhibitor');
  }
  
  // Convert the provided exhibitor ID to a clean string
  const providedExhibitorId = String(exhibitorId).trim();
  
  if (regExhibitorId !== providedExhibitorId) {
    throw new ForbiddenException('You do not have permission to complete this registration');
  }
  
  // Now actually reserve the stands
  if (registration.stands && registration.stands.length > 0) {
    for (const stand of registration.stands) {
      const standId = typeof stand === 'object' && stand._id 
        ? String(stand._id) 
        : String(stand);
      
      try {
        // This is where we actually mark the stands as reserved
        await this.standService.reserveStand(standId, id);
      } catch (error) {
        // If a stand has been taken by someone else in the meantime
        this.logger.error(`Failed to reserve stand ${standId}: ${error.message}`);
        throw new BadRequestException(`Stand ${standId} is no longer available. Please select another stand.`);
      }
    }
  }
  
  // Update the registration status
  const updatedRegistration = await this.registrationModel.findByIdAndUpdate(
    id,
    { 
      $set: { 
        status: RegistrationStatus.COMPLETED,
        standSelectionCompleted: true,
        equipmentSelectionCompleted: true
      } 
    },
    { new: true }
  )
  .populate({
    path: 'exhibitor',
    populate: [
      { 
        path: 'user',
        select: 'username email'
      },
      { 
        path: 'company',
        select: 'companyName companyLogoPath country sector subsector'
      }
    ]
  })
  .populate('event', 'name startDate endDate location type')
  .populate('stands', 'number area type basePrice status')
  .populate('equipment', 'name description price type')
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
    .populate({
      path: 'exhibitor',
      populate: [
        { 
          path: 'user',
          select: 'username email'
        },
        { 
          path: 'company',
          select: 'companyName companyLogoPath country sector subsector'
        }
      ]
    })
    .populate('event', 'name startDate endDate location type')
    .populate('stands', 'number area type basePrice status')
    .populate('equipment', 'name description price type')
    .populate('reviewedBy', 'username email')
    .exec();
    
    if (!updatedRegistration) {
      throw new NotFoundException(`Registration with ID ${id} not found`);
    }
    
    return updatedRegistration;
  }
// src/registration/registration.service.ts

/**
 * Cancel a registration
 * @param id Registration ID
 * @param userId User ID
 * @param role User role
 * @param reason Cancellation reason (optional)
 */
async cancel(
  id: string, 
  userId: string,
  role: UserRole,
  reason?: string
): Promise<Registration> {
  this.logger.log(`Cancelling registration ${id} by ${role}`);
  
  // Find the registration
  const registration = await this.findOne(id);
  
  if (!registration) {
    throw new NotFoundException(`Registration with ID ${id} not found`);
  }
  
  if (registration.status === RegistrationStatus.CANCELLED) {
    throw new BadRequestException('Registration is already cancelled');
  }

  // Extract event ID 
  const eventId = typeof registration.event === 'object' && registration.event._id
    ? registration.event._id.toString()
    : registration.event.toString();
  
  // Permission checks based on role
  if (role === UserRole.EXHIBITOR) {
    try {
      // Get the exhibitor for this user
      const exhibitor = await this.exhibitorService.findByUserId(userId);
      
      // Check if this exhibitor owns the registration
      let registrationExhibitorId: string = '';
      
      if (registration.exhibitor) {
        if (typeof registration.exhibitor === 'object') {
          registrationExhibitorId = (registration.exhibitor as any)._id.toString();
        } else {
          registrationExhibitorId = String(registration.exhibitor);
        }
      } else {
        throw new NotFoundException('Registration has no associated exhibitor');
      }
      
      const exhibitorId = (exhibitor as any)._id.toString();
      
      if (registrationExhibitorId !== exhibitorId) {
        throw new ForbiddenException('You do not have permission to cancel this registration');
      }
      
      // Check time constraint for exhibitors only
      const event = await this.eventService.findOne(eventId);
      
      const today = new Date();
      const eventStartDate = new Date(event.startDate);
      const diffTime = eventStartDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 10) {
        throw new BadRequestException('Cannot cancel registration within 10 days of event start');
      }
    } catch (error) {
      this.logger.error(`Error verifying exhibitor permissions: ${error.message}`);
      throw error instanceof ForbiddenException ? error : new ForbiddenException('You do not have permission to cancel this registration');
    }
  } else if (role === UserRole.ORGANIZER) {
    try {
      // Use the event service to check if the user is authorized for this event
      const event = await this.eventService.findOne(eventId);
      
      // Simplified check - this should match how your system tracks event ownership
      // Most NestJS apps would store the userId directly in the event
      let isAuthorized = false;
      
      // Access the organizer field with type assertion
      const organizer = (event as any).organizer;
      
      if (organizer) {
        if (typeof organizer === 'object') {
          // Either organizer is the direct user ID, or it has a user property
          if (organizer._id && organizer._id.toString() === userId) {
            isAuthorized = true;
          }
        } else if (organizer.toString() === userId) {
          isAuthorized = true;
        }
      }
      
      // If we can't determine authorization, try a direct check with the event service if available
      if (!isAuthorized && typeof this.eventService.isOwnedByUser === 'function') {
        isAuthorized = await this.eventService.isOwnedByUser(eventId, userId);
      }
      
      if (!isAuthorized) {
        throw new ForbiddenException('You do not have permission to cancel this registration');
      }
    } catch (error) {
      this.logger.error(`Error verifying organizer permissions: ${error.message}`);
      throw error instanceof ForbiddenException ? error : new ForbiddenException('You do not have permission to cancel this registration');
    }
  }
  // For ADMIN role, no additional checks needed
  
  // Free up any reserved stands
  if (registration.stands && registration.stands.length > 0) {
    for (const stand of registration.stands) {
      const standId = typeof stand === 'object' && (stand as any)._id
        ? (stand as any)._id.toString()
        : stand.toString();
          
      try {
        await this.standService.freeStand(standId);
        this.logger.log(`Stand ${standId} freed and marked as available`);
      } catch (error) {
        this.logger.error(`Error freeing stand ${standId}: ${error.message}`);
      }
    }
  }
  
  // Create cancellation metadata
  const metadata = {
    ...(registration.metadata || {}),
    cancellation: {
      cancelledBy: role.toLowerCase(),
      userId: userId,
      reason: reason || `Cancelled by ${role.toLowerCase()}`,
      date: new Date()
    }
  };
  
  // Update the registration
  const updatedRegistration = await this.registrationModel.findByIdAndUpdate(
    id,
    { 
      $set: { 
        status: RegistrationStatus.CANCELLED,
        metadata: metadata,
        cancellationDate: new Date(),
        reviewedBy: new Types.ObjectId(userId)
      },
      $unset: { 
        standSelectionCompleted: "",
        equipmentSelectionCompleted: ""
      }
    },
    { new: true }
  )
  .populate('exhibitor')
  .populate('event')
  .populate('reviewedBy')
  .exec();
  
  if (!updatedRegistration) {
    throw new NotFoundException(`Registration with ID ${id} not found after update`);
  }
  
  // Try to send notification email to the exhibitor
  try {
    if (this.mailService) {
      // Extract exhibitor email with type assertions
      let exhibitorEmail = null;
      if (registration.exhibitor && typeof registration.exhibitor === 'object') {
        const exhibitorObj = registration.exhibitor as any;
        if (exhibitorObj.user && typeof exhibitorObj.user === 'object') {
          exhibitorEmail = exhibitorObj.user.email;
        }
      }
      
      if (exhibitorEmail) {
        const eventName = typeof registration.event === 'object' ? 
                         (registration.event as any).name || 'the event' : 
                         'the event';
                         
        this.mailService.sendRegistrationCancelled(
          exhibitorEmail,
          {
            eventName,
            exhibitorName: String(exhibitorEmail).split('@')[0],
            cancelledBy: role === UserRole.EXHIBITOR ? 'you' : 'the organizer',
            reason: reason || 'No reason provided'
          }
        );
      }
    }
  } catch (error) {
    this.logger.error(`Failed to send cancellation notification: ${error.message}`);
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
        const standId = typeof stand === 'object' && stand._id
          ? String(stand._id)
          : String(stand);
          
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