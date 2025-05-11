import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { PugAdapter } from '@nestjs-modules/mailer/dist/adapters/pug.adapter';  // Importation de l'adaptateur Pug
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccessTokenStrategy } from './strategies/access-token.strategy';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy';
import { PassportModule } from '@nestjs/passport';
import { UserModule } from '../user/user.module';
import { User, UserSchema } from '../user/entities/user.entity';
import { ExhibitorModule } from '../exhibitor/exhibitor.module';
import { OrganizerModule } from '../organizer/organizer.module';
import { RegistrationModule } from 'src/registration/registration.module';

@Module({
  imports: [
    // Utilisation du module Passport avec la stratégie JWT par défaut
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // Inclusion du module User pour l'authentification avec forwardRef pour éviter les dépendances circulaires
    forwardRef(() => UserModule),
    
    // Inclusion des modules Exhibitor et Organizer pour l'inscription
    forwardRef(() => ExhibitorModule),
    forwardRef(() => OrganizerModule),
    forwardRef(() => RegistrationModule),
    
    // Inclusion du modèle User pour des opérations directes
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
    ]),

    // Configuration JWT
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
    
    // Configuration de Mailer
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
          adapter: new PugAdapter(),  // Changement de HandlebarsAdapter à PugAdapter
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
