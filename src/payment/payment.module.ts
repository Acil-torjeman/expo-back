import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { Payment, PaymentSchema } from './entities/payment.entity';
import { Invoice, InvoiceSchema } from '../invoice/entities/invoice.entity';
import { User, UserSchema } from '../user/entities/user.entity';
import stripeConfig from 'src/config/stripe.config';



@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: User.name, schema: UserSchema },
    ]),
    ConfigModule.forFeature(stripeConfig),
  ],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}