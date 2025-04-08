import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Company extends Document {
  @Prop({ required: true })
  companyName: string;

  @Prop()
  tradeName?: string;

  @Prop({ required: true })
  companyAddress: string;

  @Prop({ required: true })
  postalCity: string;

  @Prop({ required: true })
  country: string;

  @Prop({ required: true })
  sector: string;

  @Prop({ required: true })
  subsector: string;

  @Prop({ required: true })
  registrationNumber: string;

  @Prop()
  companySize?: string;

  @Prop()
  website?: string;

  @Prop({ required: true })
  contactPhone: string;

  @Prop({ required: true })
  contactPhoneCode: string;

  @Prop()
  companyDescription?: string;

  @Prop()
  kbisDocumentPath?: string;

  @Prop()
  companyLogoPath?: string;

  @Prop()
  insuranceCertificatePath?: string;
}

export const CompanySchema = SchemaFactory.createForClass(Company);