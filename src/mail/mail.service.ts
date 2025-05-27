// src/mail/mail.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  sendRegistrationCancelled(email: string, arg1: { eventName: string; exhibitorName: string; cancelledBy: string; reason: string; }) {
    throw new Error('Method not implemented.');
  }
  private transporter;
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {
    // Initialize mail transporter
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST'),
      port: this.configService.get<number>('MAIL_PORT'),
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASSWORD'),
      },
    });
  }

  /**
   * Send registration approval email
   */
  async sendRegistrationApproved(
    to: string,
    data: {
      eventName: string;
      exhibitorName: string;
      message: string;
      nextSteps: string;
    }
  ): Promise<boolean> {
    this.logger.log(`Sending registration approval email to ${to}`);
    
    const subject = `Registration Approved for ${data.eventName}`;
    
    const html = `
      <h1>Your Registration is Approved!</h1>
      <p>Dear ${data.exhibitorName},</p>
      <p>We are pleased to inform you that your registration for <strong>${data.eventName}</strong> has been approved.</p>
      <p>${data.message}</p>
      <h2>Next Steps</h2>
      <p>${data.nextSteps}</p>
      <p>Thank you for your participation.</p>
    `;
    
    return this.sendMail(to, subject, html);
  }

  /**
   * Send registration rejection email
   */
  async sendRegistrationRejected(
    to: string,
    data: {
      eventName: string;
      exhibitorName: string;
      reason: string;
    }
  ): Promise<boolean> {
    this.logger.log(`Sending registration rejection email to ${to}`);
    
    const subject = `Registration Status for ${data.eventName}`;
    
    const html = `
      <h1>Registration Update</h1>
      <p>Dear ${data.exhibitorName},</p>
      <p>We regret to inform you that your registration for <strong>${data.eventName}</strong> has not been approved.</p>
      <p><strong>Reason:</strong> ${data.reason}</p>
      <p>If you have any questions, please don't hesitate to contact the event organizer.</p>
    `;
    
    return this.sendMail(to, subject, html);
  }

  /**
   * Send generic email
   */
  private async sendMail(to: string, subject: string, html: string): Promise<boolean> {
    try {
      const mailOptions = {
        from: this.configService.get<string>('MAIL_FROM'),
        to,
        subject,
        html,
      };
      
      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`);
      return false;
    }
  }
}