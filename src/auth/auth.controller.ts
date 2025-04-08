// src/auth/auth.controller.ts
import { 
  Controller, 
  Post, 
  Body, 
  UseInterceptors, 
  UploadedFiles, 
  Get, 
  Query, 
  HttpCode, 
  HttpStatus,
  Logger,
  BadRequestException,
  UseGuards,
  Req,
  Inject,
  forwardRef,
  UnauthorizedException
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { File as MulterFile } from 'multer';
import { ExhibitorService } from '../exhibitor/exhibitor.service';
import { OrganizerService } from '../organizer/organizer.service';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  
  constructor(
    private readonly authService: AuthService,
    @Inject(forwardRef(() => ExhibitorService)) private readonly exhibitorService: ExhibitorService,
    @Inject(forwardRef(() => OrganizerService)) private readonly organizerService: OrganizerService
  ) {}

  @Post('exhibitor-signup')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'kbisDocument', maxCount: 1 },
        { name: 'companyLogo', maxCount: 1 },
        { name: 'insuranceCertificate', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: './uploads/exhibitor-documents',
          filename: (_req, file, cb) => {
            // Generate unique filename
            const randomName = Array(32)
              .fill(null)
              .map(() => Math.round(Math.random() * 16).toString(16))
              .join('');
            return cb(
              null, 
              `${randomName}${extname(file.originalname)}`
            );
          },
        }),
        fileFilter: (_req, file, cb) => {
          // Allow only specific file types
          if (!file.originalname.match(/\.(pdf|jpg|jpeg|png)$/)) {
            return cb(
              new Error('Only PDF, JPG, and PNG files are allowed'), 
              false
            );
          }
          cb(null, true);
        },
        limits: {
          fileSize: 5 * 1024 * 1024, // 5MB file size limit
        },
      }
    )
  )
  @HttpCode(HttpStatus.CREATED)
  async exhibitorSignup(
    @Body() exhibitorSignupDto: any,
    @UploadedFiles()
    files: {
      kbisDocument?: MulterFile[];
      companyLogo?: MulterFile[];
      insuranceCertificate?: MulterFile[];
    },
  ) {
    try {
      this.logger.log(`Received signup request for email: ${exhibitorSignupDto.email}`);
      
      // Utilise exhibitorService.signup() au lieu de authService.exhibitorSignup()
      return await this.exhibitorService.signup(exhibitorSignupDto, files);
    } catch (error) {
      // Log the error for server-side tracking
      this.logger.error(`Signup error for ${exhibitorSignupDto.email}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post('organizer-signup')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'organizationLogo', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: './uploads/organization-logos',
          filename: (_req, file, cb) => {
            // Generate unique filename
            const randomName = Array(32)
              .fill(null)
              .map(() => Math.round(Math.random() * 16).toString(16))
              .join('');
            return cb(
              null, 
              `${randomName}${extname(file.originalname)}`
            );
          },
        }),
        fileFilter: (_req, file, cb) => {
          // Allow only image files for logo
          if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
            return cb(
              new Error('Only JPG, PNG, and GIF files are allowed for the logo'), 
              false
            );
          }
          cb(null, true);
        },
        limits: {
          fileSize: 2 * 1024 * 1024, // 2MB file size limit for logos
        },
      }
    )
  )
  @HttpCode(HttpStatus.CREATED)
  async organizerSignup(
    @Body() organizerSignupDto: any,
    @UploadedFiles()
    files: {
      organizationLogo?: MulterFile[];
    },
  ) {
    try {
      this.logger.log(`Received organizer signup request for email: ${organizerSignupDto.email}`);
      
      // Utilise organizerService.signup() au lieu de authService.organizerSignup()
      return await this.organizerService.signup(organizerSignupDto, files);
    } catch (error) {
      // Log the error for server-side tracking
      this.logger.error(`Organizer signup error for ${organizerSignupDto.email}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    this.logger.log(`Login attempt for user: ${loginDto.email}`);
    return this.authService.login(loginDto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req) {
    const userId = req.user.id;
    this.logger.log(`Logout attempt for user ID: ${userId}`);
    return this.authService.logout(userId);
  }

  @Post('refresh')
@HttpCode(HttpStatus.OK)
async refreshTokens(@Body() refreshDto: { userId: string, refreshToken: string }) {
  try {
    const { userId, refreshToken } = refreshDto;
    
    if (!userId || !refreshToken) {
      throw new BadRequestException('User ID and refresh token are required');
    }
    
    this.logger.log(`Token refresh attempt for user ID: ${userId}`);
    
    return this.authService.refreshTokens(userId, refreshToken);
  } catch (error) {
    this.logger.error(`Error refreshing tokens: ${error.message}`, error.stack);
    
    // Amélioration du message d'erreur pour faciliter le débogage
    if (error instanceof UnauthorizedException) {
      throw error;
    }
    
    throw new UnauthorizedException('Failed to refresh token');
  }
}

  @Get('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Query('token') token: string) {
    if (!token) {
      this.logger.warn('Email verification attempt with no token');
      throw new BadRequestException('Token is required for email verification');
    }
    
    this.logger.log(`Email verification attempt with token: ${token.substring(0, 10)}...`);
    
    try {
      const result = await this.authService.verifyEmail(token);
      this.logger.log(`Email verification successful for token: ${token.substring(0, 10)}...`);
      return result;
    } catch (error) {
      this.logger.error(`Email verification failed for token: ${token.substring(0, 10)}... Error: ${error.message}`);
      throw error;
    }
  }
  
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerificationEmail(@Body('email') email: string) {
    if (!email) {
      throw new BadRequestException('Email is required');
    }
    
    this.logger.log(`Resend verification email request for: ${email}`);
    
    try {
      const result = await this.authService.resendVerificationEmail(email);
      this.logger.log(`Verification email resent successfully to: ${email}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to resend verification email to: ${email}. Error: ${error.message}`);
      throw error;
    }
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    this.logger.log(`Forgot password request for email: ${forgotPasswordDto.email}`);
    
    try {
      return await this.authService.forgotPassword(forgotPasswordDto);
    } catch (error) {
      this.logger.error(`Error processing forgot password for ${forgotPasswordDto.email}: ${error.message}`);
      throw error;
    }
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    this.logger.log(`Reset password request with token: ${resetPasswordDto.token.substring(0, 10)}...`);
    
    try {
      return await this.authService.resetPassword(resetPasswordDto);
    } catch (error) {
      this.logger.error(`Error processing password reset: ${error.message}`);
      throw error;
    }
  }
}