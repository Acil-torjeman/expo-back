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
  HttpStatus,
  InternalServerErrorException,
  NotFoundException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserService } from './user.service';
import { UserProfileDto } from './dto/user-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UserRole } from './entities/user.entity';
import { ExhibitorService } from '../exhibitor/exhibitor.service';
import { OrganizerService } from '../organizer/organizer.service';
import { CompanyService } from '../company/company.service';
import { Exhibitor } from '../exhibitor/entities/exhibitor.entity';
import { Organizer } from '../organizer/entities/organizer.entity';
import { Company } from '../company/entities/company.entity';
import * as argon2 from 'argon2';
import { User } from '../user/entities/user.entity';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';


@Controller('api/profile')
@UseGuards(JwtAuthGuard)
export class UserProfileController {
  private readonly logger = new Logger(UserProfileController.name);

  constructor(
    private readonly userService: UserService,
    private readonly exhibitorService: ExhibitorService,
    private readonly organizerService: OrganizerService,
    private readonly companyService: CompanyService,
    @InjectModel(Company.name) private companyModel: Model<Company>, // Inject Company model directly
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
        const exhibitor = await this.exhibitorService.findByUserId(userId) as Exhibitor & {
          company: Company;
          user: any;
        };
        
        roleData = {
          ...exhibitor.toObject(),
          company: exhibitor.company
        };
      } catch (error) {
        this.logger.warn(`Exhibitor data not found for user: ${userId}`);
      }
    } else if (user.role === UserRole.ORGANIZER) {
      try {
        const organizer = await this.organizerService.findByUserId(userId) as Organizer & {
          user: any;
        };
        
        roleData = {
          ...organizer.toObject()
        };
      } catch (error) {
        this.logger.warn(`Organizer data not found for user: ${userId}`);
      }
    }
    
    // Ensure user properties are explicitly included
    const userInfo = {
      id: (user as any)._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role,
      avatar: user.avatar || null
    };
    
    return {
      ...userInfo,
      ...roleData
    };
  }

  @Patch()
  async updateProfile(@Req() req, @Body() profileData: UserProfileDto) {
    const userId = req.user.id;
    this.logger.log(`Updating profile for user: ${userId}`);
    
    // Update basic user info
    if (profileData.username || profileData.email) {
      const updateData: Partial<User> = {};
      if (profileData.username) updateData.username = profileData.username;
      if (profileData.email) updateData.email = profileData.email.toLowerCase();
      
      await this.userService.update(userId, updateData);
    }
    
    // Update role-specific info
    const user = await this.userService.findOne(userId);
    
    if (user.role === UserRole.EXHIBITOR) {
      try {
        const exhibitor = await this.exhibitorService.findByUserId(userId) as Exhibitor & {
          _id: string;
          company: Company & { _id: string };
        };
        
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
            await this.exhibitorService.update(exhibitor._id, exhibitorFields);
          }
        }
        
        // Update company if company data is provided
        if (profileData.company && exhibitor.company) {
          const companyId = exhibitor.company._id.toString();
          
          // Filter out undefined values
          const companyFields = { ...profileData.company };
          Object.keys(companyFields).forEach(key => 
            companyFields[key] === undefined && delete companyFields[key]
          );
          
          if (Object.keys(companyFields).length > 0) {
            await this.companyService.update(companyId, companyFields);
          }
        }
      } catch (error) {
        this.logger.error(`Failed to update exhibitor data: ${error.message}`);
      }
    } else if (user.role === UserRole.ORGANIZER) {
      try {
        const organizer = await this.organizerService.findByUserId(userId) as Organizer & {
          _id: string;
        };
        
        // Update organizer fields
        if (profileData.organization) {
          const organizerId = organizer._id.toString();
          
          // Filter out undefined values
          const organizerFields = { ...profileData.organization };
          Object.keys(organizerFields).forEach(key => 
            organizerFields[key] === undefined && delete organizerFields[key]
          );
          
          if (Object.keys(organizerFields).length > 0) {
            await this.organizerService.update(organizerId, organizerFields);
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
    
    // Verify current password
    const user = await this.userService.findUserWithPassword(userId);
    
    if (!user) {
      throw new BadRequestException('User not found');
    }
    
    // Verify old password with argon2
    const isPasswordValid = await argon2.verify(user.password, oldPassword);
    if (!isPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }
    
    // Update password
    await this.userService.updatePassword(userId, newPassword);
    
    return { message: 'Password changed successfully' };
  }

  // src/user/user-profile.controller.ts - Cleaned up uploadProfileImage method

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
        // Generate a unique filename
        const randomName = Array(32)
          .fill(null)
          .map(() => Math.round(Math.random() * 16).toString(16))
          .join('');
        const fileExt = extname(file.originalname);
        cb(null, `${randomName}${fileExt}`);
      },
    }),
    fileFilter: (req, file, cb) => {
      // Only allow image files
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
  this.logger.log(`Uploading profile image for user: ${userId}, filename: ${file.filename}`);
  
  const user = await this.userService.findOne(userId);
  
  if (!user) {
    throw new BadRequestException('User not found');
  }
  
  // Handle based on user role
  if (user.role === UserRole.EXHIBITOR) {
    try {
      const exhibitor = await this.exhibitorService.findByUserId(userId) as Exhibitor & {
        company: Company & { _id: Types.ObjectId };
      };
      
      if (!exhibitor || !exhibitor.company) {
        throw new BadRequestException('Exhibitor company not found');
      }
      
      // Get company ID safely
      const companyId = exhibitor.company._id.toString();
      
      // Delete old logo file if it exists
      if (exhibitor.company.companyLogoPath) {
        this.deleteFile(exhibitor.company.companyLogoPath, 'exhibitor-documents');
      }
      
      // Update company logo using the CompanyService
      await this.companyService.updateLogo(companyId, file.filename);
      
      return {
        message: 'Company logo updated successfully',
        filename: file.filename
      };
    } catch (error) {
      this.logger.error(`Error updating company logo: ${error.message}`);
      throw new BadRequestException(`Failed to update company logo: ${error.message}`);
    }
  } else if (user.role === UserRole.ORGANIZER) {
    try {
      const organizer = await this.organizerService.findByUserId(userId) as Organizer & {
        _id: Types.ObjectId;
      };
      
      // Delete old logo file if it exists
      if (organizer.organizationLogoPath) {
        this.deleteFile(organizer.organizationLogoPath, 'organization-logos');
      }
      
      // Update organizer logo path
      const organizerId = organizer._id.toString();
      await this.organizerService.update(organizerId, {
        organizationLogoPath: file.filename
      });
      
      return {
        message: 'Organization logo updated successfully',
        filename: file.filename
      };
    } catch (error) {
      this.logger.error(`Error updating organization logo: ${error.message}`);
      throw new BadRequestException(`Failed to update organization logo: ${error.message}`);
    }
  } else {
    // For admin users or others, update the avatar field
    try {
      // Delete old avatar file if it exists
      if (user.avatar) {
        this.deleteFile(user.avatar, 'profile-images');
      }
      
      await this.userService.update(userId, { avatar: file.filename });
      
      return {
        message: 'Profile image updated successfully',
        filename: file.filename
      };
    } catch (error) {
      this.logger.error(`Error updating user avatar: ${error.message}`);
      throw new BadRequestException('Failed to update profile image');
    }
  }
}
  /**
   * Helper method to delete a file from the filesystem
   */
  private deleteFile(filename: string, directory: string) {
    try {
      const filePath = join(process.cwd(), 'uploads', directory, filename);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`Deleted old file: ${filePath}`);
      }
    } catch (error) {
      this.logger.error(`Failed to delete file: ${error.message}`);
    }
  }
}