import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { User } from '../../user/entities/user.entity';

@Schema({ timestamps: true })
export class Organizer extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: User;

  @Prop({ required: true })
  organizationName: string;

  @Prop({ required: true })
  organizationAddress: string;

  @Prop({ required: true })
  postalCity: string;

  @Prop({ required: true })
  country: string;

  @Prop({ required: true })
  contactPhone: string;

  @Prop({ required: true })
  contactPhoneCode: string;

  @Prop()
  website?: string;

  @Prop()
  organizationDescription?: string;

  @Prop()
  organizationLogoPath?: string;

  @Prop({ required: true, default: true })
  consent: boolean;

  @Prop({ required: true, default: true })
  dataConsent: boolean;
}

export const OrganizerSchema = SchemaFactory.createForClass(Organizer);