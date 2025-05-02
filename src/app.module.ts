import { Module } from '@nestjs/common';
import { FileModule } from './file/file.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { OrganizerModule } from './organizer/organizer.module';
import { ExhibitorModule } from './exhibitor/exhibitor.module';
import { CompanyModule } from './company/company.module';
import { EventModule } from './event/event.module';
import { EquipmentModule } from './equipment/equipment.module';
import { PlanModule } from './plan/plan.module';
import { StandModule } from './stand/stand.module';
import { RegistrationModule } from './registration/registration.module';
import { InvoiceModule } from './invoice/invoice.module';
import { PaymentModule } from './payment/payment.module';
import { NotificationModule } from './notification/notification.module';
import { MessageModule } from './message/message.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { UploadModule } from './upload/upload.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TasksModule } from './tasks/tasks.module';
import { SeedModule } from './seed/seed-module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'], 
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule, FileModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI', 'mongodb://localhost/expomanagement'),
      }),
    }),
    ScheduleModule.forRoot(),
    UserModule,
    AuthModule, 
    OrganizerModule,
    ExhibitorModule,
    CompanyModule,
    EventModule,
    EquipmentModule,
    PlanModule,
    StandModule,
    RegistrationModule,
    InvoiceModule,
    PaymentModule,
    NotificationModule,
    MessageModule,
    DashboardModule,
    UploadModule,
    TasksModule,
    SeedModule,
    AnalyticsModule 
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
