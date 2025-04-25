// src/payment/payment.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as querystring from 'querystring';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { Invoice, InvoiceStatus } from '../invoice/entities/invoice.entity';
import { User } from '../user/entities/user.entity';

// PayPal API response interfaces
interface PayPalOrderResponse {
  id: string;
  status: string;
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

interface PayPalTokenResponse {
  access_token: string;
  expires_in: number;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private paypalAccessToken: string;
  private tokenExpiry: Date = new Date();

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    @InjectModel(Invoice.name) private invoiceModel: Model<Invoice>,
    @InjectModel(User.name) private userModel: Model<User>,
    private configService: ConfigService,
  ) {}

  /**
   * Create a new payment for an invoice
   */
  async create(createPaymentDto: CreatePaymentDto, userId: string): Promise<PaymentResponseDto> {
    this.logger.log(`Creating payment for invoice ${createPaymentDto.invoiceId} by user ${userId}`);
    
    try {
      // Find the invoice
      const invoice = await this.invoiceModel.findById(createPaymentDto.invoiceId).exec();
      if (!invoice) {
        throw new NotFoundException(`Invoice with ID ${createPaymentDto.invoiceId} not found`);
      }
      
      // Check if invoice is already paid
      if (invoice.status === InvoiceStatus.PAID) {
        throw new BadRequestException('This invoice has already been paid');
      }
      
      // Check if there's already a pending payment
      const existingPayment = await this.paymentModel.findOne({
        invoice: new Types.ObjectId(createPaymentDto.invoiceId),
        status: PaymentStatus.PENDING
      }).exec();
      
      if (existingPayment) {
        // Return the existing payment info
        return this.formatPaymentResponse(existingPayment);
      }
      
      // Create a new payment in our database
      const payment = new this.paymentModel({
        invoice: new Types.ObjectId(createPaymentDto.invoiceId),
        user: new Types.ObjectId(userId),
        amount: invoice.total,
        status: PaymentStatus.PENDING,
        provider: 'paypal'
      });
      
      const savedPayment = await payment.save();
      const paymentId = savedPayment._id ? (savedPayment._id as Types.ObjectId).toString() : '';
      
      // Create PayPal order
      const paypalOrder = await this.createPayPalOrder(
        paymentId,
        invoice,
        createPaymentDto.returnUrl,
        createPaymentDto.cancelUrl
      );
      
      // Update payment with PayPal info
      savedPayment.providerOrderId = paypalOrder.id;
      savedPayment.providerResponse = JSON.stringify(paypalOrder);
      await savedPayment.save();
      
      // Return formatted response with PayPal approval URL
      return {
        id: paymentId,
        invoiceId: invoice._id ? (invoice._id as Types.ObjectId).toString() : '',
        status: savedPayment.status,
        amount: savedPayment.amount,
        paymentUrl: this.findApprovalUrl(paypalOrder),
        providerId: paypalOrder.id
      };
    } catch (error) {
      this.logger.error(`Error creating payment: ${error.message}`, error.stack);
      
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to create payment');
    }
  }

