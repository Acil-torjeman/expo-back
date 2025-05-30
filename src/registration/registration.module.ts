// src/registration/registration.module.ts

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RegistrationService } from './registration.service';
import { RegistrationController } from './registration.controller';
import { Registration, RegistrationSchema } from './entities/registration.entity';
import { EventModule } from '../event/event.module';
import { ExhibitorModule } from '../exhibitor/exhibitor.module';
import { StandModule } from '../stand/stand.module';
import { EquipmentModule } from '../equipment/equipment.module';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { PlanModule } from 'src/plan/plan.module';
import { OrganizerModule } from '../organizer/organizer.module'; // Add this import

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Registration.name, schema: RegistrationSchema },
    ]),
    forwardRef(() => EventModule),
    forwardRef(() => ExhibitorModule),
    forwardRef(() => StandModule),
    forwardRef(() => PlanModule),
    forwardRef(() => EquipmentModule),
    forwardRef(() => OrganizerModule), 
    MailModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [RegistrationController],
  providers: [RegistrationService],
  exports: [RegistrationService],
})
export class RegistrationModule {}