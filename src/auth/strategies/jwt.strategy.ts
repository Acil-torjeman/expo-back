// src/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserStatus, UserRole } from '../../user/entities/user.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private configService: ConfigService,
  ) {
    // Get JWT secret with fallback for development
    const secretKey = configService.get<string>('JWT_SECRET') || 'fallback_secret_key_for_development';
    
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secretKey,
    });
    
    this.logger.log('JWT Strategy initialized with secret');
  }

  async validate(payload: any) {
    const userId = payload.sub;
    try {
      this.logger.log(`Validating JWT for userId: ${userId}`);
      const user = await this.userModel.findById(userId);

      if (!user) {
        this.logger.error(`User not found: ${userId}`);
        throw new UnauthorizedException('User not found');
      }

      if (user.status !== UserStatus.ACTIVE) {
        this.logger.error(`User account not active: ${userId}, status: ${user.status}`);
        throw new UnauthorizedException('User account is not active');
      }

      // Explicitly convert ID to string and trim
      const idString = String(user._id).trim();
      
      // Normalize the role - ensure it's a valid enum value
      const roleString = String(user.role).toLowerCase().trim();
      let normalizedRole: UserRole;
      
      // Match the role string to UserRole enum
      switch (roleString) {
        case 'admin':
          normalizedRole = UserRole.ADMIN;
          break;
        case 'organizer':
          normalizedRole = UserRole.ORGANIZER;
          break;
        case 'exhibitor':
          normalizedRole = UserRole.EXHIBITOR;
          break;
        default:
          this.logger.error(`Invalid role: ${roleString}`);
          throw new UnauthorizedException('Invalid user role');
      }
      
      this.logger.log(`User authenticated: ${idString} with normalized role ${normalizedRole}`);
      
      // Return user with properly typed role
      return {
        id: idString,
        email: user.email,
        role: normalizedRole,
      };
    } catch (error) {
      this.logger.error(`JWT validation error for userId ${userId}: ${error.message}`);
      throw new UnauthorizedException('Authentication failed');
    }
  }
}