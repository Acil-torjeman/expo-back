// src/payment/dto/create-payment.dto.ts
import { IsNotEmpty, IsMongoId, IsNumber, Min, IsOptional, IsString } from 'class-validator';

export class CreatePaymentDto {
  @IsNotEmpty()
  @IsMongoId({ message: 'Invoice ID must be a valid MongoDB ID' })
  invoiceId: string;

  @IsOptional()
  @IsString()
  returnUrl?: string;

  @IsOptional()
  @IsString()
  cancelUrl?: string;
}