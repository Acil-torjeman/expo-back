import { Document } from 'mongoose';
import { Invoice } from '../entities/invoice.entity';

export interface InvoiceDocument extends Invoice, Document {
  createdAt: Date;
  updatedAt: Date;
}
