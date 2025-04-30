// src/user/user-profile.controller.ts
import { 
    Controller, 
    Get, 
    Patch, 
    Post, 
    Body, 
    UseGuards, 
    Req, 
    UseInterceptors,
    UploadedFile,
    UnprocessableEntityException,
    BadRequestException,
    Logger,
    HttpCode,
    HttpStatus
  } from '@nestjs/common';
  import { FileInterceptor } from '@nestjs/platform-express';
  import { diskStorage } from 'multer';
  import { extname } from 'path';
  import * as fs from 'fs';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { UserService } from './user.service';
  import { UserProfileDto } from './dto/user-profile.dto';
  import { ChangePasswordDto } from './dto/change-password.dto';
  import { UserRole } from './entities/user.entity';
  import { ExhibitorService } from '../exhibitor/exhibitor.service';
  import { OrganizerService } from '../organizer/organizer.service';
  import { CompanyService } from '../company/company.service';
  
  @Controller('api/profile') // Changed from 'users/profile' to 'api/profile'
  @UseGuards(JwtAuthGuard) // All routes in this controller require authentication
  export class UserProfileController {
    private readonly logger = new Logger(UserProfileController.name);
  
    constructor(
      private readonly userService: UserService,
      private readonly exhibitorService: ExhibitorService,
      private readonly organizerService: OrganizerService,
      private readonly companyService: CompanyService
    ) {}
  
    @Get()
    async getProfile(@Req() req) {
      const userId = req.user.id;
      this.logger.log(`Getting profile for user: ${userId}`);
      
      // Get basic user information
      const user = await this.userService.findOne(userId);
      
      if (!user) {
        throw new BadRequestException('User not found');
      }
      
      // Get role-specific data
      let roleData = {};
      
      if (user.role === UserRole.EXHIBITOR) {
        try {
          const exhibitor = await this.exhibitorService.findByUserId(userId);
          roleData = {
            ...exhibitor,
            company: exhibitor.company
          };
        } catch (error) {
          this.logger.warn(`Exhibitor data not found for user: ${userId}`);
        }
      } else if (user.role === UserRole.ORGANIZER) {
        try {
          const organizer = await this.organizerService.findByUserId(userId);
          roleData = {
            ...organizer
          };
        } catch (error) {
          this.logger.warn(`Organizer data not found for user: ${userId}`);
        }
      }
      
      return {
        ...user,
        ...roleData
      };
    }
  
    @Patch()
    async updateProfile(@Req() req, @Body() profileData: UserProfileDto) {
      const userId = req.user.id;
      this.logger.log(`Updating profile for user: ${userId}`);
      
      // Update basic user info
      if (profileData.username || profileData.email) {
        const updateData = {};
        if (profileData.username) updateData['username'] = profileData.username;
        if (profileData.email) updateData['email'] = profileData.email.toLowerCase();
        
        await this.userService.update(userId, updateData);
      }
      
      // Update role-specific info
      const user = await this.userService.findOne(userId);
      
      if (user.role === UserRole.EXHIBITOR) {
        try {
          const exhibitor = await this.exhibitorService.findByUserId(userId);
          
          // Update exhibitor fields
          if (profileData.representativeFunction || profileData.personalPhone || profileData.personalPhoneCode) {
            const exhibitorFields = {
              representativeFunction: profileData.representativeFunction,
              personalPhone: profileData.personalPhone,
              personalPhoneCode: profileData.personalPhoneCode
            };
            
            // Filter out undefined values
            Object.keys(exhibitorFields).forEach(key => 
              exhibitorFields[key] === undefined && delete exhibitorFields[key]
            );
            
            if (Object.keys(exhibitorFields).length > 0) {
              await this.exhibitorService.update(exhibitor._id.toString(), exhibitorFields);
            }
          }
          
          // Update company if company data is provided
          if (profileData.company && exhibitor.company) {
            const companyId = exhibitor.company._id.toString();
            
            // Filter out undefined values
            Object.keys(profileData.company).forEach(key => 
              profileData.company[key] === undefined && delete profileData.company[key]
            );
            
            if (Object.keys(profileData.company).length > 0) {
              await this.companyService.update(companyId, profileData.company);
            }
          }
        } catch (error) {
          this.logger.error(`Failed to update exhibitor data: ${error.message}`);
        }
      } else if (user.role === UserRole.ORGANIZER) {
        try {
          const organizer = await this.organizerService.findByUserId(userId);
          
          // Update organizer fields
          if (profileData.organization) {
            const organizerId = organizer._id.toString();
            
            // Filter out undefined values
            Object.keys(profileData.organization).forEach(key => 
              profileData.organization[key] === undefined && delete profileData.organization[key]
            );
            
            if (Object.keys(profileData.organization).length > 0) {
              await this.organizerService.update(organizerId, profileData.organization);
            }
          }
        } catch (error) {
          this.logger.error(`Failed to update organizer data: ${error.message}`);
        }
      }
      
      // Return the updated profile
      return this.getProfile(req);
    }
  
    @Post('change-password')
    @HttpCode(HttpStatus.OK)
    async changePassword(@Req() req, @Body() changePasswordDto: ChangePasswordDto) {
      const userId = req.user.id;
      this.logger.log(`Changing password for user: ${userId}`);
      
      const { oldPassword, newPassword } = changePasswordDto;
      
      // Implement password change logic directly here for simplicity
      const user = await this.userService.findUserWithPassword(userId);
      
      if (!user) {
        throw new BadRequestException('User not found');
      }
      
      // Password verification logic would be here
      // ...
      
      // Update password
      await this.userService.updatePassword(userId, newPassword);
      
      return { message: 'Password changed successfully' };
    }
  
    @Post('image')
    @UseInterceptors(
      FileInterceptor('image', {
        storage: diskStorage({
          destination: (req, file, cb) => {
            // Determine the upload directory based on user role
            const user = req.user;
            let uploadDir = './uploads/profile-images';
            
            if (user.role === UserRole.EXHIBITOR) {
              uploadDir = './uploads/exhibitor-documents';
            } else if (user.role === UserRole.ORGANIZER) {
              uploadDir = './uploads/organization-logos';
            }
            
            // Ensure the directory exists
            if (!fs.existsSync(uploadDir)) {
              fs.mkdirSync(uploadDir, { recursive: true });
            }
            
            cb(null, uploadDir);
          },
          filename: (req, file, cb) => {
            // Generate a unique filename with the original extension
            const randomName = Array(32)
              .fill(null)
              .map(() => Math.round(Math.random() * 16).toString(16))
              .join('');
            const fileExt = extname(file.originalname);
            cb(null, `${randomName}${fileExt}`);
          },
        }),
        fileFilter: (req, file, cb) => {
          // Check file type
          if (!file.mimetype.match(/\/(jpg|jpeg|png|gif)$/)) {
            return cb(new UnprocessableEntityException('Only image files are allowed'), false);
          }
          cb(null, true);
        },
        limits: {
          fileSize: 2 * 1024 * 1024, // 2MB
        },
      }),
    )
    async uploadProfileImage(@Req() req, @UploadedFile() file) {
      if (!file) {
        throw new BadRequestException('No file uploaded');
      }
  
      const userId = req.user.id;
      this.logger.log(`Uploading profile image for user: ${userId}`);
      
      // Implement image upload logic based on role
      // ...
      
      return { 
        message: 'Image uploaded successfully', 
        filename: file.filename 
      };
    }
  }