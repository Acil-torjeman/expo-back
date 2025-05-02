import { Document } from 'mongoose';
import { Registration } from '../entities/registration.entity';

export interface RegistrationDocument extends Registration, Document {
  createdAt: Date;
  updatedAt: Date;
}