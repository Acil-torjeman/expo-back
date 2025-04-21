// src/plan/plan.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';
import { Plan, PlanSchema } from './entities/plan.entity';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { EventModule } from '../event/event.module';
import { StandModule } from '../stand/stand.module';
import { RegistrationModule } from 'src/registration/registration.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Plan.name, schema: PlanSchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => UserModule),
    forwardRef(() => EventModule),
    forwardRef(() => StandModule),
    forwardRef(() => RegistrationModule),
  ],
  controllers: [PlanController],
  providers: [PlanService],
  exports: [PlanService],
})
export class PlanModule {}