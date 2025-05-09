// src/analytics/analytics.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { Analytics, AnalyticsSchema } from './entities/analytics.entity';
import { Registration, RegistrationSchema } from '../registration/entities/registration.entity';
import { Event, EventSchema } from '../event/entities/event.entity';
import { Stand, StandSchema } from '../stand/entities/stand.entity';
import { Invoice, InvoiceSchema } from '../invoice/entities/invoice.entity';
import { Organizer, OrganizerSchema } from '../organizer/entities/organizer.entity';
import { User, UserSchema } from '../user/entities/user.entity'; // Ajoutez cette ligne
import { OrganizerModule } from '../organizer/organizer.module';
import { UserModule } from '../user/user.module';
import { EventModule } from '../event/event.module';
import { StandModule } from '../stand/stand.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Analytics.name, schema: AnalyticsSchema },
      { name: Registration.name, schema: RegistrationSchema },
      { name: Event.name, schema: EventSchema },
      { name: Stand.name, schema: StandSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Organizer.name, schema: OrganizerSchema },
      { name: User.name, schema: UserSchema }, 
    ]),
    forwardRef(() => OrganizerModule),
    forwardRef(() => EventModule),
    forwardRef(() => StandModule),
    UserModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}