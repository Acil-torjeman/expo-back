// src/payment/dto/payment-response.dto.ts
import { PaymentStatus } from '../entities/payment.entity';

export class PaymentResponseDto {
  id: string;
  invoiceId: string;
  status: PaymentStatus;
  amount: number;
  paymentUrl?: string;
  providerId?: string;
  message?: string;
}