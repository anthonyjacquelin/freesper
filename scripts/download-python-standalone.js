#!/usr/bin/env node

/**
 * Download python-build-standalone for macOS ARM64
 * This script runs during npm run build to fetch a relocatable Python runtime
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Python standalone version to download
const PYTHON_VERSION = '3.11.9';
const PYTHON_BUILD = '20240713';
const ARCH = 'aarch64-apple-darwin'; // ARM64 macOS

const DOWNLOAD_URL = `https://github.com/indygreg/python-build-standalone/releases/download/${PYTHON_BUILD}/cpython-${PYTHON_VERSION}+${PYTHON_BUILD}-${ARCH}-install_only.tar.gz`;

const PYTHON_DIR = path.join(__dirname, '..', 'python');
const DOWNLOAD_PATH = path.join(PYTHON_DIR, 'python.tar.gz');

console.log('📦 Downloading Python standalone runtime...');
console.log(`   Version: ${PYTHON_VERSION}`);
console.log(`   Architecture: ARM64 (Apple Silicon)`);
console.log('');

// Create python directory
if (!fs.existsSync(PYTHON_DIR)) {
  fs.mkdirSync(PYTHON_DIR, { recursive: true });
}

/**
 * Download file with progress
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    let receivedBytes = 0;
    let totalBytes = 0;

    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(response.headers.location, dest)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
      }

      totalBytes = parseInt(response.headers['content-length'], 10);

      response.on('data', (chunk) => {
        receivedBytes += chunk.length;
        const percent = ((receivedBytes / totalBytes) * 100).toFixed(1);
        const mb = (receivedBytes / 1024 / 1024).toFixed(1);
        const totalMb = (totalBytes / 1024 / 1024).toFixed(1);
        process.stdout.write(`\r   Downloading: ${percent}% (${mb}/${totalMb} MB)`);
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log('\n✓ Download complete');
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

/**
 * Extract tar.gz archive
 */
function extractTarGz(archivePath, outputDir) {
  console.log('📂 Extracting Python runtime...');
  try {
    execSync(`tar -xzf "${archivePath}" -C "${outputDir}"`, {
      stdio: 'inherit'
    });
    console.log('✓ Extraction complete');
  } catch (err) {
    throw new Error(`Extraction failed: ${err.message}`);
  }
}

/**
 * Clean up downloaded archive
 */
function cleanup() {
  if (fs.existsSync(DOWNLOAD_PATH)) {
    fs.unlinkSync(DOWNLOAD_PATH);
    console.log('✓ Cleaned up temporary files');
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    const pythonBinPath = path.join(PYTHON_DIR, 'python', 'bin', 'python3');

    // Check if Python is already installed
    if (fs.existsSync(pythonBinPath)) {
      console.log('✓ Python already downloaded and extracted');
      console.log(`   Location: ${pythonBinPath}`);

      // Test Python
      console.log('🧪 Testing Python installation...');
      const version = execSync(`"${pythonBinPath}" --version`, { encoding: 'utf-8' }).trim();
      console.log(`✓ ${version}`);
    } else {
      // Download Python
      await downloadFile(DOWNLOAD_URL, DOWNLOAD_PATH);

      // Extract
      extractTarGz(DOWNLOAD_PATH, PYTHON_DIR);

      // Cleanup
      cleanup();

      // Verify installation
      if (!fs.existsSync(pythonBinPath)) {
        throw new Error('Python binary not found after extraction');
      }

      // Test Python
      console.log('🧪 Testing Python installation...');
      const version = execSync(`"${pythonBinPath}" --version`, { encoding: 'utf-8' }).trim();
      console.log(`✓ ${version}`);

      console.log('');
      console.log('✅ Python standalone successfully installed');
      console.log(`   Location: ${PYTHON_DIR}`);
      console.log(`   Binary: ${pythonBinPath}`);
    }

    console.log('');
    console.log('✅ Python runtime ready for packaging');
    console.log('   Note: Python packages will be installed on first app launch');

  } catch (err) {
    console.error('');
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
