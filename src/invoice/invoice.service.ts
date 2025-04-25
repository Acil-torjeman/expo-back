// src/invoice/invoice.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Invoice, InvoiceStatus, InvoiceItem } from './entities/invoice.entity';
import { Registration, RegistrationStatus } from '../registration/entities/registration.entity';
import { Exhibitor } from '../exhibitor/entities/exhibitor.entity';
import { Organizer } from '../organizer/entities/organizer.entity';
import { Event } from '../event/entities/event.entity';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs-extra';
import * as path from 'path';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);
  private readonly pdfStoragePath = './uploads/invoices';

  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<Invoice>,
    @InjectModel(Registration.name) private registrationModel: Model<Registration>,
    @InjectModel(Exhibitor.name) private exhibitorModel: Model<Exhibitor>,
    @InjectModel(Organizer.name) private organizerModel: Model<Organizer>,
    @InjectModel(Event.name) private eventModel: Model<Event>,
  ) {
    // Ensure invoices directory exists
    fs.ensureDirSync(this.pdfStoragePath);
  }

  /**
   * Generate a unique invoice number with organizer prefix
   */
  private generateInvoiceNumber(organizerPrefix: string): string {
    const timestamp = new Date().toISOString().slice(0,10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${organizerPrefix}-${timestamp}-${random}`;
  }

  /**
   * Create a new invoice from registration data
   */
  async createFromRegistration(registrationId: string): Promise<Invoice> {
    this.logger.log(`Creating invoice for registration ID: ${registrationId}`);
    
    // Find registration with all related data
    const registration = await this.registrationModel.findById(registrationId)
      .populate('exhibitor')
      .populate('event')
      .populate('stands')
      .populate('equipment')
      .populate({
        path: 'equipmentQuantities.equipment',
        model: 'Equipment'
      })
      .exec();
    
    if (!registration) {
      throw new NotFoundException(`Registration with ID ${registrationId} not found`);
    }
    
    // Check if registration is in completed status
    if (registration.status !== RegistrationStatus.COMPLETED) {
      throw new BadRequestException(`Cannot generate invoice for registration that is not completed`);
    }
    
    // Check if invoice already exists for this registration
    const existingInvoice = await this.invoiceModel.findOne({ registration: registrationId }).exec();
    if (existingInvoice) {
      this.logger.log(`Invoice already exists for registration ${registrationId}`);
      return existingInvoice;
    }
    
    // Extract exhibitor ID
    const exhibitorId = registration.exhibitor._id;
    
    // Get event and organizer details
    const event = await this.eventModel.findById(registration.event._id).exec();
    
    if (!event) {
      throw new NotFoundException(`Event with ID ${registration.event._id} not found`);
    }
    
    // Extract organizer ID from event
    const organizerId = event.organizer;
    
    // Get organizer details
    const organizer = await this.organizerModel.findById(organizerId)
      .populate('user')
      .exec();
    
    if (!organizer) {
      throw new NotFoundException(`Organizer with ID ${organizerId} not found`);
    }
    
    // Generate invoice items from stands and equipment
    const items: InvoiceItem[] = [];
    
    // Add stands
    if (registration.stands && registration.stands.length > 0) {
      registration.stands.forEach(stand => {
        items.push({
          type: 'stand',
          name: `${stand.type} Stand #${stand.number}`,
          description: `Stand area: ${stand.area} m²`,
          price: stand.basePrice || 0,
          quantity: 1
        });
      });
    }
    
    // Add equipment
    if (registration.equipment && registration.equipment.length > 0) {
      registration.equipment.forEach(equipment => {
        // Find quantity from equipmentQuantities
        let quantity = 1;
        if (registration.equipmentQuantities && registration.equipmentQuantities.length > 0) {
          const quantityItem = registration.equipmentQuantities.find(eq => {
            const eqId = typeof eq.equipment === 'object' ? 
              (eq.equipment as any)._id?.toString() : 
              (eq.equipment as string)?.toString();
            return eqId === equipment._id?.toString();
          });
          
          if (quantityItem) {
            quantity = quantityItem.quantity || 1;
          }
        }
        
        items.push({
          type: 'equipment',
          name: equipment.name || 'Equipment',
          description: equipment.description || '',
          price: equipment.price || 0,
          quantity: quantity
        });
      });
    }
    
    // Calculate financial values
    const subtotal = items.reduce((total, item) => total + (item.price * item.quantity), 0);
    const taxRate = 0.20; // 20% tax rate
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;
    
    // Create organizer prefix for invoice number (first 3 chars of org name)
    const orgPrefix = organizer.organizationName?.substring(0, 3).toUpperCase() || 'INV';
    
    // Create invoice
    const invoice = new this.invoiceModel({
      invoiceNumber: this.generateInvoiceNumber(orgPrefix),
      registration: registrationId,
      exhibitor: exhibitorId,
      organizer: organizerId,
      event: event._id,
      items: items,
      subtotal: subtotal,
      taxRate: taxRate,
      taxAmount: taxAmount,
      total: total,
      status: InvoiceStatus.PENDING
    });
    
    // Save invoice
    const savedInvoice = await invoice.save() as any;
    
    // Generate PDF
    const pdfPath = await this.generateInvoicePDF(savedInvoice._id.toString());
    
    // Update invoice with PDF path
    savedInvoice.pdfPath = pdfPath;
    await savedInvoice.save();
    
    return savedInvoice;
  }
  
  /**
   * Generate PDF for an invoice - Simple version without payment details
   */
  async generateInvoicePDF(invoiceId: string): Promise<string> {
    // Get invoice with all required data
    const invoice = await this.invoiceModel.findById(invoiceId)
      .populate('exhibitor')
      .populate('organizer')
      .populate('event')
      .exec();
    
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${invoiceId} not found`);
    }
    
    // Get exhibitor details
    const exhibitor = await this.exhibitorModel.findById(invoice.exhibitor)
      .populate('company')
      .populate('user')
      .exec();
    
    // Get organizer details
    const organizer = await this.organizerModel.findById(invoice.organizer)
      .populate('user')
      .exec();
    
    // PDF filename
    const filename = `${invoice.invoiceNumber}.pdf`;
    const pdfPath = path.join(this.pdfStoragePath, filename);
    
    // Create PDF document
    const doc = new PDFDocument({
      margin: 50,
      size: 'A4'
    });
    
    // Pipe to file
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);
    
    // HEADER SECTION
    
    // Add organizer logo if available
    if (organizer?.organizationLogoPath) {
      const logoPath = path.join(process.cwd(), 'uploads/organization-logos', organizer.organizationLogoPath);
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 45, { width: 150 });
      }
    }
    
    // Add invoice title
    doc.fontSize(24).fillColor('#2D3748').text('INVOICE', 450, 45, { align: 'right' });
    doc.fontSize(10).fillColor('#718096').text(`INVOICE #: ${invoice.invoiceNumber}`, 450, 75, { align: 'right' });
    
    // Format date safely
    const createdAt = invoice.createdAt ? new Date(invoice.createdAt) : new Date();
    doc.fontSize(10).fillColor('#718096').text(`DATE: ${createdAt.toLocaleDateString()}`, 450, 90, { align: 'right' });
    
    // Add line
    doc.strokeColor('#E2E8F0').lineWidth(1).moveTo(50, 120).lineTo(550, 120).stroke();
    
    // FROM AND TO SECTION
    
    // From (Organizer) info
    doc.fontSize(10).fillColor('#4A5568');
    doc.text('FROM:', 50, 140);
    doc.fontSize(12).fillColor('#2D3748');
    doc.text(organizer?.organizationName || 'Organization', 50, 155, { lineGap: 5 });
    doc.fontSize(10).fillColor('#718096');
    doc.text(organizer?.organizationAddress || '', { lineGap: 2 });
    doc.text(`${organizer?.postalCity || ''}, ${organizer?.country || ''}`, { lineGap: 2 });
    
    if (organizer?.contactPhoneCode && organizer?.contactPhone) {
      doc.text(`Tel: ${organizer.contactPhoneCode} ${organizer.contactPhone}`, { lineGap: 2 });
    }
    
    if (organizer?.user?.email) {
      doc.text(`Email: ${organizer.user.email}`, { lineGap: 2 });
    }
    
    // To (Exhibitor) info
    doc.fontSize(10).fillColor('#4A5568');
    doc.text('TO:', 300, 140);
    doc.fontSize(12).fillColor('#2D3748');
    doc.text(exhibitor?.company?.companyName || 'Unknown Company', 300, 155, { lineGap: 5 });
    doc.fontSize(10).fillColor('#718096');
    
    if (exhibitor?.company?.companyAddress) {
      doc.text(exhibitor.company.companyAddress, { lineGap: 2 });
    }
    
    doc.text(`${exhibitor?.company?.postalCity || ''}, ${exhibitor?.company?.country || ''}`, { lineGap: 2 });
    
    if (exhibitor?.personalPhoneCode && exhibitor?.personalPhone) {
      doc.text(`Tel: ${exhibitor.personalPhoneCode} ${exhibitor.personalPhone}`, { lineGap: 2 });
    }
    
    if (exhibitor?.user?.email) {
      doc.text(`Email: ${exhibitor.user.email}`, { lineGap: 2 });
    }
    
    // EVENT DETAILS SECTION
    
    // Background box
    doc.roundedRect(50, 245, 500, 60, 5).fillAndStroke('#EBF8FF', '#90CDF4');
    
    // Event info
    doc.fontSize(10).fillColor('#2B6CB0');
    doc.text('EVENT DETAILS', 60, 255);
    doc.fontSize(12).fillColor('#2C5282');
    doc.text(invoice.event.name, 60, 270, { lineGap: 5 });
    doc.fontSize(10).fillColor('#4299E1');
    doc.text(`${new Date(invoice.event.startDate).toLocaleDateString()} - ${new Date(invoice.event.endDate).toLocaleDateString()}`, 300, 270);
    doc.text(`${invoice.event.location?.city || ''}, ${invoice.event.location?.country || ''}`, 300, 285);
    
    // ITEMS TABLE SECTION
    
    // Table headers
    const tableTop = 340;
    doc.fontSize(10).fillColor('#2D3748');
    doc.text('ITEM', 50, tableTop);
    doc.text('DESCRIPTION', 180, tableTop);
    doc.text('QTY', 350, tableTop, { width: 50, align: 'right' });
    doc.text('RATE', 410, tableTop, { width: 60, align: 'right' });
    doc.text('AMOUNT', 480, tableTop, { width: 70, align: 'right' });
    
    // Header line
    doc.strokeColor('#CBD5E0').lineWidth(1).moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
    
    // Table rows
    let y = tableTop + 30;
    
    invoice.items.forEach((item) => {
      // Item type badge
      doc.roundedRect(50, y - 5, 50, 16, 3).fillAndStroke(
        item.type === 'stand' ? '#FEEBC8' : '#E9D8FD',
        item.type === 'stand' ? '#ED8936' : '#805AD5'
      );
      doc.fontSize(8).fillColor(item.type === 'stand' ? '#C05621' : '#553C9A');
      doc.text(item.type.toUpperCase(), 50, y, { width: 50, align: 'center' });
      
      // Item details
      doc.fontSize(10).fillColor('#2D3748');
      doc.text(item.name, 110, y, { width: 230 });
      doc.fontSize(9).fillColor('#718096');
      doc.text(item.description || '', 110, y + 15, { width: 230 });
      
      doc.fontSize(10).fillColor('#2D3748');
      doc.text(item.quantity.toString(), 350, y, { width: 50, align: 'right' });
      doc.text(`$${item.price.toFixed(2)}`, 410, y, { width: 60, align: 'right' });
      doc.text(`$${(item.price * item.quantity).toFixed(2)}`, 480, y, { width: 70, align: 'right' });
      
      y += 40;
      
      // Add page if needed
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
    });
    
    // TOTALS SECTION
    
    // Total box
    const totalsTop = Math.min(y + 10, 700);
    doc.roundedRect(350, totalsTop, 200, 90, 5).lineWidth(1).fillAndStroke('#F7FAFC', '#E2E8F0');
    
    // Subtotal
    doc.fontSize(10).fillColor('#4A5568');
    doc.text('Subtotal:', 370, totalsTop + 15, { width: 100 });
    doc.fontSize(10).fillColor('#2D3748');
    doc.text(`$${invoice.subtotal.toFixed(2)}`, 470, totalsTop + 15, { width: 60, align: 'right' });
    
    // Tax
    doc.fontSize(10).fillColor('#4A5568');
    doc.text(`Tax (${(invoice.taxRate * 100).toFixed(0)}%):`, 370, totalsTop + 35, { width: 100 });
    doc.fontSize(10).fillColor('#2D3748');
    doc.text(`$${invoice.taxAmount.toFixed(2)}`, 470, totalsTop + 35, { width: 60, align: 'right' });
    
    // Total
    doc.fontSize(10).fillColor('#4A5568');
    doc.text('Total:', 370, totalsTop + 65, { width: 100 });
    doc.fontSize(12).fillColor('#2D3748').font('Helvetica-Bold');
    doc.text(`$${invoice.total.toFixed(2)}`, 470, totalsTop + 63, { width: 60, align: 'right' });
    
    // Footer
    const footerTop = Math.min(y + 130, 750);
    doc.fontSize(8).font('Helvetica').fillColor('#A0AEC0');
    doc.text(
      `Invoice #${invoice.invoiceNumber} | Generated on ${new Date(invoice.createdAt).toLocaleDateString()}`,
      50, footerTop, { align: 'center', width: 500 }
    );
    
    // Finalize document
    doc.end();
    
    // Return relative path to the PDF
    return filename;
  }

  /**
   * Find invoice by ID
   */
  async findOne(id: string): Promise<Invoice> {
    const invoice = await this.invoiceModel.findById(id)
      .populate('exhibitor')
      .populate('organizer')
      .populate('event')
      .populate('registration')
      .exec();
    
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }
    
    return invoice;
  }

  /**
   * Find invoice by registration ID
   */
  async findByRegistration(registrationId: string): Promise<Invoice> {
    const invoice = await this.invoiceModel.findOne({ registration: registrationId })
      .populate('exhibitor')
      .populate('organizer')
      .populate('event')
      .exec();
    
    if (!invoice) {
      throw new NotFoundException(`No invoice found for registration ${registrationId}`);
    }
    
    return invoice;
  }

  /**
   * Find invoices for an exhibitor
   */
  async findByExhibitor(exhibitorId: string): Promise<Invoice[]> {
    return this.invoiceModel.find({ exhibitor: exhibitorId })
      .populate('event')
      .populate('organizer')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find invoices for an organizer
   */
  async findByOrganizer(organizerId: string): Promise<Invoice[]> {
    return this.invoiceModel.find({ organizer: organizerId })
      .populate('event')
      .populate('exhibitor')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Update invoice status
   */
  async updateStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
    const invoice = await this.findOne(id);
    invoice.status = status;
    return invoice.save();
  }

  /**
   * Get PDF download path
   */
  getPdfPath(invoicePath: string): string {
    return path.join(this.pdfStoragePath, invoicePath);
  }
}