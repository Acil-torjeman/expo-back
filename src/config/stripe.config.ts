import { registerAs } from '@nestjs/config';


export default registerAs('stripe', () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publicKey = process.env.STRIPE_PUBLIC_KEY;
  
  if (!secretKey || !publicKey) {
    console.warn('STRIPE_SECRET_KEY or STRIPE_PUBLIC_KEY environment variables are missing!');
  }
  
  return {
    secretKey,
    publicKey,
    successUrl: process.env.STRIPE_SUCCESS_URL || 'http://localhost:5174/exhibitor/payments/success',
    cancelUrl: process.env.STRIPE_CANCEL_URL || 'http://localhost:5174/exhibitor/payments/cancel',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  };
});