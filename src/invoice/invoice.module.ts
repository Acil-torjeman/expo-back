// src/invoice/invoice.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { Invoice, InvoiceSchema } from './entities/invoice.entity';
import { Registration, RegistrationSchema } from '../registration/entities/registration.entity';
import { Exhibitor, ExhibitorSchema } from '../exhibitor/entities/exhibitor.entity';
import { Organizer, OrganizerSchema } from '../organizer/entities/organizer.entity';
import { Event, EventSchema } from '../event/entities/event.entity';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Registration.name, schema: RegistrationSchema },
      { name: Exhibitor.name, schema: ExhibitorSchema },
      { name: Organizer.name, schema: OrganizerSchema },
      { name: Event.name, schema: EventSchema },
    ]),
  ],
  controllers: [InvoiceController],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoiceModule {}