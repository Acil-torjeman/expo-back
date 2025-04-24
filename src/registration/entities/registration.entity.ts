// src/registration/entities/registration.entity.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from '../../user/entities/user.entity';
import { Event } from '../../event/entities/event.entity';
import { Exhibitor } from '../../exhibitor/entities/exhibitor.entity';
import { Stand } from '../../stand/entities/stand.entity';
import { Equipment } from '../../equipment/entities/equipment.entity';

export enum RegistrationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

@Schema({ timestamps: true })
export class Registration extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Exhibitor', required: true })
  exhibitor: Exhibitor;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Event', required: true })
  event: Event;

  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Stand' }] })
  stands: Stand[];

  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Equipment' }] })
  equipment: Equipment[];

  @Prop({ required: true, default: RegistrationStatus.PENDING })
  status: RegistrationStatus;

  @Prop()
  participationNote: string;

  @Prop()
  rejectionReason: string;

  @Prop()
  approvalDate: Date;

  @Prop()
  rejectionDate: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  reviewedBy: User;

  @Prop({ default: false })
  standSelectionCompleted: boolean;

  @Prop({ default: false })
  equipmentSelectionCompleted: boolean;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>; // For any additional data

  @Prop([{
    equipment: { type: MongooseSchema.Types.ObjectId, ref: 'Equipment' },
    quantity: { type: Number, default: 1, min: 1 }
  }])
  equipmentQuantities: Array<{
    equipment: Equipment | Types.ObjectId;
    quantity: number;
  }>;
}

export const RegistrationSchema = SchemaFactory.createForClass(Registration);