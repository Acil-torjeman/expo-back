/**
 * Outil pour réinitialiser un mot de passe directement dans la base de données
 * Utilisez cet outil en dernier recours si le problème persiste
 * Exécutez avec: npx ts-node tools/reset-password.ts
 */

import * as mongoose from 'mongoose';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

// Configuration de la connexion MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/expomanagement';

async function resetPassword() {
  console.log('Connexion à MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connecté à MongoDB');
  
  const email = 'mohamed@gmail.com'; // Email de l'utilisateur à modifier
  const newPassword = 'Test123!'; // Nouveau mot de passe
  
  try {
    // Hasher le nouveau mot de passe avec les paramètres EXACTS corrects
    const hashedPassword = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MiB (m=65536)
      timeCost: 3,         // 3 iterations (t=3)
      parallelism: 4,      // 4 threads (p=4)
    });
    
    console.log('Nouveau hash généré :', hashedPassword);
    
    // Mettre à jour l'utilisateur dans la base de données
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection is not established');
    }
    const result = await db.collection('users').updateOne(
      { email: email },
      { $set: { password: hashedPassword } }
    );
    
    if (result.matchedCount === 0) {
      console.error(`Utilisateur avec l'email ${email} non trouvé`);
    } else if (result.modifiedCount === 0) {
      console.warn(`Mot de passe inchangé pour ${email}`);
    } else {
      console.log(`Mot de passe réinitialisé avec succès pour ${email}`);
    }
  } catch (error) {
    console.error('Erreur lors de la réinitialisation du mot de passe:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Déconnecté de MongoDB');
  }
}

// Exécuter la réinitialisation
resetPassword()
  .then(() => console.log('Opération terminée'))
  .catch(err => console.error('Erreur lors de l\'opération:', err));