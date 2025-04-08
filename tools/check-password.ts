/**
 * Outil de test pour vérifier la validation de mot de passe Argon2
 * Créez ce fichier dans un dossier "tools" de votre projet
 * Exécutez-le avec: npx ts-node tools/check-password.ts
 */

import * as argon2 from 'argon2';

async function checkPassword() {
  // Mot de passe stocké (copié depuis les logs)
  const storedHash = '$argon2id$v=19$m=65536,t=3,p=4$jFYsDG4BBjR34TITkb1ikA$28PyHHRPuEfe4ddBX2MkqN4miwwTy8VzuZSrOk8WV7Y';
  
  // Mot de passe fourni
  const providedPassword = 'Test123!';
  
  try {
    // Vérifier avec la méthode Argon2 standard
    const result = await argon2.verify(storedHash, providedPassword);
    console.log('Résultat standard:', result);
    
    // Créer un nouveau hash avec les mêmes paramètres pour tester
    const newHash = await argon2.hash(providedPassword, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MiB (m=65536)
      timeCost: 3,         // 3 iterations (t=3) 
      parallelism: 4,      // 1 threads (p=1)
    });
    
    console.log('\nNouveau hash:', newHash);
    console.log('Structure du hash:', parseArgon2Hash(newHash));
    
    // Vérifier si les paramètres sont corrects pour le hash stocké
    console.log('\nStructure du hash stocké:', parseArgon2Hash(storedHash));
    
  } catch (error) {
    console.error('Erreur lors de la vérification du mot de passe:', error);
  }
}

// Fonction utilitaire pour analyser un hash Argon2
function parseArgon2Hash(hash: string) {
  const parts = hash.split('$');
  return {
    variant: parts[1],
    version: parts[2],
    parameters: parts[3],
    salt: parts[4],
    hash: parts[5],
  };
}

// Exécuter le test
checkPassword()
  .then(() => console.log('Test terminé'))
  .catch(err => console.error('Erreur lors du test:', err));