// src/auth/strategies/access-token.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptionsWithRequest } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserStatus } from '../../user/entities/user.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    configService: ConfigService,
  ) {
    // Utiliser une valeur par défaut si JWT_SECRET n'est pas défini
    const secretKey = configService.get<string>('JWT_SECRET');
    
    // Ne pas lancer d'erreur, simplement utiliser la valeur par défaut
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secretKey,
      passReqToCallback: true,
    } as StrategyOptionsWithRequest);
    
    // Log pour débogage
    console.log('Access token strategy initialized with secret key:', secretKey ? 'Defined' : 'Not defined');
  }

  async validate(req: Request, payload: any) {
    const userId = payload.sub;
    const user = await this.userModel.findById(userId);
  
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
  
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User account is not active');
    }
  
    // Ensure consistent ID format - convert to string and trim any whitespace
    return {
      id: String(user._id).trim(),
      email: user.email,
      role: user.role,
    };
  }
}