// src/file/file.controller.ts
import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { join } from 'path';
import * as fs from 'fs';

@Controller('files')
export class FileController {
  @Get('uploads/equipment-images/:filename')
  getEquipmentImage(@Param('filename') filename: string, @Res() res: Response) {
    // Absolute path to the file
    const filePath = join(process.cwd(), 'uploads', 'equipment-images', filename);
    
    // Check if file exists
    if (fs.existsSync(filePath)) {
      // Send file with appropriate MIME type
      return res.sendFile(filePath);
    } else {
      // Return 404 if file doesn't exist
      return res.status(404).send('File not found');
    }
  }

  @Get('uploads/plans/:filename')
  getPlanFile(@Param('filename') filename: string, @Res() res: Response) {
    // Absolute path to the file
    const filePath = join(process.cwd(), 'uploads', 'plans', filename);
    
    // Check if file exists
    if (fs.existsSync(filePath)) {
      // Send file with appropriate MIME type (for PDFs)
      return res.sendFile(filePath);
    } else {
      // Return 404 if file doesn't exist
      return res.status(404).send('File not found');
    }
  }

  @Get('uploads/events/:filename')
  getEventImage(@Param('filename') filename: string, @Res() res: Response) {
    // Absolute path to the file
    const filePath = join(process.cwd(), 'uploads', 'events', filename);
    
    // Check if file exists
    if (fs.existsSync(filePath)) {
      // Send file with appropriate MIME type
      return res.sendFile(filePath);
    } else {
      // Return 404 if file doesn't exist
      return res.status(404).send('File not found');
    }
  }

  @Get('uploads/organization-logos/:filename')
  getOrganizationLogo(@Param('filename') filename: string, @Res() res: Response) {
    // Absolute path to the file
    const filePath = join(process.cwd(), 'uploads', 'organization-logos', filename);
    
    // Check if file exists
    if (fs.existsSync(filePath)) {
      // Send file with appropriate MIME type
      return res.sendFile(filePath);
    } else {
      // Return 404 if file doesn't exist
      return res.status(404).send('File not found');
    }
  }
}