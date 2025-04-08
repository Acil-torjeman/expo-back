// src/auth/guards/jwt-auth.guard.ts
import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector = new Reflector()) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // Check if the route is public (has IsPublic decorator)
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (isPublic) {
      return true;
    }
    
    // Call parent method which will validate the JWT
    return super.canActivate(context);
  }

  handleRequest(err, user, info) {
    // If there was an error, an exception, or no user, throw an error
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication failed');
    }
    
    // Ensure user ID is always a string
    if (user && user.id) {
      user.id = String(user.id).trim();
    }
    
    // Return the user for the next handler
    return user;
  }
}