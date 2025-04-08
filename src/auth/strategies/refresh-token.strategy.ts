// src/auth/strategies/refresh-token.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptionsWithRequest } from 'passport-jwt';
import { Request } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserStatus } from '../../user/entities/user.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    configService: ConfigService,
  ) {
    // Utiliser une valeur par défaut si JWT_SECRET n'est pas défini
    const secretKey = configService.get<string>('JWT_SECRET');
    
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secretKey,
      passReqToCallback: true,
    } as StrategyOptionsWithRequest);
    
    // Log pour débogage
    console.log('Refresh token strategy initialized with secret key:', secretKey ? 'Defined' : 'Not defined');
  }

  async validate(req: Request, payload: any) {
    // Extraire le refresh token de l'en-tête Authorization
    const authHeader = req.get('Authorization');
    
    if (!authHeader) {
      throw new UnauthorizedException('No authorization header found');
    }
    
    const refreshToken = authHeader.replace('Bearer', '').trim();
    
    // Récupérer l'utilisateur
    const userId = payload.sub;
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User account is not active');
    }
    
    // Ensure user ID is consistently a string
    return {
      id: String(user._id).trim(),
      email: user.email,
      role: user.role,
      refreshToken,
    };
  }
}