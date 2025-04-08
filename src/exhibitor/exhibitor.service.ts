// src/exhibitor/exhibitor.service.ts
import { Injectable, NotFoundException, Logger, BadRequestException, ConflictException, InternalServerErrorException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Exhibitor } from './entities/exhibitor.entity';
import { CreateExhibitorDto } from './dto/create-exhibitor.dto';
import { UpdateExhibitorDto } from './dto/update-exhibitor.dto';
import { UserRole } from '../user/entities/user.entity';
import { AuthService } from '../auth/auth.service';
import { CompanyService } from '../company/company.service';
import { UserService } from '../user/user.service';
import { File as MulterFile } from 'multer';

// Interface pour remplacer le DTO manquant
interface ExhibitorSignupDto {
  email: string;
  username: string;
  password: string;
  companyName: string;
  tradeName?: string;
  companyAddress: string;
  postalCity: string;
  country: string;
  sector: string;
  subsector: string;
  registrationNumber: string;
  companySize?: string;
  website?: string;
  contactPhone: string;
  contactPhoneCode: string;
  companyDescription?: string;
  representativeFunction: string;
  personalPhone: string;
  personalPhoneCode: string;
  consent: boolean;
  dataConsent: boolean;
}

@Injectable()
export class ExhibitorService {
  private readonly logger = new Logger(ExhibitorService.name);

  constructor(
    @InjectModel(Exhibitor.name) private exhibitorModel: Model<Exhibitor>,
    private userService: UserService,
    private companyService: CompanyService,
    // Utiliser forwardRef pour l'injection d'AuthService
    @Inject(forwardRef(() => AuthService)) private authService: AuthService
  ) {}

  /**
   * Process exhibitor signup with uploaded documents
   */
  async signup(
    exhibitorSignupDto: ExhibitorSignupDto,
    files: {
      kbisDocument?: MulterFile[],
      companyLogo?: MulterFile[],
      insuranceCertificate?: MulterFile[],
    }
  ): Promise<any> {
    try {
      this.logger.log(`Processing signup for email: ${exhibitorSignupDto.email}`);
      
      // Validation des fichiers requis
      if (!files.kbisDocument?.[0]) {
        throw new BadRequestException('KBIS document is required');
      }
      if (!files.companyLogo?.[0]) {
        throw new BadRequestException('Company logo is required');
      }
      if (!files.insuranceCertificate?.[0]) {
        throw new BadRequestException('Insurance certificate is required');
      }

      // Validation du numéro de téléphone
      const phoneRegex = /^[0-9]+$/;
      if (!phoneRegex.test(exhibitorSignupDto.personalPhone)) {
        throw new BadRequestException('Invalid phone number. Only digits are allowed');
      }

      // Créer l'utilisateur via UserService
      const savedUser = await this.userService.create({
        email: exhibitorSignupDto.email,
        username: exhibitorSignupDto.username,
        password: exhibitorSignupDto.password,
        role: UserRole.EXHIBITOR
      });

      // Créer la société
      const companyData = {
        companyName: exhibitorSignupDto.companyName,
        tradeName: exhibitorSignupDto.tradeName,
        companyAddress: exhibitorSignupDto.companyAddress,
        postalCity: exhibitorSignupDto.postalCity,
        country: exhibitorSignupDto.country,
        sector: exhibitorSignupDto.sector,
        subsector: exhibitorSignupDto.subsector,
        registrationNumber: exhibitorSignupDto.registrationNumber,
        companySize: exhibitorSignupDto.companySize,
        website: exhibitorSignupDto.website,
        contactPhone: exhibitorSignupDto.contactPhone,
        contactPhoneCode: exhibitorSignupDto.contactPhoneCode,
        companyDescription: exhibitorSignupDto.companyDescription,
        kbisDocumentPath: files.kbisDocument?.[0]?.filename,
        companyLogoPath: files.companyLogo?.[0]?.filename,
        insuranceCertificatePath: files.insuranceCertificate?.[0]?.filename,
      };

      const savedCompany = await this.companyService.create(companyData);
      this.logger.log(`Company created: ${savedCompany._id}`);

      // Créer l'exposant
      const exhibitor = new this.exhibitorModel({
        user: savedUser._id,
        company: savedCompany._id,
        representativeFunction: exhibitorSignupDto.representativeFunction,
        personalPhone: exhibitorSignupDto.personalPhone,
        personalPhoneCode: exhibitorSignupDto.personalPhoneCode,
        consent: exhibitorSignupDto.consent,
        dataConsent: exhibitorSignupDto.dataConsent,
      });

      const savedExhibitor = await exhibitor.save();
      this.logger.log(`Exhibitor created: ${savedExhibitor._id}`);

      // Envoyer l'email de vérification
      // Utiliser String() pour convertir l'ID en chaîne sans appeler toString()
      const user = await this.userService.getUserWithToken(String(savedUser._id));
      const emailSent = await this.authService.sendVerificationEmail(
        user.email,
        user.verificationToken || ''
      );
      
      if (emailSent) {
        this.logger.log(`Verification email sent to: ${user.email}`);
      } else {
        this.logger.warn(`Failed to send verification email to: ${user.email}`);
      }

      return {
        message: emailSent 
          ? 'Registration successful. Please check your email to verify your account.' 
          : 'Registration successful but we could not send you a verification email. Please contact support.',
        userId: savedUser._id,
        emailSent: emailSent,
      };
    } catch (error) {
      this.logger.error(`Error during exhibitor signup: ${error.message}`, error.stack);
      
      // Check if error is already a NestJS exception
      if (error instanceof BadRequestException || 
          error instanceof ConflictException ||
          error instanceof NotFoundException) {
        throw error;
      }
      
      // Convert other errors to server error
      throw new InternalServerErrorException(
        'An unexpected error occurred during registration. Please try again.'
      );
    }
  }

