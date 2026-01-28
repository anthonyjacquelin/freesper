const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Read package.json for version and product name
const packageJson = require('../package.json');
const version = packageJson.version;
const productName = packageJson.build.productName;

// Get update server URL from environment
const updateServerUrl = process.env.UPDATE_SERVER_URL;
if (!updateServerUrl) {
  console.error('❌ UPDATE_SERVER_URL environment variable is not set');
  console.error('   Please create a .env file (see .env.example)');
  console.error('   or set UPDATE_SERVER_URL in your environment');
  process.exit(1);
}

// Path to built ZIP
const distPath = path.join(__dirname, '../dist');
const zipFile = `${productName}-${version}-arm64-mac.zip`;
const zipPath = path.join(distPath, zipFile);

console.log('🔍 Generating update manifest for version', version);
console.log('📁 Looking for:', zipPath);

if (!fs.existsSync(zipPath)) {
  console.error(`❌ ZIP file not found: ${zipPath}`);
  console.error('   Available files in dist/:');

  if (fs.existsSync(distPath)) {
    const files = fs.readdirSync(distPath);
    files.forEach(file => {
      console.error(`     - ${file}`);
    });
  } else {
    console.error('   dist/ directory does not exist');
  }

  console.error('');
  console.error('   Run "npm run build" first');
  process.exit(1);
}

// Calculate SHA512
console.log('🔐 Calculating SHA512...');
const fileBuffer = fs.readFileSync(zipPath);
const sha512 = crypto.createHash('sha512').update(fileBuffer).digest('base64');
const size = fs.statSync(zipPath).size;

// Generate manifest
const manifest = {
  version: version,
  releaseDate: new Date().toISOString(),
  releaseNotes: "Bug fixes and improvements", // TODO: Read from CHANGELOG.md
  platforms: {
    "darwin-arm64": {
      url: `${updateServerUrl}${zipFile}`,
      sha512: sha512,
      size: size
    }
  },
  minimumVersion: "1.0.0"
};

// Write to dist/
const manifestPath = path.join(distPath, 'latest-mac.yml');
const ymlContent = `version: ${version}
releaseDate: '${manifest.releaseDate}'
files:
  - url: ${zipFile}
    sha512: ${sha512}
    size: ${size}
path: ${zipFile}
sha512: ${sha512}
releaseDate: '${manifest.releaseDate}'
`;

fs.writeFileSync(manifestPath, ymlContent);

console.log('✅ Update manifest generated:', manifestPath);
console.log('');
console.log('📦 Files to upload:');
console.log(`   - ${zipFile}`);
console.log(`   - ${productName}-${version}-arm64.dmg`);
console.log(`   - latest-mac.yml`);
console.log('');
console.log('🌐 Upload to:', updateServerUrl);
console.log('');
console.log('📝 Manifest content:');
console.log(ymlContent);
