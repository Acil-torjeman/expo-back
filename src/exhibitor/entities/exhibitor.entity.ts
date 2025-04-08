import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { User } from '../../user/entities/user.entity';
import { Company } from '../../company/entities/company.entity';

@Schema({ timestamps: true })
export class Exhibitor extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: User;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Company', required: true })
  company: Company;

  @Prop({ required: true })
  representativeFunction: string;

  @Prop({ required: true })
  personalPhone: string;

  @Prop({ required: true })
  personalPhoneCode: string;

  @Prop({ required: true, default: true })
  consent: boolean;

  @Prop({ required: true, default: true })
  dataConsent: boolean;
}

export const ExhibitorSchema = SchemaFactory.createForClass(Exhibitor);