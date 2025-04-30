// src/user/user-profile.service.ts
import { 
    Injectable, 
    NotFoundException, 
    UnauthorizedException, 
    BadRequestException, 
    Logger,
    Inject,
    forwardRef
  } from '@nestjs/common';
  import { InjectModel } from '@nestjs/mongoose';
  import { Model, Types } from 'mongoose';
  import * as fs from 'fs';
  import * as path from 'path';
  import * as argon2 from 'argon2';
    import { Multer } from 'multer';
  import { User, UserRole } from './entities/user.entity';
  import { UserProfileDto } from './dto/user-profile.dto';
  import { ChangePasswordDto } from './dto/change-password.dto';
  import { CompanyService } from '../company/company.service';
  import { ExhibitorService } from '../exhibitor/exhibitor.service';
  import { OrganizerService } from '../organizer/organizer.service';
  
  @Injectable()
  export class UserProfileService {
    private readonly logger = new Logger(UserProfileService.name);
  
    constructor(
      @InjectModel(User.name) private userModel: Model<User>,
      @Inject(forwardRef(() => ExhibitorService)) private exhibitorService: ExhibitorService,
      @Inject(forwardRef(() => OrganizerService)) private organizerService: OrganizerService,
      @Inject(forwardRef(() => CompanyService)) private companyService: CompanyService
    ) {}
  
    /**
     * Get user profile with role-specific information
     */
    async getProfile(userId: string) {
      this.logger.log(`Fetching profile for user: ${userId}`);
      
      const user = await this.userModel.findById(userId)
        .select('-password -verificationToken -passwordResetToken -passwordResetExpires -deleted')
        .exec();
      
      if (!user) {
        throw new NotFoundException('User not found');
      }
      
      // Get role-specific data
      let roleData = {};
      
      if (user.role === UserRole.EXHIBITOR) {
        try {
          const exhibitor = await this.exhibitorService.findByUserId(userId);
          roleData = {
            ...exhibitor.toObject(),
            company: exhibitor.company
          };
        } catch (error) {
          this.logger.warn(`Exhibitor data not found for user: ${userId}`);
        }
      } else if (user.role === UserRole.ORGANIZER) {
        try {
          const organizer = await this.organizerService.findByUserId(userId);
          roleData = {
            ...organizer.toObject()
          };
        } catch (error) {
          this.logger.warn(`Organizer data not found for user: ${userId}`);
        }
      }
      
      return {
        ...user.toObject(),
        ...roleData
      };
    }
  
    /**
     * Update user profile information
     */
    async updateProfile(userId: string, profileData: UserProfileDto) {
      this.logger.log(`Updating profile for user: ${userId}`);
      
      const user = await this.userModel.findById(userId).exec();
      
      if (!user) {
        throw new NotFoundException('User not found');
      }
      
      // Update basic user information
      if (profileData.username) user.username = profileData.username;
      if (profileData.email) user.email = profileData.email.toLowerCase();
      
      await user.save();
      
      // Update role-specific information
      if (user.role === UserRole.EXHIBITOR) {
        try {
          const exhibitor = await this.exhibitorService.findByUserId(userId);
          
          // Extract exhibitor fields from profileData
          const exhibitorFields = {
            representativeFunction: profileData.representativeFunction,
            personalPhone: profileData.personalPhone,
            personalPhoneCode: profileData.personalPhoneCode
          };
          
          // Convert _id to string safely
          const exhibitorId = (exhibitor as any)._id.toString();
          await this.exhibitorService.update(exhibitorId, exhibitorFields);
          
          // Update company if company data is provided
          if (profileData.company && exhibitor.company) {
            // Type assertion and safe access to company ID
            const companyId = ((exhibitor.company as any)._id || '').toString();
            if (companyId) {
              await this.companyService.update(companyId, profileData.company);
            }
          }
        } catch (error) {
          this.logger.error(`Failed to update exhibitor data: ${error.message}`);
        }
      } else if (user.role === UserRole.ORGANIZER) {
        try {
          const organizer = await this.organizerService.findByUserId(userId);
          
          // Extract organization fields from profileData
          if (profileData.organization) {
            // Convert _id to string safely
            const organizerId = (organizer as any)._id.toString();
            await this.organizerService.update(organizerId, profileData.organization);
          }
        } catch (error) {
          this.logger.error(`Failed to update organizer data: ${error.message}`);
        }
      }
      
      // Return updated profile
      return this.getProfile(userId);
    }
  
    /**
     * Change user password
     */
    async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
      this.logger.log(`Changing password for user: ${userId}`);
      
      const { oldPassword, newPassword } = changePasswordDto;
      
      const user = await this.userModel.findById(userId).select('+password').exec();
      
      if (!user) {
        throw new NotFoundException('User not found');
      }
      
      // Verify old password
      try {
        const isPasswordValid = await argon2.verify(user.password, oldPassword);
        
        if (!isPasswordValid) {
          throw new UnauthorizedException('Current password is incorrect');
        }
      } catch (error) {
        throw new UnauthorizedException('Current password is incorrect');
      }
      
      // Hash new password
      try {
        user.password = await argon2.hash(newPassword, {
          type: argon2.argon2id,
          memoryCost: 65536,
          timeCost: 3,
          parallelism: 4
        });
        
        await user.save();
        
        return { message: 'Password changed successfully' };
      } catch (error) {
        this.logger.error(`Error updating password: ${error.message}`);
        throw new BadRequestException('Failed to update password');
      }
    }
  
    /**
     * Update profile image
     */
    async updateProfileImage(userId: string, file: Multer.File) {
      this.logger.log(`Updating profile image for user: ${userId}`);
      
      const user = await this.userModel.findById(userId).exec();
      
      if (!user) {
        throw new NotFoundException('User not found');
      }
      
      // Get the filename
      const filename = file.filename;
      
      // Handle the image update based on user role
      if (user.role === UserRole.EXHIBITOR) {
        try {
          const exhibitor = await this.exhibitorService.findByUserId(userId);
          
          if (!exhibitor || !exhibitor.company) {
            throw new NotFoundException('Exhibitor or company not found');
          }
          
          // Delete old logo if exists
          const company = exhibitor.company;
          if ((company as any).companyLogoPath) {
            this.deleteFile((company as any).companyLogoPath, 'exhibitor-documents');
          }
          
          // Update company logo path - safely get the ID
          const companyId = (company as any)._id.toString();
          await this.companyService.update(companyId, { 
            companyLogoPath: filename 
          });
          
          return { message: 'Company logo updated successfully', filename };
        } catch (error) {
          this.logger.error(`Failed to update exhibitor logo: ${error.message}`);
          throw new BadRequestException('Failed to update company logo');
        }
      } else if (user.role === UserRole.ORGANIZER) {
        try {
          const organizer = await this.organizerService.findByUserId(userId);
          
          // Delete old logo if exists
          if ((organizer as any).organizationLogoPath) {
            this.deleteFile((organizer as any).organizationLogoPath, 'organization-logos');
          }
          
          // Update organization logo path
          const organizerId = (organizer as any)._id.toString();
          await this.organizerService.update(organizerId, { 
            organizationLogoPath: filename 
          });
          
          return { message: 'Organization logo updated successfully', filename };
        } catch (error) {
          this.logger.error(`Failed to update organizer logo: ${error.message}`);
          throw new BadRequestException('Failed to update organization logo');
        }
      } else {
        // Admin or basic user profile image
        try {
          // Delete old avatar if exists
          if ((user as any).avatar) {
            this.deleteFile((user as any).avatar, 'profile-images');
          }
          
          // Update user avatar
          (user as any).avatar = filename;
          await user.save();
          
          return { message: 'Profile image updated successfully', filename };
        } catch (error) {
          this.logger.error(`Failed to update user avatar: ${error.message}`);
          throw new BadRequestException('Failed to update profile image');
        }
      }
    }
    
    /**
     * Delete a file from the filesystem
     */
    private deleteFile(filename: string, directory: string) {
      try {
        const filePath = path.join(process.cwd(), 'uploads', directory, filename);
        
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          this.logger.log(`Deleted file: ${filePath}`);
        }
      } catch (error) {
        this.logger.error(`Failed to delete file: ${error.message}`);
      }
    }
  }