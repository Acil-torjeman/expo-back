import { 
  Controller, 
  Get, 
  Post, 
  Param, 
  UseGuards, 
  Req, 
  Res,
  Logger,
  HttpStatus,
  HttpCode,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException
} from '@nestjs/common';
import { Response } from 'express';
import { InvoiceService } from './invoice.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { IsPublic } from '../auth/decorators/public.decorator';
import { UserRole } from '../user/entities/user.entity';
import * as fs from 'fs';

@Controller('invoices')
export class InvoiceController {
  private readonly logger = new Logger(InvoiceController.name);

  constructor(private readonly invoiceService: InvoiceService) {}

  @Post('registration/:registrationId')
@UseGuards(JwtAuthGuard)
@HttpCode(HttpStatus.CREATED)
async createFromRegistration(@Param('registrationId') registrationId: string, @Req() req) {
  this.logger.log(`Creating invoice for registration: ${registrationId} by user ${req.user.id}`);
  
  // Vérifier si l'utilisateur est autorisé à générer cette facture
  if (req.user.role === UserRole.EXHIBITOR) {
    // Pour les exposants, vérifier qu'ils sont bien propriétaires de cette inscription
    const isOwner = await this.invoiceService.isRegistrationOwner(registrationId, req.user.id);
    if (!isOwner) {
      throw new ForbiddenException('You do not have permission to generate an invoice for this registration');
    }
  } else if (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.ORGANIZER) {
    // Pour les autres rôles (qui ne sont ni admin, ni organisateur, ni exposant vérifiés ci-dessus)
    throw new ForbiddenException('You do not have permission to generate invoices');
  }
  
  return this.invoiceService.createFromRegistration(registrationId);
}

@Get(':id/public-pdf')
@IsPublic()
async getPublicInvoicePdf(@Param('id') id: string, @Res() res: Response) {
  this.logger.log(`Getting public PDF for invoice: ${id}`);
  
  try {
    // Récupérer la facture
    const invoice = await this.invoiceService.findOne(id);
    
    if (!invoice.pdfPath) {
      throw new NotFoundException('PDF not found for this invoice');
    }
    
    const pdfPath = this.invoiceService.getPdfPath(invoice.pdfPath);
    
    // Check if file exists
    if (!fs.existsSync(pdfPath)) {
      throw new NotFoundException('PDF file not found');
    }
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.pdfPath}"`);
    
    // Stream the file
    const fileStream = fs.createReadStream(pdfPath);
    fileStream.pipe(res);
  } catch (error) {
    this.logger.error(`Error serving public PDF: ${error.message}`);
    if (error instanceof NotFoundException) {
      throw error;
    }
    throw new InternalServerErrorException('Could not retrieve the invoice PDF');
  }
}
  @Get('registration/:registrationId')
  @UseGuards(JwtAuthGuard)
  async getByRegistration(@Param('registrationId') registrationId: string) {
    this.logger.log(`Getting invoice for registration: ${registrationId}`);
    return this.invoiceService.findByRegistration(registrationId);
  }

  @Get('exhibitor')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EXHIBITOR)
  async getMyInvoices(@Req() req) {
    this.logger.log(`Getting invoices for exhibitor: ${req.user.id}`);
    return this.invoiceService.findByExhibitor(req.user.id);
  }

  @Get('organizer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER)
  async getOrganizerInvoices(@Req() req) {
    this.logger.log(`Getting invoices for organizer: ${req.user.id}`);
    return this.invoiceService.findByOrganizer(req.user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getInvoice(@Param('id') id: string) {
    this.logger.log(`Getting invoice: ${id}`);
    return this.invoiceService.findOne(id);
  }

  @Get(':id/pdf')
  @UseGuards(JwtAuthGuard)
  async getInvoicePdf(@Param('id') id: string, @Res() res: Response, @Req() req): Promise<void> {
    this.logger.log(`Getting PDF for invoice: ${id} by user ${req.user.id}`);
    
    // Récupérer la facture
    const invoice = await this.invoiceService.findOne(id);
    
    // Vérifier si l'utilisateur a le droit d'accéder à cette facture
    if (req.user.role === UserRole.EXHIBITOR) {
      const isOwner = await this.invoiceService.isInvoiceOwner(id, req.user.id);
      if (!isOwner) {
        throw new ForbiddenException('You do not have permission to access this invoice PDF');
      }
    } else if (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.ORGANIZER) {
      throw new ForbiddenException('You do not have permission to access invoice PDFs');
    }
    
    if (!invoice.pdfPath) {
      throw new NotFoundException('PDF not found for this invoice');
    }
    
    const pdfPath = this.invoiceService.getPdfPath(invoice.pdfPath);
    
    // Check if file exists
    if (!fs.existsSync(pdfPath)) {
      throw new NotFoundException('PDF file not found');
    }
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.pdfPath}"`);
    
    // Stream the file
    const fileStream = fs.createReadStream(pdfPath);
    fileStream.pipe(res);
  }

  @Post(':id/update-status/:status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  async updateStatus(
    @Param('id') id: string, 
    @Param('status') status: string
  ) {
    this.logger.log(`Updating invoice ${id} status to ${status}`);
    return this.invoiceService.updateStatus(id, status as any);
  }
}