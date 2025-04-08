// src/equipment/entities/equipment.entity.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { User } from '../../user/entities/user.entity';
import { Event } from '../../event/entities/event.entity';

@Schema({ timestamps: true })
export class Equipment extends Document {
  @Prop({ required: true })
  name: string;
  
  @Prop({ required: true })
  description: string;
  
  @Prop({ 
    required: true, 
    type: MongooseSchema.Types.Number, 
    min: 0,
    description: 'Price in USD currency as float with up to 3 decimal places'
  })
  price: number;
  
  @Prop({ required: true })
  unit: string;  // Per hour, day, event, etc.
  
  @Prop({ required: true, type: MongooseSchema.Types.Number, min: 0 })
  quantity: number;
  
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  organizer: User;
  
  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Event' }] })
  events: Event[];
  
  @Prop({ default: true })
  isAvailable: boolean;
  
  @Prop()
  category: string;  // Lighting, audio, stand, furniture, etc.
  
  @Prop({ type: MongooseSchema.Types.Mixed })
  specifications: Record<string, any>;  // Technical specifications (JSON)
  
  @Prop()
  imageUrl: string;  // URL of the equipment image
}

export const EquipmentSchema = SchemaFactory.createForClass(Equipment);