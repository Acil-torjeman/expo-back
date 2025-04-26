// src/seed/seed.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserRole, UserStatus } from '../user/entities/user.entity';
import * as argon2 from 'argon2';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async onModuleInit() {
    // Appeler la méthode de seeding au démarrage
    await this.seed();
  }

  async seed() {
    this.logger.log('Starting data seeding...');
    
    // Créer le compte admin s'il n'existe pas déjà
    await this.createAdminAccount();
    
    this.logger.log('Data seeding completed');
  }

  async createAdminAccount() {
    const adminEmail = 'admin@myexpo.com';
    this.logger.log(`Checking if admin account exists:`);

    // Vérifier si le compte admin existe déjà
    const existingAdmin = await this.userModel.findOne({ role: UserRole.ADMIN });
    
    if (existingAdmin) {
      this.logger.log('Admin account already exists');
      return;
    }

    this.logger.log('Creating admin account...');

    try {
      // Hasher le mot de passe avec argon2
      const hashedPassword = await argon2.hash('Admin123!', {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4
      });

      // Créer l'admin
      const admin = new this.userModel({
        email: adminEmail,
        username: 'Admin',
        password: hashedPassword,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      });

      await admin.save();
      this.logger.log('Admin account created successfully');
    } catch (error) {
      this.logger.error(`Failed to create admin account: ${error.message}`, error.stack);
    }
  }
}