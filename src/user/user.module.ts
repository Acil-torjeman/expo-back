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
import { UserProfileController } from './user-profile.controller';
import { UserProfileService } from './user-profile.service';
import { CompanyModule } from '../company/company.module';
import { ExhibitorModule } from '../exhibitor/exhibitor.module';
import { OrganizerModule } from '../organizer/organizer.module';
import { Company, CompanySchema } from '../company/entities/company.entity';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Company.name, schema: CompanySchema }, // Add Company schema to UserModule
    ]),
    // Avoid circular dependencies
    forwardRef(() => AuthModule),
    forwardRef(() => UserModule),
    forwardRef(() => PlanModule),
    forwardRef(() => StandModule),
    forwardRef(() => EquipmentModule),
    forwardRef(() => EventModule),
    forwardRef(() => CompanyModule),
    forwardRef(() => ExhibitorModule),
    forwardRef(() => OrganizerModule),
  ],
  controllers: [UserController, UserProfileController],
  providers: [UserService, UserProfileService],
  exports: [UserService, UserProfileService],
})
export class UserModule {}