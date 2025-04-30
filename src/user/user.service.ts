// src/user/user.service.ts
import { Injectable, NotFoundException, Logger, ConflictException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { User, UserStatus, UserRole } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as crypto from 'crypto';
import { AuthService } from '../auth/auth.service';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @Inject(forwardRef(() => AuthService)) private authService: AuthService,
    private mailerService: MailerService,
    private configService: ConfigService
  ) {}
  
  /**
   * Create a new user
   */
  async create(createUserDto: CreateUserDto): Promise<User> {
    this.logger.log(`Creating user with email: ${createUserDto.email}`);
    
    // Normalize email to lowercase
    const normalizedEmail = createUserDto.email.trim().toLowerCase();
    
    // Check if user already exists
    const existingUser = await this.userModel.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      this.logger.warn(`Email already in use: ${normalizedEmail}`);
      throw new ConflictException('Email is already in use');
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Create new user with normalized email
    const newUser = new this.userModel({
      ...createUserDto,
      email: normalizedEmail,
      status: UserStatus.PENDING,
      emailVerified: false,
      verificationToken,
    });

    const savedUser = await newUser.save();
    this.logger.log(`User created: ${savedUser._id}`);
    
    return savedUser;
  }

  /**
   * Find all users with advanced filtering
   */
  async findAll(
    search?: string, 
    status?: UserStatus,
    role?: UserRole,
    startDate?: string,
    endDate?: string,
    includeDeleted: boolean = false
  ): Promise<User[]> {
    this.logger.log('Finding users with filters');
    
    let query: FilterQuery<User> = {};
    
    // Handle deleted/all users filter
    if (!includeDeleted) {
      query.deleted = { $ne: true };
    }
    
    // Add status filter if provided
    if (status) {
      query.status = status;
    }
    
    // Add role filter if provided
    if (role) {
      query.role = role;
    }
    
    // Add date range filter if provided
    if (startDate || endDate) {
      query.createdAt = {};
      
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }
    
    // Add search functionality
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      
      // If we already have filters, add search as an $and condition
      if (Object.keys(query).length > 0) {
        query = {
          $and: [
            query,
            {
              $or: [
                { email: searchRegex },
                { username: searchRegex },
                // Essayer de convertir en ObjectId si la recherche ressemble à un ID
                { _id: search.match(/^[0-9a-fA-F]{24}$/) ? search : null }
              ]
            }
          ]
        };
      } else {
        // Otherwise just use $or for search
        query = {
          $or: [
            { email: searchRegex },
            { username: searchRegex },
            // Essayer de convertir en ObjectId si la recherche ressemble à un ID
            { _id: search.match(/^[0-9a-fA-F]{24}$/) ? search : null }
          ]
        };
      }
      
      this.logger.log(`Searching for users matching: ${search}`);
    }
    
    this.logger.log(`Query: ${JSON.stringify(query)}`);
    
    return this.userModel.find(query)
      .select('-password -verificationToken -passwordResetToken -passwordResetExpires')
      .sort({ createdAt: -1 })
      .limit(10) // Limiter le nombre de résultats pour de meilleures performances
      .exec();
  }

  /**
   * Find all deleted users (in trash) with advanced filtering
   */
  async findAllDeleted(
    search?: string,
    role?: UserRole,
    startDate?: string,
    endDate?: string
  ): Promise<User[]> {
    this.logger.log('Finding all deleted users with filters');
    
    let query: FilterQuery<User> = { deleted: true };
    
    // Add role filter if provided
    if (role) {
      query.role = role;
    }
    
    // Add deletion date range filter if provided
    if (startDate || endDate) {
      query.deletedAt = {};
      
      if (startDate) {
        query.deletedAt.$gte = new Date(startDate);
      }
      
      if (endDate) {
        query.deletedAt.$lte = new Date(endDate);
      }
    }
    
    // Add search functionality
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      
      // If we already have filters, add search as an $and condition
      if (Object.keys(query).length > 1) { // We already have deleted: true
        query = {
          $and: [
            query,
            {
              $or: [
                { email: searchRegex },
                { username: searchRegex },
                { _id: search.match(/^[0-9a-fA-F]{24}$/) ? search : null }
              ]
            }
          ]
        };
      } else {
        // Otherwise just add $or for search while keeping deleted: true
        query = {
          deleted: true,
          $or: [
            { email: searchRegex },
            { username: searchRegex },
            { _id: search.match(/^[0-9a-fA-F]{24}$/) ? search : null }
          ]
        };
      }
      
      this.logger.log(`Searching for deleted users matching: ${search}`);
    }
    
    this.logger.log(`Query: ${JSON.stringify(query)}`);
    
    return this.userModel.find(query)
      .select('-password -verificationToken -passwordResetToken -passwordResetExpires')
      .sort({ deletedAt: -1 })
      .exec();
  }

  /**
   * Find users by role
   */
  async findByRole(role: UserRole): Promise<User[]> {
    this.logger.log(`Finding users with role: ${role}`);
    return this.userModel.find({ role, deleted: { $ne: true } })
      .select('-password -verificationToken -passwordResetToken -passwordResetExpires')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find users by status
   */
  async findByStatus(status: UserStatus): Promise<User[]> {
    this.logger.log(`Finding users with status: ${status}`);
    return this.userModel.find({ status, deleted: { $ne: true } })
      .select('-password -verificationToken -passwordResetToken -passwordResetExpires')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find user by ID
   */
  async findOne(id: string): Promise<User> {
    this.logger.log(`Finding user with ID: ${id}`);
    const user = await this.userModel.findOne({ _id: id })
      .select('-password -verificationToken -passwordResetToken -passwordResetExpires')
      .exec();
    
    if (!user) {
      this.logger.warn(`User with ID ${id} not found`);
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    
    return user;
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User> {
    this.logger.log(`Finding user with email: ${email}`);
    const normalizedEmail = email.trim().toLowerCase();
    
    const user = await this.userModel.findOne({ email: normalizedEmail })
      .select('-password -verificationToken -passwordResetToken -passwordResetExpires')
      .exec();
    
    if (!user) {
      this.logger.warn(`User with email ${email} not found`);
      throw new NotFoundException(`User with email ${email} not found`);
    }
    
    return user;
  }

  /**
   * Update user
   */
  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    this.logger.log(`Updating user with ID: ${id}`);
    
    // Check if email is being updated and if it already exists
    if (updateUserDto.email) {
      const normalizedEmail = updateUserDto.email.trim().toLowerCase();
      const existingUser = await this.userModel.findOne({ 
        email: normalizedEmail,
        _id: { $ne: id }
      });
      
      if (existingUser) {
        this.logger.warn(`Email ${normalizedEmail} is already in use`);
        throw new ConflictException('Email is already in use');
      }
      
      // Update with normalized email
      updateUserDto.email = normalizedEmail;
    }
    
    const updatedUser = await this.userModel.findOneAndUpdate(
      { _id: id, deleted: { $ne: true } },
      { $set: updateUserDto },
      { new: true }
    )
    .select('-password -verificationToken -passwordResetToken -passwordResetExpires')
    .exec();
    
    if (!updatedUser) {
      this.logger.warn(`User with ID ${id} not found for update`);
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    
    return updatedUser;
  }

  /**
   * Update user status
   */
  async updateStatus(id: string, status: UserStatus): Promise<User> {
    this.logger.log(`Updating status for user with ID: ${id} to ${status}`);
    
    const updatedUser = await this.userModel.findOneAndUpdate(
      { _id: id, deleted: { $ne: true } },
      { $set: { status } },
      { new: true }
    )
    .select('-password -verificationToken -passwordResetToken -passwordResetExpires')
    .exec();
    
    if (!updatedUser) {
      this.logger.warn(`User with ID ${id} not found for status update`);
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    
    return updatedUser;
  }

  /**
   * Soft delete user (move to trash)
   */
  async remove(id: string): Promise<{ message: string }> {
    this.logger.log(`Soft-deleting user with ID: ${id}`);
    
    const user = await this.userModel.findOne({ _id: id, deleted: { $ne: true } });
    
    if (!user) {
      this.logger.warn(`User with ID ${id} not found for deletion`);
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    
    await this.userModel.findByIdAndUpdate(
      id,
      { 
        $set: { 
          deleted: true,
          deletedAt: new Date()
        } 
      }
    );
    
    // Send deletion notification email
    await this.sendUserDeletionEmail(user.email);
    
    this.logger.log(`User ${id} moved to trash`);
    
    return { message: 'User moved to trash successfully' };
  }

  /**
   * Restore user from trash
   */
  async restoreUser(id: string): Promise<User> {
    this.logger.log(`Restoring user with ID: ${id} from trash`);
    
    const user = await this.userModel.findOne({ _id: id, deleted: true });
    
    if (!user) {
      this.logger.warn(`Deleted user with ID ${id} not found for restoration`);
      throw new NotFoundException(`User with ID ${id} not found in trash`);
    }
    
    const restoredUser = await this.userModel.findByIdAndUpdate(
      id,
      { 
        $set: { deleted: false },
        $unset: { deletedAt: 1 }
      },
      { new: true }
    )
    .select('-password -verificationToken -passwordResetToken -passwordResetExpires')
    .exec();
    
    if (!restoredUser) {
      throw new NotFoundException(`Failed to restore user with ID ${id}`);
    }
    
    // Send restoration notification email
    await this.sendUserRestorationEmail(user.email);
    
    this.logger.log(`User ${id} restored from trash`);
    
    return restoredUser;
  }

  /**
   * Permanently delete user
   */
  async permanentlyDeleteUser(id: string): Promise<{ message: string }> {
    this.logger.log(`Permanently deleting user with ID: ${id}`);
    
    const deletedUser = await this.userModel.findOneAndDelete({ _id: id });
    
    if (!deletedUser) {
      this.logger.warn(`User with ID ${id} not found for permanent deletion`);
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    
    this.logger.log(`User ${id} permanently deleted`);
    
    return { message: 'User permanently deleted' };
  }

  /**
   * Clean up users in trash for more than 30 days
   */
  async cleanupTrash(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    this.logger.log(`Cleaning up users deleted before ${thirtyDaysAgo.toISOString()}`);
    
    const result = await this.userModel.deleteMany({
      deleted: true,
      deletedAt: { $lt: thirtyDaysAgo }
    });
    
    this.logger.log(`Permanently deleted ${result.deletedCount} users from trash`);
    
    return result.deletedCount;
  }

  /**
   * Get user with verification token for authentication purposes
   */
  async getUserWithToken(userIdOrEmail: string): Promise<User> {
    let user: User | null = null;
    
    // Determine if we're looking up by ID or email
    if (userIdOrEmail.includes('@')) {
      // It's an email
      const normalizedEmail = userIdOrEmail.trim().toLowerCase();
      user = await this.userModel.findOne({ 
        email: normalizedEmail,
        deleted: { $ne: true }
      }).exec();
    } else if (userIdOrEmail.length === 24) {
      // It's likely a MongoDB ID
      user = await this.userModel.findOne({ 
        _id: userIdOrEmail,
        deleted: { $ne: true }
      }).exec();
    } else {
      // It's probably a verification token
      user = await this.userModel.findOne({ 
        verificationToken: userIdOrEmail,
        deleted: { $ne: true }
      }).exec();
    }
    
    if (!user) {
      throw new NotFoundException(`User not found`);
    }
    
    return user;
  }

  /**
   * Find user by reset token
   */
  async findByResetToken(token: string): Promise<User> {
    const user = await this.userModel.findOne({ 
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() },
      deleted: { $ne: true }
    }).exec();
    
    if (!user) {
      throw new NotFoundException('Invalid or expired password reset token');
    }
    
    return user;
  }

  /**
   * Clean unverified accounts older than 24 hours
   */
  async cleanupUnverifiedAccounts(): Promise<void> {
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);
    
    const result = await this.userModel.deleteMany({
      emailVerified: false,
      createdAt: { $lt: oneDayAgo }
    });
    
    this.logger.log(`Deleted ${result.deletedCount} unverified accounts`);
  }

  /**
   * Send email notification for user deletion
   */
  private async sendUserDeletionEmail(email: string): Promise<boolean> {
    const currentYear = new Date().getFullYear();
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5174');

    try {
      this.logger.log(`Sending deletion notification email to: ${email}`);
      
      await this.mailerService.sendMail({
        to: email,
        subject: 'Your Account Has Been Moved to Trash',
        template: 'user-deletion',
        context: {
          supportEmail: 'support@expoplatform.com',
          companyName: 'My Expo Platform',
          loginUrl: `${frontendUrl}/login`,
          year: currentYear,
          deletionDate: new Date().toDateString(),
          retentionPeriod: '30 days'
        },
      });
      
      this.logger.log(`Deletion notification email sent successfully to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send deletion email to ${email}: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
 * Get user with password for authentication
 * @param idOrEmail User ID or email
 * @returns User with password
 */
async findUserWithPassword(idOrEmail: string): Promise<User> {
  let user: User | null;
  
  // Check if input is an email or ID
  if (idOrEmail.includes('@')) {
    user = await this.userModel.findOne({ 
      email: idOrEmail.toLowerCase(),
      deleted: { $ne: true }
    }).select('+password').exec();
  } else {
    user = await this.userModel.findById(idOrEmail)
      .select('+password')
      .exec();
  }
  
  if (!user) {
    throw new NotFoundException('User not found');
  }
  
  return user;
}

 /**
 * Update user password
 * @param userId User ID
 * @param newPassword New password (unhashed)
 */
async updatePassword(userId: string, newPassword: string): Promise<void> {
  const user = await this.userModel.findById(userId);
  
  if (!user) {
    throw new NotFoundException('User not found');
  }
  
  // Password will be hashed by the pre-save hook in the schema
  user.password = newPassword;
  await user.save();
  
  this.logger.log(`Password updated for user: ${userId}`);
}
  /**
   * Send email notification for user restoration
   */
  private async sendUserRestorationEmail(email: string): Promise<boolean> {
    const currentYear = new Date().getFullYear();
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5174');

    try {
      this.logger.log(`Sending restoration notification email to: ${email}`);
      
      await this.mailerService.sendMail({
        to: email,
        subject: 'Your Account Has Been Restored',
        template: 'user-restoration',
        context: {
          supportEmail: 'support@expoplatform.com',
          companyName: 'My Expo Platform',
          loginUrl: `${frontendUrl}/login`,
          year: currentYear,
          restorationDate: new Date().toDateString()
        },
      });
      
      this.logger.log(`Restoration notification email sent successfully to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send restoration email to ${email}: ${error.message}`, error.stack);
      return false;
    }
  }
}