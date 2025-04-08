// src/stand/stand.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StandController } from './stand.controller';
import { StandService } from './stand.service';
import { Stand, StandSchema } from './entities/stand.entity';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { PlanModule } from '../plan/plan.module';
import { EventModule } from '../event/event.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Stand.name, schema: StandSchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => UserModule),
    forwardRef(() => PlanModule),
    forwardRef(() => EventModule),
  ],
  controllers: [StandController],
  providers: [StandService],
  exports: [StandService],
})
export class StandModule {}