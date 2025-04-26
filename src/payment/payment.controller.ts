import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  UseGuards, 
  Req, 
  Headers,
  Logger,
  HttpStatus,
  HttpCode,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Query,
  RawBodyRequest,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { IsPublic } from '../auth/decorators/public.decorator';
import { UserRole } from '../user/entities/user.entity';

@Controller('payments')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createPaymentDto: CreatePaymentDto, @Req() req) {
    this.logger.log(`Creating payment for invoice ${createPaymentDto.invoiceId}`);
    try {
      return await this.paymentService.create(createPaymentDto, req.user.id);
    } catch (error) {
      this.logger.error(`Error creating payment: ${error.message}`, error.stack);
      
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to create payment');
    }
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async findAll() {
    this.logger.log('Getting all payments');
    return this.paymentService.findAll();
  }

  @Get('my-payments')
  @UseGuards(JwtAuthGuard)
  async findMyPayments(@Req() req) {
    this.logger.log(`Getting payments for user ${req.user.id}`);
    return this.paymentService.findByUser(req.user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    this.logger.log(`Getting payment with ID: ${id}`);
    return this.paymentService.findOne(id);
  }

  @Post('webhook')
  @IsPublic()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Req() req: RawBodyRequest<any>, @Headers('stripe-signature') signature: string) {
    this.logger.log('Received Stripe webhook');
    try {
      const payload = req.rawBody || JSON.stringify(req.body);
      await this.paymentService.handleWebhook(payload, signature);
      return { received: true };
    } catch (error) {
      this.logger.error(`Error processing webhook: ${error.message}`, error.stack);
      return { received: false, error: error.message };
    }
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  async checkPaymentStatus(@Query('session_id') sessionId: string) {
    this.logger.log(`Checking payment status for session ID: ${sessionId}`);
    try {
      const result = await this.paymentService.checkPaymentStatus(sessionId);
      return {
        success: result.success,
        paymentId: result.paymentId,
        invoiceId: result.invoiceId,
        message: result.message,
      };
    } catch (error) {
      this.logger.error(`Error checking payment status: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to check payment status');
    }
  }
}