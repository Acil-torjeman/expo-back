// src/organizer/organizer.service.ts
import { Injectable, NotFoundException, Logger, BadRequestException, ConflictException, InternalServerErrorException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Organizer } from './entities/organizer.entity';
import { CreateOrganizerDto } from './dto/create-organizer.dto';
import { UpdateOrganizerDto } from './dto/update-organizer.dto';
import { UserRole } from '../user/entities/user.entity';
import { AuthService } from '../auth/auth.service';
import { UserService } from '../user/user.service';
import { File as MulterFile } from 'multer';

// Interface pour remplacer le DTO manquant
interface OrganizerSignupDto {
  email: string;
  username: string;
  password: string;
  organizationName: string;
  organizationAddress: string;
  postalCity: string;
  country: string;
  contactPhone: string;
  contactPhoneCode: string;
  website?: string;
  organizationDescription?: string;
  consent: boolean;
  dataConsent: boolean;
}

@Injectable()
export class OrganizerService {
  getByUserId(id: any) {
    throw new Error('Method not implemented.');
  }
  private readonly logger = new Logger(OrganizerService.name);

  constructor(
    @InjectModel(Organizer.name) private organizerModel: Model<Organizer>,
    private userService: UserService,
    // Utiliser forwardRef pour l'injection d'AuthService
    @Inject(forwardRef(() => AuthService)) private authService: AuthService
  ) {}

  /**
   * Process organizer signup with uploaded logo
   */
  async signup(
    organizerSignupDto: OrganizerSignupDto,
    files: {
      organizationLogo?: MulterFile[],
    }
  ): Promise<any> {
    try {
      // Normaliser l'email
      const normalizedEmail = organizerSignupDto.email.trim().toLowerCase();
      
      this.logger.log(`Processing organizer signup for email: ${normalizedEmail}`);
      
      // Validation du logo
      if (!files.organizationLogo?.[0]) {
        throw new BadRequestException('Organization logo is required');
      }
  
      // Validation du numéro de téléphone
      const phoneRegex = /^[0-9]+$/;
      if (!phoneRegex.test(organizerSignupDto.contactPhone)) {
        throw new BadRequestException('Invalid phone number. Only digits are allowed');
      }
  
      // Créer l'utilisateur via UserService
      const savedUser = await this.userService.create({
        email: normalizedEmail,
        username: organizerSignupDto.username,
        password: organizerSignupDto.password,
        role: UserRole.ORGANIZER
      });
  
      // Créer l'organisateur
      const organizer = new this.organizerModel({
        user: savedUser._id,
        organizationName: organizerSignupDto.organizationName,
        organizationAddress: organizerSignupDto.organizationAddress,
        postalCity: organizerSignupDto.postalCity,
        country: organizerSignupDto.country,
        contactPhone: organizerSignupDto.contactPhone,
        contactPhoneCode: organizerSignupDto.contactPhoneCode,
        website: organizerSignupDto.website,
        organizationDescription: organizerSignupDto.organizationDescription,
        organizationLogoPath: files.organizationLogo?.[0]?.filename,
        consent: organizerSignupDto.consent,
        dataConsent: organizerSignupDto.dataConsent,
      });
  
      const savedOrganizer = await organizer.save();
      this.logger.log(`Organizer created: ${savedOrganizer._id}`);
  
      // Envoyer l'email de vérification
      // Utiliser String() pour convertir l'ID en chaîne sans appeler toString()
      const user = await this.userService.getUserWithToken(String(savedUser._id));
      const emailSent = await this.authService.sendVerificationEmail(
        user.email,
        user.verificationToken || ''
      );
      
      if (emailSent) {
        this.logger.log(`Verification email sent to: ${normalizedEmail}`);
      } else {
        this.logger.warn(`Failed to send verification email to: ${normalizedEmail}`);
      }
  
      return {
        message: emailSent 
          ? 'Registration successful. Please check your email to verify your account.' 
          : 'Registration successful but we could not send you a verification email. Please contact support.',
        userId: savedUser._id,
        emailSent: emailSent,
      };
    } catch (error) {
      this.logger.error(`Error during organizer signup: ${error.message}`, error.stack);
      
      if (error instanceof BadRequestException || 
          error instanceof ConflictException ||
          error instanceof NotFoundException) {
        throw error;
      }
      
      throw new InternalServerErrorException(
        'An unexpected error occurred during registration. Please try again.'
      );
    }
  }

  /**
   * Create a new organizer
   */
  async create(createOrganizerDto: CreateOrganizerDto): Promise<Organizer> {
    this.logger.log(`Creating organizer for user: ${createOrganizerDto.user}`);
    
    // Verify user exists
    const userExists = await this.userService.findOne(createOrganizerDto.user);
    if (!userExists) {
      this.logger.warn(`User not found: ${createOrganizerDto.user}`);
      throw new NotFoundException(`User with ID ${createOrganizerDto.user} not found`);
    }

    const organizer = new this.organizerModel(createOrganizerDto);
    return organizer.save();
  }

  /**
   * Find all organizers
   */
  async findAll(): Promise<Organizer[]> {
    this.logger.log('Finding all organizers');
    return this.organizerModel.find()
      .populate('user', '-password -verificationToken -passwordResetToken -passwordResetExpires')
      .exec();
  }

  /**
   * Find organizer by ID
   */
  async findOne(id: number): Promise<Organizer> {
    this.logger.log(`Finding organizer with ID: ${id}`);
    const organizer = await this.organizerModel.findById(id)
      .populate('user', '-password -verificationToken -passwordResetToken -passwordResetExpires')
      .exec();
    
    if (!organizer) {
      this.logger.warn(`Organizer with ID ${id} not found`);
      throw new NotFoundException(`Organizer with ID ${id} not found`);
    }
    
    return organizer;
  }

  /**
   * Find organizer by user ID
   */
  async findByUserId(userId: string): Promise<Organizer> {
    this.logger.log(`Finding organizer for user ID: ${userId}`);
    const organizer = await this.organizerModel.findOne({ user: userId })
      .populate('user', '-password -verificationToken -passwordResetToken -passwordResetExpires')
      .exec();
    
    if (!organizer) {
      this.logger.warn(`Organizer for user ID ${userId} not found`);
      throw new NotFoundException(`Organizer for user ID ${userId} not found`);
    }
    
    return organizer;
  }

  async update(id: string, updateOrganizerDto: UpdateOrganizerDto): Promise<Organizer> {
    this.logger.log(`Updating organizer with ID: ${id}`);
    
    const existingOrganizer = await this.organizerModel.findByIdAndUpdate(
      id,
      { $set: updateOrganizerDto },
      { new: true },
    )
      .populate('user', '-password -verificationToken -passwordResetToken -passwordResetExpires')
      .exec();
    
    if (!existingOrganizer) {
      this.logger.warn(`Organizer with ID ${id} not found for update`);
      throw new NotFoundException(`Organizer with ID ${id} not found`);
    }
    
    return existingOrganizer;
  }

  /**
   * Delete organizer
   */
  async remove(id: number): Promise<Organizer> {
    this.logger.log(`Removing organizer with ID: ${id}`);
    const deletedOrganizer = await this.organizerModel.findByIdAndDelete(id).exec();
    
    if (!deletedOrganizer) {
      this.logger.warn(`Organizer with ID ${id} not found for deletion`);
      throw new NotFoundException(`Organizer with ID ${id} not found`);
    }
    
    return deletedOrganizer;
  }
}