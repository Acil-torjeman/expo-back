// src/plan/entities/plan.entity.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { User } from '../../user/entities/user.entity';
import { Event } from '../../event/entities/event.entity';

@Schema({ timestamps: true })
export class Plan extends Document {
  @Prop({ required: true })
  name: string;
  
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  organizer: User;
  
  @Prop({ required: true })
  pdfPath: string;
  
  @Prop()
  description: string;
  
  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Event' }] })
  events: Event[];
  
  @Prop({ default: false })  
  isActive: boolean;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);