  /**
   * Create a PayPal order for a payment
   */
  private async createPayPalOrder(
    paymentId: string, 
    invoice: Invoice, 
    returnUrl?: string, 
    cancelUrl?: string
  ): Promise<PayPalOrderResponse> {
    try {
      // Ensure we have a valid token
      await this.getPayPalAccessToken();
      
      // Get invoice details for the order description
      const invoiceNumber = invoice.invoiceNumber || 'Unknown';
      
      // Set default URLs if not provided
      const defaultReturnUrl = this.configService.get<string>('paypal.returnUrl');
      const defaultCancelUrl = this.configService.get<string>('paypal.cancelUrl');
      
      // Prepare PayPal order
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: paymentId,
            description: `Payment for invoice ${invoiceNumber}`,
            invoice_id: invoiceNumber,
            amount: {
              currency_code: 'USD',
              value: invoice.total.toFixed(2)
            }
          }
        ],
        application_context: {
          brand_name: 'ExpoManagement',
          landing_page: 'BILLING',
          user_action: 'PAY_NOW',
          return_url: returnUrl || defaultReturnUrl,
          cancel_url: cancelUrl || defaultCancelUrl
        }
      };
      
      const apiUrl = this.getPayPalApiUrl('/v2/checkout/orders');
      
      const response = await axios.post(apiUrl, orderData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.paypalAccessToken}`
        }
      });
      
      return response.data as PayPalOrderResponse;
    } catch (error) {
      this.logger.error(`Error creating PayPal order: ${error.message}`, error.response?.data || error.stack);
      throw new InternalServerErrorException('Failed to create PayPal payment');
    }
  }

  /**
   * Find the approval URL from PayPal order links
   */
  private findApprovalUrl(paypalOrder: PayPalOrderResponse): string {
    if (!paypalOrder.links || !Array.isArray(paypalOrder.links)) {
      return '';
    }
    
    const approvalLink = paypalOrder.links.find(link => link.rel === 'approve');
    return approvalLink ? approvalLink.href : '';
  }

  /**
   * Get a PayPal access token
   */
  private async getPayPalAccessToken(): Promise<string> {
    // Check if we have a valid token already
    if (this.paypalAccessToken && this.tokenExpiry > new Date()) {
      return this.paypalAccessToken;
    }
    
    try {
      const clientId = this.configService.get<string>('paypal.clientId');
      const clientSecret = this.configService.get<string>('paypal.clientSecret');
      
      if (!clientId || !clientSecret) {
        throw new Error('PayPal clientId or clientSecret is not configured');
      }
      
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const tokenUrl = this.getPayPalApiUrl('/v1/oauth2/token');
      
      const response = await axios.post(
        tokenUrl,
        querystring.stringify({ grant_type: 'client_credentials' }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${auth}`
          }
        }
      );
      
      const tokenData = response.data as PayPalTokenResponse;
      this.paypalAccessToken = tokenData.access_token;
      this.tokenExpiry = new Date(Date.now() + (tokenData.expires_in * 1000 - 60000)); // Subtract 1 minute for safety
      
      return this.paypalAccessToken;
    } catch (error) {
      this.logger.error(`Failed to get PayPal access token: ${error.message}`, error.response?.data || error.stack);
      throw new InternalServerErrorException('Failed to authenticate with PayPal');
    }
  }

  /**
   * Get PayPal API URL based on mode (sandbox/live)
   */
  private getPayPalApiUrl(endpoint: string): string {
    const mode = this.configService.get<string>('paypal.mode') || 'sandbox';
    const baseUrl = mode === 'live' 
      ? 'https://api.paypal.com' 
      : 'https://api.sandbox.paypal.com';
    
    return `${baseUrl}${endpoint}`;
  }

  /**
   * Capture a PayPal payment
   */
  async capturePayment(orderId: string): Promise<Payment> {
    try {
      this.logger.log(`Capturing PayPal payment for order ${orderId}`);
      
      // Find the payment with this order ID
      const payment = await this.paymentModel.findOne({ providerOrderId: orderId }).exec();
      
      if (!payment) {
        throw new NotFoundException(`Payment with order ID ${orderId} not found`);
      }
      
      // Get access token for PayPal API
      await this.getPayPalAccessToken();
      
      // Capture the payment
      const captureUrl = this.getPayPalApiUrl(`/v2/checkout/orders/${orderId}/capture`);
      const response = await axios.post(captureUrl, {}, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.paypalAccessToken}`
        }
      });
      
      const captureData = response.data as PayPalOrderResponse;
      
      // Check if capture was successful
      if (captureData.status === 'COMPLETED') {
        // Update payment status
        payment.status = PaymentStatus.COMPLETED;
        payment.completedAt = new Date();
        payment.providerResponse = JSON.stringify(captureData);
        
        // Save the updated payment
        await payment.save();
        
        // Update invoice status
        if (payment.invoice) {
          await this.updateInvoiceStatus(
            (payment.invoice as unknown as Types.ObjectId).toString(), 
            InvoiceStatus.PAID
          );
        }
        
        return payment;
      } else {
        throw new Error(`PayPal capture returned status: ${captureData.status}`);
      }
    } catch (error) {
      this.logger.error(`Error capturing payment: ${error.message}`, error.response?.data || error.stack);
      throw new InternalServerErrorException('Failed to capture payment');
    }
  }

  /**
   * Format payment response
   */
  private formatPaymentResponse(payment: Payment): PaymentResponseDto {
    let paypalOrderData: PayPalOrderResponse | null = null;
    
    try {
      if (payment.providerResponse) {
        paypalOrderData = JSON.parse(payment.providerResponse);
      }
    } catch (e) {
      this.logger.error(`Error parsing provider response: ${e.message}`);
    }
    
    return {
      id: payment._id ? (payment._id as Types.ObjectId).toString() : '',
      invoiceId: payment.invoice ? (payment.invoice as unknown as Types.ObjectId).toString() : '',
      status: payment.status,
      amount: payment.amount,
      paymentUrl: paypalOrderData ? this.findApprovalUrl(paypalOrderData) : undefined,
      providerId: payment.providerOrderId,
    };
  }

  /**
   * Update an invoice status
   */
  private async updateInvoiceStatus(invoiceId: string, status: InvoiceStatus): Promise<void> {
    try {
      const invoice = await this.invoiceModel.findById(invoiceId).exec();
      
      if (!invoice) {
        throw new NotFoundException(`Invoice with ID ${invoiceId} not found`);
      }
      
      invoice.status = status;
      await invoice.save();
      
      this.logger.log(`Updated invoice ${invoiceId} status to ${status}`);
    } catch (error) {
      this.logger.error(`Error updating invoice status: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Find all payments
   */
  async findAll(): Promise<Payment[]> {
    return this.paymentModel.find()
      .populate('invoice')
      .populate('user', 'email username')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find payments by user ID
   */
  async findByUser(userId: string): Promise<Payment[]> {
    return this.paymentModel.find({ user: new Types.ObjectId(userId) })
      .populate('invoice')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find one payment
   */
  async findOne(id: string): Promise<Payment> {
    const payment = await this.paymentModel.findById(id)
      .populate('invoice')
      .populate('user', 'email username')
      .exec();
    
    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found`);
    }
    
    return payment;
  }

  /**
   * Handle PayPal webhook events
   */
  async handleWebhook(payload: any): Promise<void> {
    this.logger.log(`Received PayPal webhook event: ${payload.event_type}`);
    
    try {
      // Process different event types
      if (payload.event_type === 'CHECKOUT.ORDER.APPROVED') {
        const orderId = payload.resource?.id;
        if (orderId) {
          await this.capturePayment(orderId);
        }
      } else if (payload.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
        const orderId = payload.resource?.supplementary_data?.related_ids?.order_id;
        if (orderId) {
          // Find payment by order ID
          const payment = await this.paymentModel.findOne({ providerOrderId: orderId }).exec();
          
          if (payment && payment.status !== PaymentStatus.COMPLETED) {
            payment.status = PaymentStatus.COMPLETED;
            payment.completedAt = new Date();
            payment.providerResponse = JSON.stringify(payload);
            await payment.save();
            
            // Update invoice status
            if (payment.invoice) {
              await this.updateInvoiceStatus(
                (payment.invoice as unknown as Types.ObjectId).toString(), 
                InvoiceStatus.PAID
              );
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error processing PayPal webhook: ${error.message}`, error.stack);
      // We don't rethrow here to avoid PayPal retrying the webhook
    }
  }
}