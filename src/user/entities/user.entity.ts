// src/user/entities/user.entity.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as argon2 from 'argon2';

/**
 * Énumération des rôles d'utilisateur possibles
 */
export enum UserRole {
  ADMIN = 'admin',         // Administrateur système
  ORGANIZER = 'organizer', // Organisateur d'événements
  EXHIBITOR = 'exhibitor', // Exposant
}

/**
 * Énumération des statuts possibles pour un compte utilisateur
 */
export enum UserStatus {
  PENDING = 'pending',     // En attente d'activation/vérification
  ACTIVE = 'active',       // Compte actif et utilisable
  INACTIVE = 'inactive',   // Compte désactivé temporairement
  REJECTED = 'rejected',   // Compte rejeté par un administrateur
}

/**
 * Schéma de l'entité Utilisateur
 */
@Schema({ timestamps: true }) // Ajoute automatiquement createdAt et updatedAt
export class User extends Document {
  @Prop({ 
    required: true,
    // Ajoute un index et transforme en minuscules pour une recherche insensible à la casse
    index: true,
   
  })
  email: string;

  @Prop({ required: true })
  password: string;
  
  @Prop({ required: true })
  username: string;

  @Prop({ enum: UserRole, default: UserRole.EXHIBITOR })
  role: UserRole;

  @Prop({ enum: UserStatus, default: UserStatus.PENDING })
  status: UserStatus;

  @Prop({ default: false })
  emailVerified: boolean;

  @Prop()
  verificationToken?: string;

  @Prop()
  passwordResetToken?: string;

  @Prop()
  passwordResetExpires?: Date;

  // Champs additionnels qui pourraient être utiles
  @Prop()
  lastLogin?: Date;

  @Prop({ default: 0 })
  loginAttempts: number;

  @Prop()
  lockUntil?: Date;

  // Fields for soft deletion
  @Prop({ default: false })
  deleted: boolean;

  @Prop()
  deletedAt?: Date;
}

// Modification du hook pre-save pour éviter le double hachage
export const UserSchema = SchemaFactory.createForClass(User).pre("save", async function() {
  // Ne hacher que si le mot de passe est modifié et n'est pas déjà haché
  if (this.isModified('password') && !this.password.startsWith('$argon2id$')) {
    // Utiliser des paramètres explicites pour assurer la cohérence
    this.password = await argon2.hash(this.password, {
      type: argon2.argon2id,
      memoryCost: 65536,  // m=65536
      timeCost: 3,        // t=3
      parallelism: 4      // p=4
    });
  }
});