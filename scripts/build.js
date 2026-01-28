#!/usr/bin/env node

/**
 * Build script that injects UPDATE_SERVER_URL into package.json before building
 * This is necessary because electron-builder doesn't read env vars for ${} macros
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load .env
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const packageJsonPath = path.join(__dirname, '../package.json');

function main() {
  const updateServerUrl = process.env.UPDATE_SERVER_URL;
  
  if (!updateServerUrl) {
    console.error('❌ UPDATE_SERVER_URL is not defined in .env');
    process.exit(1);
  }

  // Read package.json
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const originalUrl = packageJson.build.publish[0].url;

  // Inject the URL
  packageJson.build.publish[0].url = updateServerUrl;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  
  console.log(`✓ Injected UPDATE_SERVER_URL into package.json`);

  try {
    // Run electron-builder with env vars
    execSync('npx electron-builder', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        // Ensure Apple credentials are passed
        APPLE_ID: process.env.APPLE_ID,
        APPLE_APP_SPECIFIC_PASSWORD: process.env.APPLE_APP_SPECIFIC_PASSWORD
      }
    });
  } finally {
    // Restore original package.json
    packageJson.build.publish[0].url = originalUrl;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log('✓ Restored package.json');
  }
}

main();
