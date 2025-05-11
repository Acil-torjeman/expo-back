// src/main.ts
// Update the main.ts file with detailed configuration

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { join } from 'path';
import * as express from 'express';

// Load environment variables
dotenv.config();

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  
  // Configure static file serving for various upload directories
  app.use('/uploads/equipment-images', express.static(join(process.cwd(), 'uploads/equipment-images')));
  app.use('/uploads/plans', express.static(join(process.cwd(), 'uploads/plans')));
  app.use('/uploads/events', express.static(join(process.cwd(), 'uploads/events')));
  app.use('/uploads/organization-logos', express.static(join(process.cwd(), 'uploads/organization-logos')));
  
  logger.log(`Static file directories configured`);
  
  // Enable CORS for frontend communication
  app.enableCors({
    origin: process.env.FRONTEND_URL,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    allowedHeaders: 'Content-Type,Authorization,Accept',
  });
  
  logger.log(`CORS configured for origin: ${process.env.FRONTEND_URL}`);
  
  // Global validation settings - IMPORTANT: Allow unknown properties
  app.useGlobalPipes(new ValidationPipe({
    whitelist: false,           // Do not strip properties not in DTO
    transform: true,            // Transform payloads to be objects typed according to their DTO classes
    forbidNonWhitelisted: false, // Do not throw errors for unknown properties
    transformOptions: {
      enableImplicitConversion: true, 
    }
  }));
  
  logger.log(`Validation pipe configured with whitelist: false and forbidNonWhitelisted: false`);
  
  const port = process.env.PORT || 5001;
  await app.listen(port);
  logger.log(`Application is running on: ${await app.getUrl()}`);
  logger.log(`Static files served from: ${join(process.cwd(), 'uploads')}`);
}
bootstrap();