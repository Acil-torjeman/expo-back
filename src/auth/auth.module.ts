// src/auth/auth.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccessTokenStrategy } from './strategies/access-token.strategy';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy';
import { PassportModule } from '@nestjs/passport';
import { UserModule } from '../user/user.module';
import { User, UserSchema } from '../user/entities/user.entity';
import { ExhibitorModule } from '../exhibitor/exhibitor.module';
import { OrganizerModule } from '../organizer/organizer.module';

@Module({
  imports: [
    // Use Passport Module with default JWT strategy
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // Include User module for authentication with forwardRef to avoid circular dependency
    forwardRef(() => UserModule),
    
    // Include Exhibitor and Organizer modules for signup with forwardRef to avoid circular dependency
    forwardRef(() => ExhibitorModule),
    forwardRef(() => OrganizerModule),
    
    // Include User model for direct operations
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
    ]),

    // JWT Configuration
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string | number>('JWT_EXPIRES_IN'),
        },
      }),
    }),
    
    // Mailer Configuration
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.get('MAIL_HOST', 'sandbox.smtp.mailtrap.io'),
          port: configService.get('MAIL_PORT', 2525),
          secure: false,
          auth: {
            user: configService.get('MAIL_USER'),
            pass: configService.get('MAIL_PASSWORD'),
          },
        },
        defaults: {
          from: `"ExpoManagement" <${configService.get('MAIL_FROM', 'noreply@myexpo.com')}>`,
        },
        template: {
          dir: process.cwd() + '/templates/',
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService, 
    AccessTokenStrategy, 
    RefreshTokenStrategy,
  ],
  exports: [
    AuthService, 
    AccessTokenStrategy, 
    RefreshTokenStrategy, 
    PassportModule
  ],
})
export class AuthModule {}