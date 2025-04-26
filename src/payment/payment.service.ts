// src/payment/payment.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Invoice, InvoiceStatus } from '../invoice/entities/invoice.entity';
import { User } from '../user/entities/user.entity';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private stripe: Stripe;

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    @InjectModel(Invoice.name) private invoiceModel: Model<Invoice>,
    @InjectModel(User.name) private userModel: Model<User>,
    private configService: ConfigService,
  ) {
    try {
      const stripeSecretKey = this.configService.get<string>('stripe.secretKey');
      if (!stripeSecretKey) {
        this.logger.error('Stripe secret key is not defined');
        throw new Error('Stripe secret key is required');
      }
      this.stripe = new Stripe(stripeSecretKey, {
        apiVersion: '2025-03-31.basil',
      });
      this.logger.log('Stripe initialized successfully');
    } catch (error) {
      this.logger.error(`Error initializing Stripe: ${error.message}`);
    }
  }

  /**
   * Create a new payment for an invoice
   */
  async create(createPaymentDto: CreatePaymentDto, userId: string): Promise<any> {
    this.logger.log(`Creating payment for invoice ${createPaymentDto.invoiceId} by user ${userId}`);
    
    try {
      // Verify Stripe is initialized
      if (!this.stripe) {
        throw new InternalServerErrorException('Payment service not properly initialized');
      }
      
      // Find the invoice
      const invoice = await this.invoiceModel.findById(createPaymentDto.invoiceId).exec();
      if (!invoice) {
        throw new NotFoundException(`Invoice with ID ${createPaymentDto.invoiceId} not found`);
      }
      
      this.logger.log(`Found invoice: ${invoice.invoiceNumber} with total: ${invoice.total}`);
      
      // Check if invoice is already paid
      if (invoice.status === InvoiceStatus.PAID) {
        throw new BadRequestException('This invoice has already been paid');
      }
      
      // Create payment in database
      const payment = new this.paymentModel({
        invoice: new Types.ObjectId(createPaymentDto.invoiceId),
        user: new Types.ObjectId(userId),
        amount: invoice.total,
        status: PaymentStatus.PENDING,
        provider: 'stripe'
      });
      
      const savedPayment = await payment.save();
      
      if (!savedPayment || !savedPayment._id) {
        throw new InternalServerErrorException('Failed to create payment record');
      }
      
      const paymentId = savedPayment._id.toString();
      // Fix the type issue by explicitly converting invoice._id to string
      const invoiceId = invoice._id ? invoice._id.toString() : createPaymentDto.invoiceId;
      
      this.logger.log(`Created payment record with ID: ${paymentId}`);
      
      // Get success and cancel URLs
      const successUrl = createPaymentDto.returnUrl || 
        this.configService.get<string>('stripe.successUrl') || 
        'http://localhost:5174/exhibitor/payments/success';
      
      const cancelUrl = createPaymentDto.cancelUrl || 
        this.configService.get<string>('stripe.cancelUrl') || 
        'http://localhost:5174/exhibitor/payments/cancel';
      
      this.logger.log(`Creating Stripe session with return URLs: ${successUrl}, ${cancelUrl}`);
      
      // Create a Stripe checkout session with proper error handling
      try {
        const lineItems = [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Invoice #${invoice.invoiceNumber}`,
                description: `Payment for event: ${invoice.event?.name || 'Exhibition event'}`,
              },
              unit_amount: Math.round(invoice.total * 100), // Stripe needs amount in cents
            },
            quantity: 1,
          },
        ];
        
        this.logger.log(`Creating checkout session with line items: ${JSON.stringify(lineItems)}`);
        
        const session = await this.stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: lineItems,
          mode: 'payment',
          success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: cancelUrl,
          client_reference_id: paymentId,
          metadata: {
            invoiceId: invoiceId,
            paymentId: paymentId,
          },
        });
        
        this.logger.log(`Stripe session created with ID: ${session.id}`);
        
        // Update payment with Stripe info
        savedPayment.providerId = session.id;
        savedPayment.providerResponse = JSON.stringify(session);
        await savedPayment.save();
        
        // Return response with Stripe URL
        return {
          id: paymentId,
          invoiceId: invoiceId,
          status: PaymentStatus.PENDING,
          amount: invoice.total,
          paymentUrl: session.url,
          providerId: session.id
        };
      } catch (stripeError) {
        // Handle Stripe API errors
        this.logger.error(`Stripe error: ${stripeError.message}`);
        
        // Clean up the payment record since the Stripe session failed
        await this.paymentModel.findByIdAndDelete(savedPayment._id);
        
        throw new InternalServerErrorException(`Payment processing error: ${stripeError.message}`);
      }
    } catch (error) {
      this.logger.error(`Error creating payment: ${error.message}`);
      throw error;
    }
  }


  /**
   * Check payment status
   */
  async checkPaymentStatus(sessionId: string): Promise<any> {
    try {
      this.logger.log(`Checking Stripe payment status for session ${sessionId}`);
      
      // Find the payment
      const payment = await this.paymentModel.findOne({ providerId: sessionId }).exec();
      
      if (!payment) {
        throw new NotFoundException(`Payment with session ID ${sessionId} not found`);
      }
      
      // Get session from Stripe
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      
      // Check if payment is successful
      if (session.payment_status === 'paid') {
        // Update payment status
        payment.status = PaymentStatus.COMPLETED;
        payment.completedAt = new Date();
        payment.providerResponse = JSON.stringify(session);
        await payment.save();
        
        // Update invoice status
        if (payment.invoice) {
          const invoice = await this.invoiceModel.findById(payment.invoice).exec();
          if (invoice) {
            invoice.status = InvoiceStatus.PAID;
            await invoice.save();
          }
        }
        
        const paymentId = payment._id ? payment._id.toString() : '';
        const invoiceId = payment.invoice ? payment.invoice.toString() : '';
        
        return { 
          success: true, 
          invoiceId: invoiceId,
          paymentId: paymentId 
        };
      }
      
      return { 
        success: false,
        message: 'Payment not completed yet',
      };
    } catch (error) {
      this.logger.error(`Error checking payment status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle Stripe webhook
   */
  async handleWebhook(payload: any, signature: string): Promise<any> {
    try {
      const webhookSecret = this.configService.get<string>('stripe.webhookSecret');
      let event;
      
      // Verify webhook signature
      if (webhookSecret) {
        event = this.stripe.webhooks.constructEvent(
          payload,
          signature,
          webhookSecret
        );
      } else {
        // For testing, parse the payload directly
        event = JSON.parse(payload);
      }
      
      this.logger.log(`Received Stripe webhook: ${event.type}`);
      
      // Handle checkout.session.completed event
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        
        // Find the payment
        const payment = await this.paymentModel.findOne({ providerId: session.id }).exec();
        
        if (payment) {
          // Update payment status
          payment.status = PaymentStatus.COMPLETED;
          payment.completedAt = new Date();
          payment.providerResponse = JSON.stringify(session);
          await payment.save();
          
          // Update invoice status
          if (payment.invoice) {
            const invoice = await this.invoiceModel.findById(payment.invoice).exec();
            if (invoice) {
              invoice.status = InvoiceStatus.PAID;
              await invoice.save();
            }
          }
        }
      }
      
      return { received: true };
    } catch (error) {
      this.logger.error(`Error handling webhook: ${error.message}`);
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