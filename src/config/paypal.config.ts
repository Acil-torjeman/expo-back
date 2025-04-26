import { registerAs } from '@nestjs/config';

export default registerAs('paypal', () => {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const mode = process.env.PAYPAL_MODE || 'sandbox';
  
  // Log environment validation (without exposing secrets)
  if (!clientId || !clientSecret) {
    console.warn('PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET environment variables are missing!');
  }
  
  return {
    clientId,
    clientSecret,
    mode,
    returnUrl: process.env.PAYPAL_RETURN_URL || 'http://localhost:5174/exhibitor/payments/success',
    cancelUrl: process.env.PAYPAL_CANCEL_URL || 'http://localhost:5174/exhibitor/payments/cancel',
    webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
  };
});