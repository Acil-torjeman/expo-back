// src/user/user.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User, UserSchema } from './entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { PlanModule } from '../plan/plan.module';
import { StandModule } from '../stand/stand.module';
import { EquipmentModule } from '../equipment/equipment.module';
import { EventModule } from '../event/event.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
    ]),
    // Utiliser forwardRef pour éviter la dépendance circulaire
       forwardRef(() => AuthModule),
       forwardRef(() => UserModule),
       forwardRef(() => PlanModule),
       forwardRef(() => StandModule),
       forwardRef(() => EquipmentModule),
       forwardRef(() => EventModule),
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}