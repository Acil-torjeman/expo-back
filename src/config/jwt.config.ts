// src/config/jwt.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => {
  // Get JWT secret from environment or use a fallback (only for development)
  const jwtSecret = process.env.JWT_SECRET;
  
  if (!jwtSecret || jwtSecret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production mode and must be at least 32 characters');
    } else {
      console.warn(
        'WARNING: JWT_SECRET is missing or too short! Using a fallback secret. ' +
        'This is insecure and should only be used in development.'
      );
    }
  }
  
  return {
    secret: jwtSecret,
    signOptions: {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      issuer: 'expomanagement',
      audience: 'expomanagement-users',
    },
    verifyOptions: {
      issuer: 'expomanagement',
      audience: 'expomanagement-users',
    }
  };
});