import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

// Configuration de la connexion MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/expomanagement';

async function resetPasswords() {
  console.log('Connexion à MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connecté à MongoDB');
  
  const saltRounds = 10;
  const defaultPassword = 'Test123!';
  
  try {
    // Hasher le mot de passe avec bcrypt
    const hashedPassword = await bcrypt.hash(defaultPassword, saltRounds);
    
    console.log('Nouveau hash bcrypt généré :', hashedPassword);
    
    // Mettre à jour TOUS les utilisateurs dans la base de données
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection is not established');
    }
    const result = await db.collection('users').updateMany(
      {}, // Tous les utilisateurs
      { $set: { password: hashedPassword } }
    );
    
    console.log(`${result.modifiedCount} mots de passe d'utilisateurs réinitialisés avec succès`);
    console.log(`Le mot de passe par défaut est maintenant: ${defaultPassword}`);
  } catch (error) {
    console.error('Erreur lors de la réinitialisation des mots de passe:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Déconnecté de MongoDB');
  }
}

// Exécuter la réinitialisation
resetPasswords()
  .then(() => console.log('Opération terminée'))
  .catch(err => console.error('Erreur lors de l\'opération:', err));