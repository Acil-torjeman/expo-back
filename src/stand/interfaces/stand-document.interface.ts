import { Document } from 'mongoose';
import { Stand } from '../entities/stand.entity';
export interface StandDocument extends Stand, Document {
  createdAt: Date;
  updatedAt: Date;
}