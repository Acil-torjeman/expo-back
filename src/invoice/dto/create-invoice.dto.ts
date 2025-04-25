// src/invoice/dto/create-invoice.dto.ts
import { IsNotEmpty, IsString, IsMongoId, IsNumber, IsArray, IsEnum, IsOptional, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceStatus } from '../entities/invoice.entity';

export class InvoiceItemDto {
  @IsNotEmpty()
  @IsString()
  type: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  price: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  quantity: number;
}

export class CreateInvoiceDto {
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsNotEmpty()
  @IsMongoId({ message: 'Registration ID must be a valid MongoDB ID' })
  registration: string;

  @IsNotEmpty()
  @IsMongoId({ message: 'Exhibitor ID must be a valid MongoDB ID' })
  exhibitor: string;

  @IsNotEmpty()
  @IsMongoId({ message: 'Organizer ID must be a valid MongoDB ID' })
  organizer: string;

  @IsNotEmpty()
  @IsMongoId({ message: 'Event ID must be a valid MongoDB ID' })
  event: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  subtotal: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(1)
  taxRate: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  taxAmount: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  total: number;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;
}