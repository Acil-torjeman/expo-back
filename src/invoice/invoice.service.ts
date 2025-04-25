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
    // Ensure invoices directory exists with correct permissions
    this.logger.log(`Ensuring invoices directory exists at: ${this.pdfStoragePath}`);
    try {
      // Créer le chemin complet si nécessaire
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
 * Vérifier si un utilisateur est le propriétaire d'une facture
 * @param invoiceId ID de la facture
 * @param userId ID de l'utilisateur
 * @returns true si l'utilisateur est propriétaire de la facture, false sinon
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
    
    // Extract exhibitor ID
    const exhibitorId = registration.exhibitor._id;
    
    // Get event and organizer details
    const event = await this.eventModel.findById(registration.event._id).exec();
    
    if (!event) {
      throw new NotFoundException(`Event with ID ${registration.event._id} not found`);
    }
    
    // Extract organizer ID from event
    const organizerId = event.organizer;
    
    // Get organizer details with fallback
    let organizer;
    try {
      organizer = await this.organizerModel.findById(organizerId)
        .populate('user')
        .exec();
      
      if (!organizer) {
        this.logger.error(`Organizer with ID ${organizerId} not found, using fallback information`);
        // Créer un organizer fallback avec des informations minimales
        organizer = {
          organizationName: 'Event Organizer',
          organizationAddress: 'Default Address',
          postalCity: 'Default City',
          country: 'Default Country',
          contactPhoneCode: '',
          contactPhone: '',
          user: { email: 'admin@example.com' }
        };
      }
    } catch (error) {
      this.logger.error(`Error fetching organizer ${organizerId}: ${error.message}`);
      // Créer un organizer fallback avec des informations minimales
      organizer = {
        organizationName: 'Event Organizer',
        organizationAddress: 'Default Address',
        postalCity: 'Default City',
        country: 'Default Country',
        contactPhoneCode: '',
        contactPhone: '',
        user: { email: 'admin@example.com' }
      };
    }
    
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
            
            const equipId = typeof equipment === 'object' ? 
              equipment._id?.toString() : 
              String(equipment || '');
              
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
    const taxRate = 0.20; // 20% tax rate
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;
    
    // Create organizer prefix for invoice number (first 3 chars of org name)
    const orgName = typeof organizer === 'object' ? organizer.organizationName : 'ORG';
    const orgPrefix = orgName?.substring(0, 3).toUpperCase() || 'INV';
    
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
    
    try {
      // Generate PDF
      const pdfPath = await this.generateInvoicePDF(savedInvoice._id.toString());
      
      // Update invoice with PDF path
      savedInvoice.pdfPath = pdfPath;
      await savedInvoice.save();
    } catch (pdfError) {
      this.logger.error(`Error generating PDF for invoice ${savedInvoice._id}: ${pdfError.message}`);
      // Continue without PDF, it can be generated later
    }
    
    return savedInvoice;
  } catch (error) {
    this.logger.error(`Error creating invoice for registration ${registrationId}: ${error.message}`);
    throw error;
  }
}
  
  /**
   * Generate PDF for an invoice - Simple version without payment details
   */
  async generateInvoicePDF(invoiceId: string): Promise<string> {
    try {
      // Get invoice with all required data
      const invoice = await this.invoiceModel.findById(invoiceId)
        .populate('exhibitor')
        .populate('organizer')
        .populate('event')
        .exec();
      
      if (!invoice) {
        throw new NotFoundException(`Invoice with ID ${invoiceId} not found`);
      }
      
      // Get exhibitor details, handling possible missing data
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
      
      // Get organizer details, handling possible missing data
      let organizer;
      try {
        organizer = await this.organizerModel.findById(invoice.organizer)
          .populate('user')
          .exec();
      } catch (error) {
        this.logger.error(`Error fetching organizer: ${error.message}`);
        organizer = {
          organizationName: 'Event Organizer',
          organizationAddress: 'Unknown Address',
          postalCity: 'Unknown City',
          country: 'Unknown Country',
          user: { email: 'unknown@example.com' }
        };
      }
      
      // PDF filename
      const filename = `${invoice.invoiceNumber}.pdf`;
      const pdfPath = path.join(this.pdfStoragePath, filename);
      
      // Create PDF document
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4'
      });
      
      // Ensure the directory exists
      fs.ensureDirSync(this.pdfStoragePath);
      
      // Pipe to file
      const stream = fs.createWriteStream(pdfPath);
      doc.pipe(stream);
      
      // HEADER SECTION
      
      // Add organizer logo if available
      if (organizer?.organizationLogoPath) {
        const logoPath = path.join(process.cwd(), 'uploads/organization-logos', organizer.organizationLogoPath);
        if (fs.existsSync(logoPath)) {
          try {
            doc.image(logoPath, 50, 45, { width: 150 });
          } catch (error) {
            this.logger.error(`Error adding logo to PDF: ${error.message}`);
          }
        }
      }
      
      // Add invoice title
      doc.fontSize(24).fillColor('#2D3748').text('INVOICE', 450, 45, { align: 'right' });
      doc.fontSize(10).fillColor('#718096').text(`INVOICE #: ${invoice.invoiceNumber}`, 450, 75, { align: 'right' });
      
      // Format date safely
      const createdAt = invoice.createdAt ? new Date(invoice.createdAt) : new Date();
      doc.fontSize(10).fillColor('#718096').text(`DATE: ${createdAt.toLocaleDateString()}`, 450, 90, { align: 'right' });
      
      // Reste du code PDF...
      
      // Continue avec tout le code de génération de PDF, en gérant les cas où les données peuvent être manquantes
      
      // Finalize document
      doc.end();
      
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