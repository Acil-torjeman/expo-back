// src/company/company.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { Company, CompanySchema } from './entities/company.entity';
import { AuthModule } from '../auth/auth.module';
import { Exhibitor, ExhibitorSchema } from '../exhibitor/entities/exhibitor.entity';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: Exhibitor.name, schema: ExhibitorSchema },
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [CompanyController],
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}