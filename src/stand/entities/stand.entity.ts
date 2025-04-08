// src/stand/entities/stand.entity.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Plan } from '../../plan/entities/plan.entity';

/**
 * Possible statuses for a stand
 */
export enum StandStatus {
  AVAILABLE = 'available',     // Stand is available for booking
  RESERVED = 'reserved',       // Stand is reserved by an exhibitor
  UNAVAILABLE = 'unavailable'  // Stand is not available for booking
}

/**
 * Types of stands
 */
export enum StandType {
  STANDARD = 'standard',
  PREMIUM = 'premium',
  CORNER = 'corner',
  CUSTOM = 'custom'
}

@Schema({ timestamps: true })
export class Stand extends Document {
  @Prop({ required: true })
  number: string;
  
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Plan' })
  plan: Plan;
  
  @Prop({ required: true, type: MongooseSchema.Types.Number, min: 0 })
  area: number;
  
  @Prop({ 
    required: true, 
    type: MongooseSchema.Types.Number, 
    min: 0,
    description: 'Price in USD currency'
  })
  basePrice: number;
  
  @Prop({ 
    required: true, 
    type: String, 
    enum: Object.values(StandType),
    default: StandType.STANDARD
  })
  type: string;
  
  @Prop({ 
    type: String, 
    enum: Object.values(StandStatus),
    default: StandStatus.AVAILABLE
  })
  status: string;
  
  @Prop()
  description: string;
  
  @Prop([String])
  features: string[];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Event' })
  eventId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  exhibitorId: MongooseSchema.Types.ObjectId;
}

export const StandSchema = SchemaFactory.createForClass(Stand);

// Create a compound index on plan and number to ensure uniqueness
StandSchema.index({ plan: 1, number: 1 }, { unique: true });