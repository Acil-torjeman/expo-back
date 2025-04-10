// src/event/entities/event.entity.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { User } from '../../user/entities/user.entity';
import { Plan } from '../../plan/entities/plan.entity';

export class Location {
  address: string;
  city: string;
  postalCode: string;
  country: string;
}

export enum EventStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed'
}

export enum EventVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private'
}

@Schema({ timestamps: true })
export class Event extends Document {
  @Prop({ required: true })
  name: string;
  
  @Prop({ required: true })
  type: string;
  
  @Prop({ required: true })
  description: string;
  
  @Prop()
  imagePath: string;
  
  @Prop({ required: true, type: Date })
  startDate: Date;
  
  @Prop({ required: true, type: Date })
  endDate: Date;
  
  @Prop({ required: true })
  openingHours: string;
  
  @Prop({ required: true, type: Object })
  location: Location;
  
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  organizer: User;
  
  @Prop({ type: [String], required: true })
  allowedSectors: string[];
  
  @Prop({ type: [String], required: true })
  allowedSubsectors: string[];
  

  
  @Prop()
  maxExhibitors: number;
  
  @Prop({ required: true, type: Date })
  registrationDeadline: Date;
  
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Plan' })
  plan: Plan;
  
  @Prop({ 
    type: Object, 
    default: {},
    description: 'Pricing in USD currency for each stand'
  })
  standPricing: Record<string, number>;
  
  @Prop({ 
    type: Object, 
    default: {},
    description: 'Pricing in USD currency for each equipment'
  })
  equipmentPricing: Record<string, number>;
  
  @Prop({ 
    type: String, 
    enum: Object.values(EventStatus),
    default: EventStatus.DRAFT
  })
  status: string;
  @Prop()
  statusReason: string;
  
  @Prop({ 
    type: String, 
    enum: Object.values(EventVisibility),
    default: EventVisibility.PUBLIC
  })
  visibility: string;
  
  @Prop()
  specialConditions: string;
  
  @Prop({ default: 0 })
  registrationsCount: number;

  // Add equipmentIds as a virtual property (not stored in DB)
  equipmentIds?: string[];
}

export const EventSchema = SchemaFactory.createForClass(Event);