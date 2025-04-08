// src/organizer/organizer.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizerController } from './organizer.controller';
import { OrganizerService } from './organizer.service';
import { Organizer, OrganizerSchema } from './entities/organizer.entity';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organizer.name, schema: OrganizerSchema },
    ]),
    // Utiliser forwardRef pour éviter la dépendance circulaire
    forwardRef(() => AuthModule),
    // Utiliser forwardRef pour UserModule également, car il a aussi une dépendance circulaire
    forwardRef(() => UserModule)
  ],
  controllers: [OrganizerController],
  providers: [OrganizerService],
  exports: [OrganizerService],
})
export class OrganizerModule {}