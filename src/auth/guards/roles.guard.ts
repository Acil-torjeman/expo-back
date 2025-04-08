// src/auth/guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../user/entities/user.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    
    // Si aucun rôle n'est requis, autoriser l'accès
    if (!requiredRoles) {
      this.logger.log('No roles required for this route, access granted');
      return true;
    }
    
    // Vérifier si l'utilisateur a le rôle requis
    const request = context.switchToHttp().getRequest();
    const { user } = request;

    if (!user) {
      this.logger.error('No user object found in request');
      return false;
    }

    this.logger.log(`User roles check - User: ${JSON.stringify({id: user.id, role: user.role})}, Required Roles: ${JSON.stringify(requiredRoles)}`);
    
    // Get the current path and method for logging
    const path = request.route?.path || 'unknown';
    const method = request.method || 'unknown';
    
    // Check if the user's role is in the required roles
    const hasRole = requiredRoles.some((role) => {
      const roleMatches = user.role === role;
      this.logger.log(`Checking role ${role} against user role ${user.role}: ${roleMatches}`);
      return roleMatches;
    });
    
    if (hasRole) {
      this.logger.log(`Access GRANTED to ${method} ${path} for user ${user.id} with role ${user.role}`);
    } else {
      this.logger.error(`Access DENIED to ${method} ${path} for user ${user.id} with role ${user.role} - Required roles: ${requiredRoles.join(', ')}`);
    }
    
    return hasRole;
  }
}