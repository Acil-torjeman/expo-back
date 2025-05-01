// src/analytics/entities/analytics.entity.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Organizer } from '../../organizer/entities/organizer.entity';
import { Event } from '../../event/entities/event.entity';

@Schema({ timestamps: true })
export class Analytics extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organizer', required: true })
  organizer: Organizer;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Event', required: false })
  event: Event;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ type: Number, default: 0 })
  averageRegistrationProcessingTime: number; // in hours

  @Prop({ type: Number, default: 0 })
  averagePaymentTime: number; // in hours

  @Prop({ type: Number, default: 0 })
  manualRemindersSent: number;

  @Prop({ type: Number, default: 0 })
  exhibitorsValidatedBeforeDeadline: number;

  @Prop({ type: Number, default: 0 })
  totalExhibitors: number;

  @Prop({ type: Number, default: 0 })
  standsReservedBeforeEvent: number;

  @Prop({ type: Number, default: 0 })
  totalStands: number;

  @Prop({ type: Number, default: 0 })
  pendingRegistrations: number;

  @Prop({ type: Number, default: 0 })
  occupiedStands: number;

  @Prop({ type: Number, default: 0 })
  availableStands: number;
}

export const AnalyticsSchema = SchemaFactory.createForClass(Analytics);