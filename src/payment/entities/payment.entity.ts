import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { User } from '../../user/entities/user.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum PaymentProvider {
  STRIPE = 'stripe'  // Added Stripe as a valid provider
}

@Schema({ timestamps: true })
export class Payment extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Invoice', required: true })
  invoice: Invoice;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: User;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Prop({ required: true, enum: PaymentProvider, default: PaymentProvider.STRIPE })
  provider: PaymentProvider;

  @Prop()
  providerId: string;

  @Prop()
  providerOrderId: string;

  @Prop()
  providerResponse: string;

  @Prop()
  completedAt: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);