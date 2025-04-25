// src/payment/dto/payment-webhook.dto.ts
import { IsNotEmpty, IsString, IsOptional, IsObject } from 'class-validator';

export class PaymentWebhookDto {
  @IsNotEmpty()
  @IsString()
  event_type: string;

  @IsNotEmpty()
  @IsObject()
  resource: any;

  @IsOptional()
  @IsString()
  summary?: string;
}