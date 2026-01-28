const { autoUpdater } = require('electron-updater');
const { app } = require('electron');

class UpdateManager {
  constructor() {
    this.updateAvailable = false;
    this.updateInfo = null;
    this.currentProgressCallback = null;

    // Configuration
    autoUpdater.autoDownload = false; // L'utilisateur choisit
    autoUpdater.autoInstallOnAppQuit = true;

    // Logging
    autoUpdater.logger = console;

    // Mode dev: serveur local
    if (process.argv.includes('--dev')) {
      console.log('🔧 Update manager in DEV mode - using localhost:8080');
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: 'http://localhost:8080'
      });
    }

    // Event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    autoUpdater.on('checking-for-update', () => {
      console.log('🔄 Checking for updates...');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('✅ Update available:', info.version);
      this.updateAvailable = true;
      this.updateInfo = info;
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('ℹ️ No update available. Current version:', info.version);
      this.updateAvailable = false;
    });

    autoUpdater.on('error', (err) => {
      console.error('❌ Update error:', err);
      this.updateAvailable = false;
    });

    autoUpdater.on('download-progress', (progressObj) => {
      const percent = Math.round(progressObj.percent);
      console.log(`📥 Downloading update... ${percent}%`);
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('✅ Update downloaded:', info.version);
    });
  }

  async checkForUpdates() {
    try {
      const result = await autoUpdater.checkForUpdates();
      return result;
    } catch (error) {
      console.error('Update check failed:', error);
      return null;
    }
  }

  downloadUpdate(progressCallback) {
    // Remove previous progress callback to prevent listener accumulation
    if (this.currentProgressCallback) {
      autoUpdater.removeListener('download-progress', this.currentProgressCallback);
    }
    
    // Store and register new callback
    this.currentProgressCallback = progressCallback;
    if (progressCallback) {
      autoUpdater.on('download-progress', progressCallback);
    }
    
    return autoUpdater.downloadUpdate();
  }

  quitAndInstall() {
    // false = don't force quit
    // true = restart app after install
    autoUpdater.quitAndInstall(false, true);
  }

  scheduleInstallOnQuit() {
    autoUpdater.autoInstallOnAppQuit = true;
  }

  getCurrentVersion() {
    return app.getVersion();
  }
}

module.exports = UpdateManager;
