// src/config/paypal.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('paypal', () => {
  return {
    clientId: process.env.PAYPAL_CLIENT_ID || 'sandbox-client-id',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || 'sandbox-client-secret',
    mode: process.env.PAYPAL_MODE || 'sandbox',
    returnUrl: process.env.PAYPAL_RETURN_URL || `${process.env.FRONTEND_URL}/exhibitor/payments/success`,
    cancelUrl: process.env.PAYPAL_CANCEL_URL || `${process.env.FRONTEND_URL}/exhibitor/payments/cancel`,
    webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
  };
});