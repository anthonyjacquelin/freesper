#!/usr/bin/env node

/**
 * Script pour vérifier que les variables d'environnement sont correctement configurées
 * Usage: node scripts/check-env.js
 */

const fs = require('fs');
const path = require('path');

// Colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkEnvFile() {
  const envPath = path.join(__dirname, '../.env');

  if (!fs.existsSync(envPath)) {
    log('red', '❌ Fichier .env introuvable');
    log('yellow', '\nCréez un fichier .env à partir de .env.example:');
    log('blue', '  cp .env.example .env');
    log('yellow', '\nPuis éditez-le avec vos valeurs.');
    return false;
  }

  log('green', '✓ Fichier .env trouvé');
  return true;
}

function checkVariables() {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });

  const requiredVars = {
    'UPDATE_SERVER_URL': {
      description: 'URL du serveur de mise à jour',
      example: 'http://your-server.com/bucket/',
      required: true
    }
  };

  const optionalVars = {
    'MINIO_ENDPOINT': {
      description: 'URL du serveur MinIO',
      example: 'http://your-minio-server.com'
    },
    'MINIO_BUCKET': {
      description: 'Nom du bucket MinIO',
      example: 'freesper'
    },
    'MINIO_ACCESS_KEY': {
      description: 'Clé d\'accès MinIO',
      example: 'your-access-key'
    },
    'MINIO_SECRET_KEY': {
      description: 'Clé secrète MinIO',
      example: 'your-secret-key'
    },
    'APPLE_ID': {
      description: 'Apple ID pour la notarization',
      example: 'your-email@example.com'
    },
    'APPLE_APP_SPECIFIC_PASSWORD': {
      description: 'Mot de passe d\'app Apple',
      example: 'xxxx-xxxx-xxxx-xxxx'
    }
  };

  console.log('\n📋 Vérification des variables d\'environnement:\n');

  let hasErrors = false;
  let hasWarnings = false;

  // Check required variables
  for (const [varName, config] of Object.entries(requiredVars)) {
    const value = process.env[varName];

    if (!value || value.trim() === '') {
      log('red', `❌ ${varName} (requis)`);
      log('yellow', `   ${config.description}`);
      log('blue', `   Exemple: ${config.example}`);
      hasErrors = true;
    } else {
      log('green', `✓ ${varName}`);

      // Validate URL format
      if (varName === 'UPDATE_SERVER_URL') {
        if (!value.endsWith('/')) {
          log('yellow', '  ⚠️  L\'URL devrait se terminer par un /');
          hasWarnings = true;
        }
        if (!value.startsWith('http://') && !value.startsWith('https://')) {
          log('yellow', '  ⚠️  L\'URL devrait commencer par http:// ou https://');
          hasWarnings = true;
        }
      }
    }
  }

  console.log('');

  // Check optional variables
  const hasMinioVars = process.env.MINIO_ENDPOINT || process.env.MINIO_BUCKET;

  if (hasMinioVars) {
    console.log('📦 Variables MinIO (optionnelles):');
    for (const [varName, config] of Object.entries(optionalVars)) {
      if (varName.startsWith('MINIO_') || varName.startsWith('APPLE_')) {
        const value = process.env[varName];
        if (value && value.trim() !== '') {
          log('green', `✓ ${varName}`);
        } else if (varName.startsWith('MINIO_')) {
          log('yellow', `○ ${varName} (optionnel, non défini)`);
        }
      }
    }
    console.log('');
  }

  // Summary
  if (hasErrors) {
    log('red', '\n❌ Configuration incomplète!');
    log('yellow', '\nÉditez votre fichier .env et définissez les variables requises.');
    log('yellow', 'Consultez .env.example ou docs/AUTO_UPDATE_SETUP.md pour plus d\'aide.');
    return false;
  } else if (hasWarnings) {
    log('yellow', '\n⚠️  Configuration valide mais avec des avertissements');
    return true;
  } else {
    log('green', '\n✅ Configuration valide!');
    return true;
  }
}

function main() {
  console.log('🔍 Vérification de la configuration de mise à jour\n');

  if (!checkEnvFile()) {
    process.exit(1);
  }

  if (!checkVariables()) {
    process.exit(1);
  }

  console.log('\n📚 Pour plus d\'informations:');
  console.log('   - UPDATE_GUIDE.md : Guide d\'utilisation');
  console.log('   - docs/AUTO_UPDATE_SETUP.md : Configuration détaillée');
  console.log('');
}

main();
