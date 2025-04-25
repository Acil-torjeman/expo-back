// src/invoice/invoice.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, Document } from 'mongoose';
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
    // Ensure invoices directory exists with correct permissions
    this.logger.log(`Ensuring invoices directory exists at: ${this.pdfStoragePath}`);
    try {
      fs.mkdirSync(this.pdfStoragePath, { recursive: true, mode: 0o755 });
      this.logger.log(`Invoices directory created/verified at: ${this.pdfStoragePath}`);
    } catch (error) {
      this.logger.error(`Failed to create invoices directory: ${error.message}`);
    }
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
   * Safely extract ID from a document or ID reference
   */
  private getDocumentId(doc: any): string {
    if (!doc) return '';
    
    if (typeof doc === 'string') {
      return doc;
    }
    
    if (typeof doc === 'object') {
      // Handle ObjectId directly
      if (doc instanceof Types.ObjectId) {
        return doc.toString();
      }
      
      // Handle document with _id
      if (doc._id) {
        if (doc._id instanceof Types.ObjectId) {
          return doc._id.toString();
        }
        return String(doc._id);
      }
      
      // Handle toString method (ObjectId-like)
      if (typeof doc.toString === 'function' && doc.toString() !== '[object Object]') {
        return doc.toString();
      }
    }
    
    return '';
  }

  /**
   * Vérifier si un utilisateur est le propriétaire d'une facture
   */
  async isInvoiceOwner(invoiceId: string, userId: string): Promise<boolean> {
    this.logger.log(`Checking if user ${userId} is the owner of invoice ${invoiceId}`);
    
    try {
      // Récupérer la facture avec les informations de l'exposant
      const invoice = await this.invoiceModel.findById(invoiceId)
        .populate({
          path: 'exhibitor', 
          populate: {
            path: 'user',
            select: '_id'
          }
        })
        .exec();
      
      if (!invoice) {
        return false;
      }
      
      // Vérifier si l'exposant est défini
      if (!invoice.exhibitor) {
        return false;
      }
      
      // Récupérer l'ID utilisateur de l'exposant
      let exhibitorUserId: string;
      
      if (typeof invoice.exhibitor === 'object' && invoice.exhibitor.user) {
        const user = invoice.exhibitor.user;
        
        if (typeof user === 'object' && user._id) {
          exhibitorUserId = String(user._id);
        } else {
          exhibitorUserId = String(user);
        }
      } else {
        // Si l'exposant n'a pas d'utilisateur associé, on essaie de le récupérer manuellement
        try {
          const exhibitor = await this.exhibitorModel.findById(invoice.exhibitor)
            .populate('user', '_id')
            .exec();
          
          if (!exhibitor || !exhibitor.user) {
            return false;
          }
          
          exhibitorUserId = String(exhibitor.user._id || exhibitor.user);
        } catch (error) {
          this.logger.error(`Error fetching exhibitor for ownership check: ${error.message}`);
          return false;
        }
      }
      
      // Conversion explicite en string pour comparaison sécurisée
      const cleanUserId = String(userId).trim();
      
      this.logger.log(`Comparing user IDs: exhibitor user=${exhibitorUserId}, requesting user=${cleanUserId}`);
      
      return exhibitorUserId === cleanUserId;
    } catch (error) {
      this.logger.error(`Error checking invoice ownership: ${error.message}`);
      return false;
    }
  }

  /**
   * Vérifier si un utilisateur est le propriétaire d'une inscription
   */
  async isRegistrationOwner(registrationId: string, userId: string): Promise<boolean> {
    this.logger.log(`Checking if user ${userId} is the owner of registration ${registrationId}`);
    
    try {
      // Trouver l'inscription
      const registration = await this.registrationModel.findById(registrationId)
        .populate({ 
          path: 'exhibitor',
          populate: { 
            path: 'user',
            select: '_id'
          }
        })
        .exec();
      
      if (!registration) {
        return false;
      }
      
      // Vérifier si l'utilisateur est le propriétaire de l'inscription
      const exhibitorUser = registration.exhibitor?.user;
      
      if (!exhibitorUser) {
        return false;
      }
      
      // Extraire l'ID utilisateur de l'exposant
      let exhibitorUserId: string;
      
      if (typeof exhibitorUser === 'object' && exhibitorUser._id) {
        exhibitorUserId = String(exhibitorUser._id);
      } else {
        exhibitorUserId = String(exhibitorUser);
      }
      
      // Conversion explicite en string pour comparaison sécurisée
      const cleanUserId = String(userId).trim();
      
      this.logger.log(`Comparing user IDs: exhibitor user=${exhibitorUserId}, requesting user=${cleanUserId}`);
      
      return exhibitorUserId === cleanUserId;
    } catch (error) {
      this.logger.error(`Error checking registration ownership: ${error.message}`);
      return false;
    }
  }

  /**
   * Create invoice from a completed registration
   */
  async createFromRegistration(registrationId: string): Promise<Invoice> {
    this.logger.log(`Creating invoice for registration ID: ${registrationId}`);
    
    try {
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
      
      // Extract exhibitor ID - Convert to ObjectId to ensure type safety
      const exhibitorId = new Types.ObjectId(this.getDocumentId(registration.exhibitor));
      
      // Get event with full event details and organizer reference
      const event = await this.eventModel.findById(registration.event._id).exec();
      
      if (!event) {
        throw new NotFoundException(`Event with ID ${registration.event._id} not found`);
      }
      
      // Extract organizer reference from event
      let eventOrganizerId: string;
      if (event.organizer) {
        eventOrganizerId = this.getDocumentId(event.organizer);
      } else {
        this.logger.warn(`Event ${event._id} has no organizer reference`);
        throw new BadRequestException('Event has no organizer associated with it');
      }
      
      // Find the actual Organizer entity by looking up user ID
      let organizer;
      try {
        // First try to find directly by _id (in case it's already an organizer ID)
        organizer = await this.organizerModel.findById(eventOrganizerId).exec();
        
        // If not found, try to find by user ID
        if (!organizer) {
          this.logger.log(`No organizer found with ID ${eventOrganizerId}, trying to find by user ID`);
          organizer = await this.organizerModel.findOne({ user: eventOrganizerId }).exec();
          
          if (organizer) {
            this.logger.log(`Found organizer with user ID ${eventOrganizerId}: ${organizer._id}`);
          } else {
            this.logger.error(`No organizer found for user ID ${eventOrganizerId}`);
            throw new NotFoundException(`Organizer not found for event ${event._id}`);
          }
        }
      } catch (error) {
        this.logger.error(`Error finding organizer: ${error.message}`);
        throw new BadRequestException('Unable to identify organizer for invoice creation');
      }
      
      // Now we have the correct organizer entity with its own ID
      const organizerId = new Types.ObjectId(this.getDocumentId(organizer));
      
      // Generate invoice items from stands and equipment
      const items: InvoiceItem[] = [];
      
      // Add stands
      if (registration.stands && registration.stands.length > 0) {
        registration.stands.forEach(stand => {
          items.push({
            type: 'stand',
            name: `${stand.type || 'Standard'} Stand #${stand.number || 'N/A'}`,
            description: `Stand area: ${stand.area || '0'} m²`,
            price: stand.basePrice || 0,
            quantity: 1
          });
        });
      }
      
      // Add equipment with quantities
      if (registration.equipment && registration.equipment.length > 0) {
        registration.equipment.forEach(equipment => {
          // Find quantity from equipmentQuantities
          let quantity = 1;
          if (registration.equipmentQuantities && registration.equipmentQuantities.length > 0) {
            const quantityItem = registration.equipmentQuantities.find(eq => {
              const eqId = this.getDocumentId(eq.equipment);
              const equipId = this.getDocumentId(equipment);
              return eqId === equipId;
            });
            
            if (quantityItem) {
              quantity = quantityItem.quantity || 1;
            }
          }
          
          const equipmentName = typeof equipment === 'object' ? 
            (equipment.name || 'Equipment') : 
            'Equipment';
            
          const equipmentDesc = typeof equipment === 'object' ? 
            (equipment.description || '') : 
            '';
            
          const equipmentPrice = typeof equipment === 'object' ? 
            (equipment.price || 0) : 
            0;
          
          items.push({
            type: 'equipment',
            name: equipmentName,
            description: equipmentDesc,
            price: equipmentPrice,
            quantity: quantity
          });
        });
      }
      
      // Calculate financial values
      const subtotal = items.reduce((total, item) => total + (item.price * item.quantity), 0);
      const taxRate = 0.19; // 20% tax rate
      const taxAmount = subtotal * taxRate;
      const total = subtotal + taxAmount;
      
      // Create organizer prefix for invoice number (first 3 chars of org name)
      const orgName = organizer.organizationName || 'ORG';
      const orgPrefix = orgName.substring(0, 3).toUpperCase() || 'INV';
      
      // Create invoice with proper typing
      const invoice = new this.invoiceModel({
        invoiceNumber: this.generateInvoiceNumber(orgPrefix),
        registration: new Types.ObjectId(registrationId),
        exhibitor: exhibitorId,
        organizer: organizerId,
        event: new Types.ObjectId(this.getDocumentId(event)),
        items: items,
        subtotal: subtotal,
        taxRate: taxRate,
        taxAmount: taxAmount,
        total: total,
        status: InvoiceStatus.PENDING
      });
      
      // Save invoice with proper handling of the returned document and ID
      const savedInvoice = await invoice.save();
      const invoiceId = savedInvoice._id ? savedInvoice._id.toString() : '';
      
      this.logger.log(`Invoice created with ID: ${invoiceId}`);
      
      try {
        // Generate PDF
        const pdfPath = await this.generateInvoicePDF(invoiceId);
        
        // Update invoice with PDF path
        savedInvoice.pdfPath = pdfPath;
        await savedInvoice.save();
      } catch (pdfError) {
        this.logger.error(`Error generating PDF for invoice ${invoiceId}: ${pdfError.message}`);
        // Continue without PDF, it can be generated later
      }
      
      return savedInvoice;
    } catch (error) {
      this.logger.error(`Error creating invoice for registration ${registrationId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Generate PDF for an invoice
   */
  async generateInvoicePDF(invoiceId: string): Promise<string> {
    try {
      // Get invoice with all required data
      const invoice = await this.invoiceModel.findById(invoiceId)
        .populate('exhibitor')
        .populate('organizer')
        .populate('event')
        .populate('registration')
        .exec();
      
      if (!invoice) {
        throw new NotFoundException(`Invoice with ID ${invoiceId} not found`);
      }
      
      // Get exhibitor details with company info
      let exhibitor;
      try {
        exhibitor = await this.exhibitorModel.findById(invoice.exhibitor)
          .populate('company')
          .populate('user')
          .exec();
      } catch (error) {
        this.logger.error(`Error fetching exhibitor: ${error.message}`);
        exhibitor = {
          company: { companyName: 'Unknown Company' },
          user: { email: 'unknown@example.com' }
        };
      }
      
      // Get organizer details - with better null handling
      let organizer;
      try {
        organizer = await this.organizerModel.findById(invoice.organizer)
          .populate('user')
          .exec();
        
        // If organizer is null, create a default object
        if (!organizer) {
          this.logger.warn(`Organizer not found for ID: ${invoice.organizer}, using default values`);
          organizer = {
            organizationName: 'Event Organizer',
            organizationAddress: 'Unknown Address',
            postalCity: 'Unknown City',
            country: 'Unknown Country',
            contactPhoneCode: '',
            contactPhone: '',
            user: { email: 'unknown@example.com' }
          };
        }
      } catch (error) {
        this.logger.error(`Error fetching organizer: ${error.message}`);
        organizer = {
          organizationName: 'Event Organizer',
          organizationAddress: 'Unknown Address',
          postalCity: 'Unknown City',
          country: 'Unknown Country',
          contactPhoneCode: '',
          contactPhone: '',
          user: { email: 'unknown@example.com' }
        };
      }
      
      // Create PDF filename
      const filename = `${invoice.invoiceNumber}.pdf`;
      const pdfPath = path.join(this.pdfStoragePath, filename);
      
      // Ensure the directory exists
      fs.ensureDirSync(this.pdfStoragePath);
      
      // Create PDF document
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4'
      });
      
      // Pipe PDF to file
      const stream = fs.createWriteStream(pdfPath);
      doc.pipe(stream);
      
      // HEADER SECTION
      
      // First determine positions for sections
      const fromYPosition = 130; 
      
      // Add organizer logo if available - positioned well above "From:" section with original proportions
      if (organizer?.organizationLogoPath) {
        const logoPath = path.join(process.cwd(), 'uploads/organization-logos', organizer.organizationLogoPath);
        if (fs.existsSync(logoPath)) {
          try {
            // Position logo at the left column, with sufficient space above the "From:" text
            const logoWidth = 70;
            // Place logo higher to ensure it doesn't overlap with "From:" text - at least 20px gap
            doc.image(logoPath, 45, 30, { width: logoWidth });
          } catch (error) {
            this.logger.error(`Error adding logo to PDF: ${error.message}`);
          }
        }
      }
       
      // Add invoice title and information - ensure full title displays
      doc.fontSize(24).fillColor('#2D3748').text('INVOICE', 400, 45, { align: 'right', width: 150 });
      doc.fontSize(10).fillColor('#718096').text(`INVOICE #: ${invoice.invoiceNumber}`, 400, 75, { align: 'right', width: 150 });
      
      // Format date safely
      const createdAt = invoice.createdAt ? new Date(invoice.createdAt) : new Date();
      const formattedDate = createdAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      doc.fontSize(10).fillColor('#718096').text(`DATE: ${formattedDate}`, 400, 90, { align: 'right', width: 150 });
      
      // ORGANIZER INFORMATION - ensure all organizer data is displayed with robust null checks
      doc.fillColor('#2D3748').fontSize(14).text('From:', 50, fromYPosition);
      
      // Safe property access with defaults for all organizer fields
      const orgName = organizer && organizer.organizationName ? organizer.organizationName : 'Event Organizer';
      const orgAddress = organizer && organizer.organizationAddress ? organizer.organizationAddress : '';
      const orgCity = organizer && organizer.postalCity ? organizer.postalCity : '';
      const orgCountry = organizer && organizer.country ? organizer.country : '';
      const orgPhoneCode = organizer && organizer.contactPhoneCode ? organizer.contactPhoneCode : '';
      const orgPhone = organizer && organizer.contactPhone ? organizer.contactPhone : '';
      
      // Safely access nested user email property
      let orgEmail = 'unknown@example.com';
      if (organizer && organizer.user) {
        if (typeof organizer.user === 'object' && organizer.user !== null) {
          orgEmail = organizer.user.email || 'unknown@example.com';
        } else if (typeof organizer.user === 'string') {
          orgEmail = 'user-id-only@example.com'; // User is just an ID
        }
      }
      
      doc.fillColor('#4A5568').fontSize(10).text(orgName, 50, 150);
      doc.fillColor('#718096').fontSize(9)
        .text(orgAddress, 50, 165)
        .text(`${orgCity}${orgCity && orgCountry ? ', ' : ''}${orgCountry}`, 50, 180)
        .text(`Phone: ${orgPhoneCode} ${orgPhone}`, 50, 195)
        .text(`Email: ${orgEmail}`, 50, 210);
      
      // EXHIBITOR INFORMATION
      doc.fillColor('#2D3748').fontSize(14).text('Bill To:', 300, 130);
      doc.fillColor('#4A5568').fontSize(10).text(exhibitor?.company?.companyName || 'Exhibitor Company', 300, 150);
      doc.fillColor('#718096').fontSize(9)
        .text(exhibitor?.company?.companyAddress || '', 300, 165)
        .text(`${exhibitor?.company?.postalCity || ''}, ${exhibitor?.company?.country || ''}`, 300, 180)
        .text(`Registration #: ${exhibitor?.company?.registrationNumber || ''}`, 300, 195)
        .text(`Email: ${exhibitor?.user?.email || ''}`, 300, 210);
      
      // EVENT INFORMATION
      const event = invoice.event || {};
      doc.fillColor('#2D3748').fontSize(14).text('Event Details:', 50, 240);
      doc.fillColor('#4A5568').fontSize(10).text(event.name || 'Event Name', 50, 260);
      
      // Format event dates if available
      let eventDates = 'N/A';
      if (event.startDate && event.endDate) {
        const startDate = new Date(event.startDate);
        const endDate = new Date(event.endDate);
        eventDates = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
      }
      
      doc.fillColor('#718096').fontSize(9)
        .text(`Dates: ${eventDates}`, 50, 275);
      
      if (event.location) {
        const location = typeof event.location === 'object' ? event.location : { address: '', city: '' };
        doc.text(`Location: ${location.address || ''}, ${location.city || ''}`, 50, 290);
      }
      
      // INVOICE ITEMS TABLE
      doc.fillColor('#2D3748').fontSize(14).text('Invoice Items:', 50, 320);
      
      // Table headers
      const tableTop = 345;
      const tableWidth = 500;
      
      // Draw table header background
      doc.fillColor('#EDF2F7').rect(50, tableTop, tableWidth, 20).fill();
      
      // Draw header text
      doc.fillColor('#2D3748').fontSize(10)
        .text('Item', 60, tableTop + 5, { width: 200 })
        .text('Description', 260, tableTop + 5, { width: 130 })
        .text('Quantity', 390, tableTop + 5, { width: 50, align: 'center' })
        .text('Price', 440, tableTop + 5, { width: 50, align: 'right' })
        .text('Total', 490, tableTop + 5, { width: 50, align: 'right' });
      
      // Draw header underline
      doc.strokeColor('#CBD5E0').lineWidth(1).moveTo(50, tableTop + 20).lineTo(550, tableTop + 20).stroke();
      
      // Draw items
      let yPosition = tableTop + 25;
      let alternate = false;
      
      // Check if items exist
      if (invoice.items && invoice.items.length > 0) {
        invoice.items.forEach((item, index) => {
          // Draw alternating row backgrounds
          if (alternate) {
            doc.fillColor('#F7FAFC').rect(50, yPosition, tableWidth, 25).fill();
          }
          alternate = !alternate;
          
          // Draw item data
          doc.fillColor('#4A5568').fontSize(9)
            .text(item.name || '', 60, yPosition + 5, { width: 200 })
            .text(item.description || '', 260, yPosition + 5, { width: 130 })
            .text(item.quantity.toString(), 390, yPosition + 5, { width: 50, align: 'center' })
            .text(`$${(item.price || 0).toFixed(2)}`, 440, yPosition + 5, { width: 50, align: 'right' })
            .text(`$${((item.price || 0) * (item.quantity || 1)).toFixed(2)}`, 490, yPosition + 5, { width: 50, align: 'right' });
          
          // Draw horizontal line
          doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(50, yPosition + 25).lineTo(550, yPosition + 25).stroke();
          
          yPosition += 25;
        });
      } else {
        // No items message
        doc.fillColor('#4A5568').fontSize(9).text('No items', 60, yPosition + 5);
        yPosition += 25;
      }
      
      // TOTALS SECTION
      yPosition += 10;
      
      // Draw totals background
      doc.fillColor('#F7FAFC').rect(350, yPosition, 200, 80).fill();
      
      // Subtotal
      doc.fillColor('#4A5568').fontSize(10)
        .text('Subtotal:', 370, yPosition + 10, { width: 100 })
        .text(`$${(invoice.subtotal || 0).toFixed(2)}`, 470, yPosition + 10, { width: 70, align: 'right' });
      
      // Tax
      const taxRate = invoice.taxRate || 0;
      const taxPercent = (taxRate * 100).toFixed(0);
      doc.fillColor('#4A5568').fontSize(10)
        .text(`Tax (${taxPercent}%):`, 370, yPosition + 30, { width: 100 })
        .text(`$${(invoice.taxAmount || 0).toFixed(2)}`, 470, yPosition + 30, { width: 70, align: 'right' });
      
      // Draw line before total
      doc.strokeColor('#CBD5E0').lineWidth(1).moveTo(370, yPosition + 50).lineTo(540, yPosition + 50).stroke();
      
      // Total
      doc.fillColor('#2D3748').fontSize(12).font('Helvetica-Bold')
        .text('TOTAL:', 370, yPosition + 55, { width: 100 })
        .text(`$${(invoice.total || 0).toFixed(2)}`, 470, yPosition + 55, { width: 70, align: 'right' });
      
      // FOOTER SECTION
      const footerTop = yPosition + 100;
      
      // Thank you message
      doc.fillColor('#2D3748').fontSize(10).text('Thank you for your business!', 50, footerTop + 30);
      
      // Legal note - use proper organizer name from earlier extraction
      doc.fillColor('#718096').fontSize(8)
        .text(`This invoice was issued by ${orgName}.`, 50, footerTop + 50)
        .text('MyExpo platform is not responsible for this invoice.', 50, footerTop + 60);
      
      // Finalize document
      doc.end();
      
      // Wait for the stream to finish
      await new Promise<void>((resolve, reject) => {
        stream.on('finish', () => resolve());
        stream.on('error', reject);
      });
      
      // Return relative path to the PDF
      return filename;
    } catch (error) {
      this.logger.error(`Error generating PDF for invoice ${invoiceId}: ${error.message}`);
      throw error;
    }
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