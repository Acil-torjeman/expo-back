// src/event/event.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventController } from './event.controller';
import { EventService } from './event.service';
import { Event, EventSchema } from './entities/event.entity';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { PlanModule } from '../plan/plan.module';
import { StandModule } from '../stand/stand.module';
import { EquipmentModule } from '../equipment/equipment.module';
import { RegistrationModule } from 'src/registration/registration.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Event.name, schema: EventSchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => UserModule),
    forwardRef(() => PlanModule),
    forwardRef(() => StandModule),
    forwardRef(() => EquipmentModule),
    forwardRef(() => RegistrationModule),
  ],
  controllers: [EventController],
  providers: [EventService],
  exports: [EventService],
})
export class EventModule {}