  /**
   * Create a new exhibitor
   */
  async create(createExhibitorDto: CreateExhibitorDto): Promise<Exhibitor> {
    this.logger.log(`Creating new exhibitor for user: ${createExhibitorDto.user} and company: ${createExhibitorDto.company}`);
    const exhibitor = new this.exhibitorModel(createExhibitorDto);
    return exhibitor.save();
  }

  /**
   * Find all exhibitors
   */
  async findAll(): Promise<Exhibitor[]> {
    this.logger.log('Finding all exhibitors');
    return this.exhibitorModel.find()
      .populate('user')
      .populate('company')
      .exec();
  }

  /**
   * Find exhibitor by ID
   */
  async findOne(id: string): Promise<Exhibitor> {
    this.logger.log(`Finding exhibitor with ID: ${id}`);
    const exhibitor = await this.exhibitorModel.findById(id)
      .populate('user')
      .populate('company')
      .exec();
    
    if (!exhibitor) {
      this.logger.warn(`Exhibitor with ID ${id} not found`);
      throw new NotFoundException(`Exhibitor with ID ${id} not found`);
    }
    
    return exhibitor;
  }

  /**
   * Find exhibitor by user ID
   */
  async findByUserId(userId: string): Promise<Exhibitor> {
    this.logger.log(`Finding exhibitor for user ID: ${userId}`);
    const exhibitor = await this.exhibitorModel.findOne({ user: userId })
      .populate('user')
      .populate('company')
      .exec();
    
    if (!exhibitor) {
      this.logger.warn(`Exhibitor for user ID ${userId} not found`);
      throw new NotFoundException(`Exhibitor for user ID ${userId} not found`);
    }
    
    return exhibitor;
  }

  /**
   * Update exhibitor
   */
  async update(id: string, updateExhibitorDto: UpdateExhibitorDto): Promise<Exhibitor> {
    this.logger.log(`Updating exhibitor with ID: ${id}`);
    const existingExhibitor = await this.exhibitorModel.findByIdAndUpdate(
      id,
      { $set: updateExhibitorDto },
      { new: true },
    )
      .populate('user')
      .populate('company')
      .exec();
    
    if (!existingExhibitor) {
      this.logger.warn(`Exhibitor with ID ${id} not found for update`);
      throw new NotFoundException(`Exhibitor with ID ${id} not found`);
    }
    
    return existingExhibitor;
  }

  /**
   * Delete exhibitor
   */
  async remove(id: string): Promise<Exhibitor> {
    this.logger.log(`Removing exhibitor with ID: ${id}`);
    const deletedExhibitor = await this.exhibitorModel.findByIdAndDelete(id).exec();
    
    if (!deletedExhibitor) {
      this.logger.warn(`Exhibitor with ID ${id} not found for deletion`);
      throw new NotFoundException(`Exhibitor with ID ${id} not found`);
    }
    
    return deletedExhibitor;
  }
}