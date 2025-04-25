// src/invoice/entities/invoice.entity.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Registration } from '../../registration/entities/registration.entity';
import { Exhibitor } from '../../exhibitor/entities/exhibitor.entity';
import { Organizer } from '../../organizer/entities/organizer.entity';
import { Event } from '../../event/entities/event.entity';

export enum InvoiceStatus {
  PENDING = 'pending',
  PAID = 'paid',
  CANCELLED = 'cancelled'
}

// Définir clairement l'interface pour les items de facture
export interface InvoiceItem {
  type: string;
  name: string;
  description: string;
  price: number;
  quantity: number;
}

@Schema({ timestamps: true }) // Ajouter timestamps: true ici
export class Invoice extends Document {
  @Prop({ required: true, unique: true })
  invoiceNumber: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Registration', required: true })
  registration: Registration;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Exhibitor', required: true })
  exhibitor: Exhibitor;
  
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organizer', required: true })
  organizer: Organizer;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Event', required: true })
  event: Event;

  // Définir le type correct pour items
  @Prop({ type: [Object], required: true })
  items: InvoiceItem[];

  @Prop({ required: true })
  subtotal: number;

  @Prop({ required: true })
  taxRate: number;

  @Prop({ required: true })
  taxAmount: number;

  @Prop({ required: true })
  total: number;

  @Prop({ required: true, default: InvoiceStatus.PENDING })
  status: InvoiceStatus;

  @Prop()
  pdfPath?: string;
  
  // Ces propriétés seront automatiquement ajoutées grâce à timestamps: true
  createdAt: Date;
  updatedAt: Date;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);