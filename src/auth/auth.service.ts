// src/auth/auth.service.ts
import { 
  Injectable, 
  UnauthorizedException,
  Logger,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { User, UserStatus } from '../user/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { MailerService } from '@nestjs-modules/mailer';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UserService } from '../user/user.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Injection du modèle User pour les opérations directes
  @InjectModel(User.name) private userModel: Model<User>;

  constructor(
    @Inject(forwardRef(() => UserService)) private userService: UserService,
    private jwtService: JwtService,
    private mailerService: MailerService,
    private configService: ConfigService,
  ) {}

  /**
   * Send verification email to user
   * @param email User email
   * @param verificationToken Verification token
   * @returns Whether email was sent successfully
   */
  async sendVerificationEmail(email: string, token: string): Promise<boolean> {
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5174');
    const verificationUrl = `${frontendUrl}/verify-email?token=${token}`;
    const currentYear = new Date().getFullYear();

    try {
      this.logger.log(`Sending verification email to: ${email}`);
      
      await this.mailerService.sendMail({
        to: email,
        subject: 'Verify Your Email',
        template: 'verification',
        context: {
          verificationUrl,
          supportEmail: 'support@expoplatform.com',
          companyName: 'My Expo Platform',
          year: currentYear,
        },
      });
      
      this.logger.log(`Email sent successfully to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${email}: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * User login
   */
  async login(loginDto: LoginDto): Promise<{ access_token: string; refresh_token: string; user: any }> {
    try {
      // Normalize email
      const normalizedEmail = loginDto.email.trim().toLowerCase();
      this.logger.log(`Login attempt for user: ${normalizedEmail}`);
      
      // Find user by email (using userService with full details including password)
      let user;
      try {
        user = await this.userService.getUserWithToken(normalizedEmail);
      } catch (error) {
        throw new UnauthorizedException('Invalid email or password');
      }
      
      // Verify password
      let isPasswordValid = false;
      
      try {
        // Use argon2 to verify password
        isPasswordValid = await argon2.verify(user.password, loginDto.password);
      } catch (error) {
        this.logger.error(`Password verification error: ${error.message}`);
        isPasswordValid = false;
      }
      
      if (!isPasswordValid) {
        this.logger.warn(`Invalid password for user: ${normalizedEmail}`);
        throw new UnauthorizedException('Invalid email or password');
      }
      
      // Check if user has verified email
      if (!user.emailVerified) {
        this.logger.warn(`User not verified: ${normalizedEmail}`);
        throw new UnauthorizedException('Email not verified. Please check your inbox.');
      }
      
      // Check user status
      if (user.status !== UserStatus.ACTIVE) {
        this.logger.warn(`User not active: ${normalizedEmail}`);
        throw new UnauthorizedException('Your account is not active. Please contact support.');
      }
      
      // Create payloads for tokens
      const payload = { 
        email: user.email, 
        sub: user._id, 
        role: user.role 
      };
      
      // Generate tokens
      const access_token = this.jwtService.sign(payload, { expiresIn: '1h' });
      const refresh_token = this.jwtService.sign(payload, { expiresIn: '7d' });
      
      this.logger.log(`Login successful for user: ${normalizedEmail}`);
      
      return {
        access_token,
        refresh_token,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          status: user.status,
        }
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      this.logger.error(`Error during login: ${error.message}`, error.stack);
      throw new InternalServerErrorException('An error occurred during login. Please try again.');
    }
  }

  /**
   * User logout
   */
  async logout(userId: string, refreshToken?: string): Promise<any> {
    try {
      this.logger.log(`User logout attempt: ${userId}`);
      
      // Vérifier si l'utilisateur existe
      const user = await this.userModel.findById(userId);
      
      if (!user) {
        this.logger.warn(`User ${userId} not found during logout`);
        // Nous retournons un succès même si l'utilisateur n'est pas trouvé
        // pour éviter les fuites d'information
        return {
          message: 'Logout successful',
        };
      }
      
      // Si un refresh token est fourni, nous pourrions le "blacklister"
      // Dans une implémentation réelle, vous pourriez stocker les tokens invalidés
      // dans une base de données Redis avec une expiration
      
      // Par exemple:
      // await this.redisService.set(`blacklist:${refreshToken}`, 'true', 'EX', 60 * 60 * 24 * 7);
      
      // Pour un système plus simple, on pourrait stocker les dernières déconnexions dans le document utilisateur
      if (refreshToken) {
        await this.userModel.findByIdAndUpdate(userId, {
          $set: {
            lastLogout: new Date(),
            // On pourrait stocker un hash du dernier refresh token invalidé
            // invalidatedToken: crypto.createHash('sha256').update(refreshToken).digest('hex')
          }
        });
      }
      
      this.logger.log(`User logged out successfully: ${userId}`);
      
      return {
        message: 'Logout successful',
      };
    } catch (error) {
      this.logger.error(`Error during logout: ${error.message}`, error.stack);
      // Même en cas d'erreur, nous retournons un succès pour la sécurité
      return {
        message: 'Logout successful',
      };
    }
  }
  /**
   * Refresh tokens
   */
  async refreshTokens(userId: string, refreshToken: string): Promise<any> {
    try {
      this.logger.log(`Refreshing tokens for user: ${userId}`);
      
      // Vérifier si le user ID est valide
      if (!userId || !refreshToken) {
        this.logger.warn('Missing userId or refreshToken');
        throw new UnauthorizedException('Invalid refresh parameters');
      }
      
      // Vérifier si l'utilisateur existe
      let user;
      try {
        user = await this.userModel.findById(userId);
        
        if (!user) {
          this.logger.warn(`User not found for ID: ${userId}`);
          throw new UnauthorizedException('User not found');
        }
        
        // Vérifier si l'utilisateur est actif
        if (user.status !== UserStatus.ACTIVE) {
          this.logger.warn(`User ${userId} is not active`);
          throw new UnauthorizedException('User account is not active');
        }
        
        // Dans une implémentation réelle, vous devriez également vérifier
        // que le refreshToken est valide et appartient à cet utilisateur
        
      } catch (error) {
        this.logger.error(`Error finding user for refresh: ${error.message}`);
        throw new UnauthorizedException('Invalid refresh token');
      }
      
      // Créer un nouveau payload avec les informations nécessaires
      const payload = { 
        email: user.email, 
        sub: user._id, 
        role: user.role 
      };
      
      // Générer de nouveaux tokens avec des durées de validité appropriées
      const accessToken = this.jwtService.sign(payload, { expiresIn: '24h' });
      const newRefreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });
      
      this.logger.log(`Tokens refreshed successfully for user: ${userId}`);
      
      return {
        access_token: accessToken,
        refresh_token: newRefreshToken,
      };
    } catch (error) {
      this.logger.error(`Error refreshing tokens: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Verify email
   */
  async verifyEmail(token: string): Promise<any> {
    if (!token) {
      throw new BadRequestException('Verification token is required');
    }
    
    this.logger.log(`Processing email verification with token: ${token.substring(0, 10)}...`);
    
    // Find user with this token
    let user;
    try {
      user = await this.userService.getUserWithToken(token);
    } catch (error) {
      this.logger.warn(`Invalid or expired verification token: ${token.substring(0, 10)}...`);
      throw new BadRequestException('This verification link has already been used or is invalid. If your email is already verified, you can log in to your account.');
    }
    
    if (user.emailVerified) {
      this.logger.log(`Email already verified for user: ${user.email}`);
      return {
        message: 'Email already verified. You can now log in.',
      };
    }

    // Update user fields
    const updateData = {
      emailVerified: true,
      status: user.status === UserStatus.PENDING ? UserStatus.ACTIVE : user.status
    };
    
    try {
      // Update user removing verification token and activating if needed
      await this.userModel.findByIdAndUpdate(
        user._id,
        { 
          $set: updateData,
          $unset: { verificationToken: 1 } 
        }
      );
      
      this.logger.log(`Email verified successfully for user: ${user.email}`);
      
      return {
        message: 'Email verified successfully. You can now log in.',
      };
    } catch (error) {
      this.logger.error(`Error saving verified user: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to update user verification status');
    }
  }
  
  /**
   * Resend verification email
   */
  async resendVerificationEmail(email: string): Promise<any> {
    try {
      this.logger.log(`Request to resend verification email to: ${email}`);
      
      // Normalize email
      const normalizedEmail = email.trim().toLowerCase();
      
      // Find user with normalized email
      let user;
      try {
        user = await this.userService.getUserWithToken(normalizedEmail);
      } catch (error) {
        this.logger.warn(`User not found for email: ${normalizedEmail}`);
        throw new NotFoundException('User not found');
      }
      
      if (user.emailVerified) {
        this.logger.log(`Email already verified for user: ${normalizedEmail}`);
        throw new BadRequestException('Email is already verified');
      }
      
      // Generate new verification token
      const newVerificationToken = crypto.randomBytes(32).toString('hex');
      
      // Update token in database
      await this.userModel.findByIdAndUpdate(
        user._id,
        { verificationToken: newVerificationToken }
      );
      
      this.logger.log(`New verification token generated for user: ${normalizedEmail}`);
      
      // Send verification email
      const emailSent = await this.sendVerificationEmail(normalizedEmail, newVerificationToken);
      
      if (!emailSent) {
        this.logger.error(`Failed to send verification email to: ${normalizedEmail}`);
        throw new InternalServerErrorException('Failed to send verification email');
      }
      
      this.logger.log(`Verification email successfully resent to: ${normalizedEmail}`);
      
      return {
        message: 'Verification email sent. Please check your inbox.',
      };
    } catch (error) {
      // Propagate specific errors
      if (error instanceof NotFoundException || 
          error instanceof BadRequestException ||
          error instanceof InternalServerErrorException) {
        throw error;
      }
      
      this.logger.error(`Error resending verification email: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to resend verification email');
    }
  }
  
  /**
   * Forgot password
   */
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<any> {
    try {
      // Normalize email
      const normalizedEmail = forgotPasswordDto.email.trim().toLowerCase();
      this.logger.log(`Processing forgot password request for: ${normalizedEmail}`);
      
      // Try to find user by email, but don't throw if not found (security)
      let user;
      try {
        user = await this.userService.getUserWithToken(normalizedEmail);
      } catch (error) {
        // Don't reveal that email doesn't exist for security reasons
        return {
          message: 'If your email is registered, you will receive a password reset link shortly.',
        };
      }
      
      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date();
      resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1); // Token expires in 1 hour
      
      // Update user with reset token
      await this.userModel.findByIdAndUpdate(
        user._id,
        { 
          passwordResetToken: resetToken,
          passwordResetExpires: resetTokenExpiry
        }
      );
      
      this.logger.log(`Reset token generated for user: ${normalizedEmail}`);
      
      // Send reset email
      const emailSent = await this.sendPasswordResetEmail(normalizedEmail, resetToken);
      
      if (!emailSent) {
        this.logger.error(`Failed to send password reset email to: ${normalizedEmail}`);
        throw new InternalServerErrorException('Failed to send password reset email');
      }
      
      this.logger.log(`Password reset email sent to: ${normalizedEmail}`);
      
      return {
        message: 'If your email is registered, you will receive a password reset link shortly.',
      };
    } catch (error) {
      // Handle specific errors
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      
      this.logger.error(`Error during forgot password: ${error.message}`, error.stack);
      throw new InternalServerErrorException('An error occurred during the password reset process');
    }
  }

  /**
   * Reset password
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<any> {
    try {
      const { token, password, passwordConfirmation } = resetPasswordDto;
      
      this.logger.log(`Processing password reset with token: ${token.substring(0, 10)}...`);
      
      // Confirm passwords match
      if (password !== passwordConfirmation) {
        throw new BadRequestException('Passwords do not match');
      }
      
      // Find user with valid token
      let user;
      try {
        user = await this.userService.findByResetToken(token);
      } catch (error) {
        this.logger.warn(`Invalid or expired password reset token: ${token.substring(0, 10)}...`);
        throw new BadRequestException('Invalid or expired password reset link');
      }
      
      // Hasher le mot de passe manuellement avant la mise à jour
      const hashedPassword = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536,  // m=65536
        timeCost: 3,        // t=3
        parallelism: 4      // p=4
      });
      
      // Update user password and clear reset token
      await this.userModel.findByIdAndUpdate(
        user._id,
        {
          $set: {
            password: hashedPassword, // Utilisation du mot de passe haché
            status: user.status === UserStatus.PENDING ? UserStatus.ACTIVE : user.status,
            emailVerified: user.status === UserStatus.PENDING ? true : user.emailVerified
          },
          $unset: {
            passwordResetToken: 1,
            passwordResetExpires: 1
          }
        }
      );
      
      this.logger.log(`Password reset successful for user: ${user.email}`);
      
      // Send confirmation email
      await this.sendPasswordResetSuccessEmail(user.email);
      
      return {
        message: 'Your password has been reset successfully',
      };
    } catch (error) {
      // Handle specific errors
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      this.logger.error(`Error during password reset: ${error.message}`, error.stack);
      throw new InternalServerErrorException('An error occurred during the password reset process');
    }
  }
  
  /**
   * Clean up unverified accounts after 24h
   */
  async cleanupUnverifiedAccounts(): Promise<void> {
    try {
      // Use the user service to clean up
      await this.userService.cleanupUnverifiedAccounts();
    } catch (error) {
      this.logger.error(`Error cleaning up unverified users: ${error.message}`, error.stack);
    }
  }

  /**
   * Send password reset email
   */
  private async sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5174');
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    const currentYear = new Date().getFullYear();

    try {
      this.logger.log(`Sending password reset email to: ${email}`);
      
      await this.mailerService.sendMail({
        to: email,
        subject: 'Reset Your Password',
        template: 'forgot-password',
        context: {
          resetUrl,
          supportEmail: 'support@expoplatform.com',
          companyName: 'My Expo Platform',
          year: currentYear,
        },
      });
      
      this.logger.log(`Password reset email sent successfully to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${email}: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Send password reset success email
   */
  private async sendPasswordResetSuccessEmail(email: string): Promise<boolean> {
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5174');
    const loginUrl = `${frontendUrl}/login`;
    const currentYear = new Date().getFullYear();

    try {
      this.logger.log(`Sending password reset success email to: ${email}`);
      
      await this.mailerService.sendMail({
        to: email,
        subject: 'Your Password Has Been Reset',
        template: 'reset-password-success',
        context: {
          loginUrl,
          supportEmail: 'support@expoplatform.com',
          companyName: 'My Expo Platform',
          year: currentYear,
        },
      });
      
      this.logger.log(`Password reset success email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send password reset success email to ${email}: ${error.message}`, error.stack);
      return false;
    }
  }
}