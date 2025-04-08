// src/exhibitor/exhibitor.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExhibitorController } from './exhibitor.controller';
import { ExhibitorService } from './exhibitor.service';
import { Exhibitor, ExhibitorSchema } from './entities/exhibitor.entity';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Exhibitor.name, schema: ExhibitorSchema },
    ]),
    // Utiliser forwardRef pour éviter la dépendance circulaire
    forwardRef(() => AuthModule),
    // Utiliser forwardRef pour UserModule également
    forwardRef(() => UserModule),
    CompanyModule
  ],
  controllers: [ExhibitorController],
  providers: [ExhibitorService],
  exports: [ExhibitorService],
})
export class ExhibitorModule {}