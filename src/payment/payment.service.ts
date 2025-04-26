import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as querystring from 'querystring';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Invoice, InvoiceStatus } from '../invoice/entities/invoice.entity';
import { User } from '../user/entities/user.entity';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    @InjectModel(Invoice.name) private invoiceModel: Model<Invoice>,
    @InjectModel(User.name) private userModel: Model<User>,
    private configService: ConfigService,
  ) {}

  /**
   * Create a new payment for an invoice
   */
  async create(createPaymentDto: CreatePaymentDto, userId: string): Promise<any> {
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
      
      // Create simple payment in database
      const payment = new this.paymentModel({
        invoice: new Types.ObjectId(createPaymentDto.invoiceId),
        user: new Types.ObjectId(userId),
        amount: invoice.total,
        status: PaymentStatus.PENDING,
        provider: 'paypal'
      });
      
      const savedPayment = await payment.save();
      
      // Get PayPal credentials
      const clientId = this.configService.get<string>('paypal.clientId');
      const clientSecret = this.configService.get<string>('paypal.clientSecret');
      const mode = this.configService.get<string>('paypal.mode') || 'sandbox';
      
      this.logger.log(`Using PayPal in ${mode} mode`);
      
      // Create basic auth for PayPal
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      
      // Get access token
      const tokenUrl = mode === 'live' 
        ? 'https://api.paypal.com/v1/oauth2/token'
        : 'https://api.sandbox.paypal.com/v1/oauth2/token';
      
      this.logger.log(`Requesting PayPal token from: ${tokenUrl}`);
      
      const tokenResponse = await axios.post(
        tokenUrl,
        'grant_type=client_credentials',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${auth}`
          }
        }
      );
      
      const accessToken = tokenResponse.data.access_token;
      this.logger.log('PayPal token obtained successfully');
      
      // Create payment order
      const orderUrl = mode === 'live'
        ? 'https://api.paypal.com/v2/checkout/orders'
        : 'https://api.sandbox.paypal.com/v2/checkout/orders';
      
      // Set URLs
      const returnUrl = createPaymentDto.returnUrl || 'http://localhost:5174/exhibitor/payments/success';
      const cancelUrl = createPaymentDto.cancelUrl || 'http://localhost:5174/exhibitor/payments/cancel';
      
      // Create order with minimal data
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: savedPayment._id.toString(),
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
          return_url: returnUrl,
          cancel_url: cancelUrl
        }
      };
      
      this.logger.log(`Creating PayPal order at: ${orderUrl}`);
      
      const orderResponse = await axios.post(orderUrl, orderData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      this.logger.log(`PayPal order created: ${JSON.stringify(orderResponse.data)}`);
      
      // Extract approval URL
      const links = orderResponse.data.links;
      const approvalLink = links.find(link => link.rel === 'approve');
      
      if (!approvalLink) {
        throw new Error('No approval link found in PayPal response');
      }
      
      // Update payment with PayPal info
      savedPayment.providerOrderId = orderResponse.data.id;
      savedPayment.providerResponse = JSON.stringify(orderResponse.data);
      await savedPayment.save();
      
      // Return response with PayPal URL
      return {
        id: savedPayment._id.toString(),
        invoiceId: invoice._id.toString(),
        status: PaymentStatus.PENDING,
        amount: invoice.total,
        paymentUrl: approvalLink.href,
        providerId: orderResponse.data.id
      };
      
    } catch (error) {
      this.logger.error(`Error creating payment: ${error.message}`);
      
      if (error.response) {
        this.logger.error(`API Error: ${JSON.stringify(error.response.data || {})}`);
      }
      
      throw error;
    }
  }

  /**
   * Capture a PayPal payment
   */
  async capturePayment(orderId: string): Promise<any> {
    try {
      this.logger.log(`Capturing PayPal payment for order ${orderId}`);
      
      // Find the payment
      const payment = await this.paymentModel.findOne({ providerOrderId: orderId }).exec();
      
      if (!payment) {
        throw new NotFoundException(`Payment with order ID ${orderId} not found`);
      }
      
      // Get PayPal credentials
      const clientId = this.configService.get<string>('paypal.clientId');
      const clientSecret = this.configService.get<string>('paypal.clientSecret');
      const mode = this.configService.get<string>('paypal.mode') || 'sandbox';
      
      // Create basic auth for PayPal
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      
      // Get access token
      const tokenUrl = mode === 'live' 
        ? 'https://api.paypal.com/v1/oauth2/token'
        : 'https://api.sandbox.paypal.com/v1/oauth2/token';
      
      const tokenResponse = await axios.post(
        tokenUrl,
        'grant_type=client_credentials',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${auth}`
          }
        }
      );
      
      const accessToken = tokenResponse.data.access_token;
      
      // Capture payment
      const captureUrl = mode === 'live'
        ? `https://api.paypal.com/v2/checkout/orders/${orderId}/capture`
        : `https://api.sandbox.paypal.com/v2/checkout/orders/${orderId}/capture`;
      
      const captureResponse = await axios.post(captureUrl, {}, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      // Update payment status
      payment.status = PaymentStatus.COMPLETED;
      payment.completedAt = new Date();
      payment.providerResponse = JSON.stringify(captureResponse.data);
      await payment.save();
      
      // Update invoice status
      if (payment.invoice) {
        const invoice = await this.invoiceModel.findById(payment.invoice).exec();
        if (invoice) {
          invoice.status = InvoiceStatus.PAID;
          await invoice.save();
        }
      }
      
      return { 
        success: true, 
        invoiceId: payment.invoice.toString(),
        paymentId: payment._id.toString() 
      };
    } catch (error) {
      this.logger.error(`Error capturing payment: ${error.message}`);
      
      if (error.response) {
        this.logger.error(`API Error: ${JSON.stringify(error.response.data || {})}`);
      }
      
      throw error;
    }
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
   * Find all payments
   */
  async findAll(): Promise<Payment[]> {
    return this.paymentModel.find()
      .populate('invoice')
      .populate('user', 'email username')
      .sort({ createdAt: -1 })
      .exec();
  }
}