const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, clipboard, systemPreferences, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const AudioRecorder = require('./modules/audioRecorder');
const InferenceEngine = require('./modules/inferenceEngine');
const ModelManager = require('./modules/modelManager');
const SoundManager = require('./modules/soundManager');
const PythonManager = require('./modules/pythonManager');

// Initialize store for settings
const store = new Store();

// === FILE LOGGING FOR PACKAGED APP ===
// Redirect console.log/error to a file for debugging packaged app
let logFile = null;
function initFileLogging() {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logPath = path.join(logDir, `freesper-${new Date().toISOString().split('T')[0]}.log`);
    logFile = fs.createWriteStream(logPath, { flags: 'a' });
    
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    
    const timestamp = () => new Date().toISOString();
    
    console.log = (...args) => {
      const msg = `[${timestamp()}] [LOG] ${args.join(' ')}\n`;
      if (logFile) logFile.write(msg);
      originalLog.apply(console, args);
    };
    
    console.error = (...args) => {
      const msg = `[${timestamp()}] [ERROR] ${args.join(' ')}\n`;
      if (logFile) logFile.write(msg);
      originalError.apply(console, args);
    };
    
    console.warn = (...args) => {
      const msg = `[${timestamp()}] [WARN] ${args.join(' ')}\n`;
      if (logFile) logFile.write(msg);
      originalWarn.apply(console, args);
    };
    
    console.log('=== freesper started ===');
    console.log('Log file:', logPath);
    console.log('App version:', app.getVersion());
    console.log('Electron version:', process.versions.electron);
    console.log('Is packaged:', app.isPackaged);
  } catch (err) {
    // Silently fail if logging setup fails
  }
}

// Initialize logging early
if (app.isPackaged) {
  // For packaged app, logging will be initialized in the main whenReady handler
  // to ensure it runs before other initialization code
} else {
  // For dev mode, just use console
  console.log('Dev mode - using console logging');
}
let tray = null;
let mainWindow = null;
let recordingWindow = null;
let setupWindow = null;
let audioRecorder = null;
let inferenceEngine = null;
let modelManager = null;
let soundManager = null;
let pythonManager = null;
let hasAccessibilityPermission = false;

// Recording state
let isRecording = false;
let isProcessing = false; // Prevent double processing

/**
 * Check and request Accessibility permissions on macOS
 * Required for auto-paste functionality (simulating Cmd+V)
 */
async function checkAccessibilityPermissions() {
  console.log('🔍 Checking accessibility permissions...');
  
  if (process.platform !== 'darwin') {
    hasAccessibilityPermission = true;
    console.log('   Platform is not macOS, permissions granted by default');
    return true;
  }

  // In dev mode, skip permission dialog (Electron won't appear in System Preferences)
  const isPackaged = app.isPackaged;
  const isDevMode = !isPackaged; // Dev mode = not packaged
  console.log('   Dev mode:', isDevMode);
  console.log('   Is packaged:', isPackaged);

  // In dev mode, just warn and continue without permissions
  // (Electron dev app won't appear properly in System Preferences)
  if (isDevMode) {
    console.log('ℹ️  Mode développement détecté');
    console.log('   Vérification des permissions d\'accessibilité ignorée');
    console.log('   Auto-paste désactivé en dev (nécessite app packagée)');
    console.log('   Le texte sera copié dans le presse-papiers');
    hasAccessibilityPermission = false;
    return false;
  }

  // Check if we already have permission (production only)
  const isTrusted = systemPreferences.isTrustedAccessibilityClient(false);
  console.log('   isTrustedAccessibilityClient(false) returned:', isTrusted);

  if (isTrusted) {
    hasAccessibilityPermission = true;
    console.log('✅ Accessibility permissions granted');
    return true;
  }

  // Show dialog explaining why we need permissions (production only)
  console.log('⚠️  Accessibility permissions not yet granted, showing dialog...');
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Permissions requises',
    message: 'freesper a besoin des permissions d\'accessibilité',
    detail: 'Pour coller automatiquement le texte transcrit dans vos applications, freesper a besoin des permissions d\'accessibilité.\n\nCliquez "Ouvrir les préférences" pour autoriser freesper dans:\nPréférences Système → Confidentialité et sécurité → Accessibilité',
    buttons: ['Ouvrir les préférences', 'Plus tard'],
    defaultId: 0,
    cancelId: 1
  });

  if (response === 0) {
    console.log('   User clicked "Ouvrir les préférences", requesting permission...');
    // Request permission - this will open System Preferences
    systemPreferences.isTrustedAccessibilityClient(true);
    
    // Show follow-up dialog
    await dialog.showMessageBox({
      type: 'info',
      title: 'Activer les permissions',
      message: 'Activez freesper dans les préférences',
      detail: '1. Cliquez sur le cadenas pour déverrouiller\n2. Cochez "freesper" dans la liste\n3. Redémarrez freesper si nécessaire\n\nSans cette permission, le texte sera copié dans le presse-papiers mais ne sera pas collé automatiquement.',
      buttons: ['OK']
    });
  } else {
    console.log('   User clicked "Plus tard", skipping permission request');
  }

  // Re-check after user interaction
  hasAccessibilityPermission = systemPreferences.isTrustedAccessibilityClient(false);
  console.log('   After user interaction, isTrusted:', hasAccessibilityPermission);
  
  if (!hasAccessibilityPermission) {
    console.warn('⚠️  Accessibility permissions not granted - auto-paste disabled');
    console.warn('   Text will be copied to clipboard but not auto-pasted');
  }

  return hasAccessibilityPermission;
}

async function createTray() {
  const fs = require('fs');
  const { nativeImage } = require('electron');
  const iconPath = path.join(__dirname, '../assets/iconTemplate.png');

  // Try to load icon, or create empty one
  let trayIcon;

  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
    console.log('✓ Tray icon loaded from:', iconPath);
  } else {
    console.warn('⚠️  Icon not found at:', iconPath);
    console.warn('   Creating app menu instead of tray icon...');
    console.warn('   To add an icon: create assets/iconTemplate.png (32x32, black on transparent)');

    // Create empty image (won't show in menu bar, but app will work)
    trayIcon = nativeImage.createEmpty();
  }

  try {
    tray = new Tray(trayIcon);
  } catch (error) {
    console.error('Failed to create tray:', error);
    console.warn('App will continue without tray icon - use Dock menu instead');
    return; // Exit early if tray creation fails
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Record',
      click: () => toggleRecording(),
      accelerator: 'CommandOrControl+Shift+Space'
    },
    { type: 'separator' },
    {
      label: 'Historique',
      click: () => showHistory()
    },
    {
      label: 'Download Models',
      click: () => showModelManager()
    },
    {
      label: 'Settings',
      click: () => showSettings()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ]);

  if (tray) {
    tray.setToolTip('freesper - Offline Speech-to-Text');
    tray.setContextMenu(contextMenu);
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    maxWidth: 1200,
    maxHeight: 1000,
    show: false,
    frame: false,
    transparent: false,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false // TODO: Enable contextIsolation for security (requires preload script refactor)
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../ui/index.html'));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    console.log('Main window ready');
    mainWindow.show(); // Show window on startup
  });

  // Enable DevTools in dev mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

async function showRecordingWindow() {
  if (!recordingWindow) {
    recordingWindow = new BrowserWindow({
      width: 400,
      height: 120,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    recordingWindow.loadFile(path.join(__dirname, '../ui/recording.html'));

    // Wait for the renderer to be ready before proceeding
    await new Promise(resolve => {
      recordingWindow.webContents.once('did-finish-load', resolve);
    });

    console.log('✓ Recording window loaded');

    // Enable DevTools in dev mode for debugging
    if (process.argv.includes('--dev')) {
      recordingWindow.webContents.openDevTools({ mode: 'detach' });
      console.log('✓ Recording window DevTools opened');
    }
  }

  // Center on screen
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  recordingWindow.setPosition(
    Math.floor((width - 400) / 2),
    Math.floor((height - 120) / 2)
  );

  recordingWindow.show();
}

function hideRecordingWindow() {
  if (recordingWindow) {
    recordingWindow.hide();
  }
}

/**
 * Play a sound for audio feedback
 * @param {string} type - 'start' or 'stop'
 */
function playBeep(type) {
  if (!recordingWindow || recordingWindow.isDestroyed()) return;
  
  // Get a random sound URL from the sound manager
  const soundUrl = soundManager.getRandomSoundUrl(type);
  
  if (!soundUrl) {
    console.warn(`⚠️  No ${type} sound available`);
    return;
  }
  
  // Send message to recording window to play sound
  recordingWindow.webContents.send('play-sound', { type, url: soundUrl });
}

async function toggleRecording() {
  console.log('toggleRecording called - isRecording:', isRecording, 'isProcessing:', isProcessing);
  
  if (isProcessing) {
    console.log('⚠️  Already processing a recording, ignoring...');
    return;
  }
  
  if (isRecording) {
    await stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  if (!inferenceEngine.isModelLoaded()) {
    console.log('❌ Cannot start recording: No model loaded');
    showNotification('Modèle requis', 'Veuillez télécharger et activer un modèle avant d\'enregistrer');

    // Also show the model manager to help user
    setTimeout(() => {
      showModelManager();
    }, 1000);
    return;
  }

  isRecording = true;
  await showRecordingWindow(); // Wait for window to be ready

  try {
    // Just mark as recording - actual recording happens in renderer
    await audioRecorder.startRecording(recordingWindow);

    // Tell renderer to start recording
    recordingWindow.webContents.send('start-audio-recording');
    recordingWindow.webContents.send('recording-status', { status: 'recording' });

    // Play start beep
    setTimeout(() => playBeep('start'), 100);
  } catch (error) {
    console.error('Failed to start recording:', error);
    isRecording = false;
    hideRecordingWindow();
    showNotification('Error', `Failed to start recording: ${error.message}`);
  }
}

async function stopRecording() {
  if (!isRecording) return;
  if (isProcessing) {
    console.log('⚠️  Already processing, ignoring stopRecording');
    return;
  }

  console.log('Stopping recording...');
  isRecording = false;
  // Don't set isProcessing = true here - let audio-data-recorded handler do it
  // This prevents the race condition where isProcessing is true before data arrives

  // Play stop beep
  playBeep('stop');

  console.log('📍 Sending recording-status: processing');
  recordingWindow.webContents.send('recording-status', { status: 'processing' });

  // Tell renderer to stop recording and send audio data
  console.log('📍 Sending stop-audio-recording to renderer');
  recordingWindow.webContents.send('stop-audio-recording');
  console.log('✓ IPC messages sent to renderer');
}

async function pasteToActiveApp() {
  console.log('📍 pasteToActiveApp() called');
  console.log('   Current hasAccessibilityPermission:', hasAccessibilityPermission);
  
  // Check if we have accessibility permissions
  if (!hasAccessibilityPermission) {
    // Re-check in case user granted permission while app was running
    const recheckResult = process.platform !== 'darwin' || 
      systemPreferences.isTrustedAccessibilityClient(false);
    console.log('   Re-checking accessibility permission:', recheckResult);
    hasAccessibilityPermission = recheckResult;
  }

  if (!hasAccessibilityPermission) {
    console.log('⚠️  Auto-paste skipped: no accessibility permissions');
    console.log('   Text has been copied to clipboard - paste manually with Cmd+V');
    showNotification('Texte copié', 'Collez avec Cmd+V (permissions d\'accessibilité requises pour le collage auto)');
    return;
  }

  // Use AppleScript to paste (more reliable on macOS)
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  // Small delay to ensure focus is correct
  console.log('   Waiting 100ms before paste...');
  await new Promise(resolve => setTimeout(resolve, 100));

  try {
    console.log('   Executing AppleScript paste command...');
    // Simulate Command+V using AppleScript
    const { stdout, stderr } = await execAsync('osascript -e \'tell application "System Events" to keystroke "v" using command down\'');
    console.log('✅ AppleScript paste succeeded');
    if (stdout) console.log('   stdout:', stdout);
    if (stderr) console.log('   stderr:', stderr);
  } catch (error) {
    console.error('❌ Failed to paste:', error.message);
    console.error('   Error code:', error.code);
    console.error('   stdout:', error.stdout);
    console.error('   stderr:', error.stderr);
    
    // If paste fails, it might be a permission issue
    hasAccessibilityPermission = false;
    showNotification('Texte copié', 'Collez avec Cmd+V (erreur de collage auto - vérifiez les permissions d\'accessibilité)');
  }
}

function showNotification(title, body) {
  const { Notification } = require('electron');
  new Notification({ title, body }).show();
}

function showModelManager() {
  mainWindow.webContents.send('show-view', 'model-manager');
  mainWindow.show();
}

function showSettings() {
  mainWindow.webContents.send('show-view', 'settings');
  mainWindow.show();
}

function showHistory() {
  mainWindow.webContents.send('show-view', 'history');
  mainWindow.show();
}

// IPC handlers
ipcMain.handle('get-models', async () => {
  const models = await modelManager.listModels();
  const activeModelPath = store.get('activeModel', null);
  
  // Mark the active model
  if (activeModelPath) {
    models.installed = models.installed.map(model => ({
      ...model,
      isActive: model.path === activeModelPath
    }));
  }
  
  return models;
});

ipcMain.handle('download-model', async (event, modelName) => {
  return await modelManager.downloadModel(modelName, (progress) => {
    mainWindow.webContents.send('download-progress', { modelName, progress });
  });
});

ipcMain.handle('download-parakeet-int8', async (event, { modelId }) => {
  try {
    const result = await modelManager.downloadParakeetInt8((progress, message) => {
      // Determine stage based on progress
      let stage = 'downloading';
      if (progress >= 90) stage = 'installing-deps';
      else if (progress >= 80) stage = 'extracting';
      else if (progress >= 60) stage = 'extracting';
      else if (progress >= 10) stage = 'downloading';
      
      if (progress >= 100) stage = 'complete';
      
      // Send progress to renderer (use conversion-progress for consistency)
      mainWindow.webContents.send('conversion-progress', { 
        modelId, 
        progress,
        message,
        stage
      });
    });

    if (result.success) {
      // Notify that installation is complete
      setTimeout(() => {
        mainWindow.webContents.send('conversion-complete', { modelId });
      }, 500);
    }

    return result;
  } catch (error) {
    console.error('Parakeet INT8 download failed:', error);
    // Send error to renderer
    mainWindow.webContents.send('conversion-progress', { 
      modelId, 
      progress: 0,
      message: error.message,
      stage: 'error'
    });
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-model', async (event, modelPath) => {
  const result = await inferenceEngine.loadModel(modelPath);
  
  if (result.success) {
    // Store the currently loaded model path
    store.set('activeModel', modelPath);
  }
  
  return result;
});

ipcMain.handle('delete-model', async (event, modelId) => {
  try {
    // Check if this model is currently active
    const activeModelPath = store.get('activeModel', null);
    const modelDir = require('path').join(require('electron').app.getPath('userData'), 'models', modelId);
    
    // If deleting the active model, unload it first
    if (activeModelPath && activeModelPath === modelDir) {
      console.log(`⚠️  Suppression du modèle actif: ${modelId}`);
      
      // Unload the model
      if (inferenceEngine) {
        inferenceEngine.cleanup();
      }
      
      // Clear the active model setting
      store.delete('activeModel');
      
      console.log('✓ Modèle déchargé de la mémoire');
    }
    
    const result = modelManager.deleteModel(modelId);
    
    if (result.success) {
      console.log(`✓ Modèle supprimé du disque: ${modelId}`);
    }
    
    return result;
  } catch (error) {
    console.error('Failed to delete model:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-settings', async () => {
  return {
    hotkey: store.get('hotkey', 'CommandOrControl+Shift+Space'),
    autoPaste: store.get('autoPaste', true),
    language: store.get('language', 'auto')
  };
});

// Handle audio data from renderer process
ipcMain.handle('audio-data-recorded', async (event, audioData) => {
  // Prevent race condition: check if already processing
  if (isProcessing) {
    console.warn('⚠️  Already processing a transcription, ignoring new request');
    return { success: false, error: 'Already processing' };
  }

  isProcessing = true;

  // Safety timeout: unlock after 30 seconds no matter what
  const safetyTimeout = setTimeout(() => {
    if (isProcessing) {
      console.error('⚠️  SAFETY TIMEOUT: Force unlocking isProcessing after 30s');
      isProcessing = false;
      isRecording = false;
      audioRecorder.reset();
      hideRecordingWindow();
    }
  }, 30000);

  try {
    // Clear safety timeout on success (will be cleared in finally block)

    // Check if audio data is valid
    if (!audioData) {
      console.error('❌ No audio data received from renderer (null or undefined)');
      audioRecorder.reset();

      if (recordingWindow && !recordingWindow.isDestroyed()) {
        recordingWindow.webContents.send('transcription-error', { error: 'No audio data' });
        setTimeout(() => hideRecordingWindow(), 2000);
      }

      return { success: false, error: 'No audio data' };
    }

    if (audioData.byteLength === 0) {
      console.error('❌ Audio data is empty (0 bytes)');
      audioRecorder.reset();

      if (recordingWindow && !recordingWindow.isDestroyed()) {
        recordingWindow.webContents.send('transcription-error', { error: 'Empty audio data' });
        setTimeout(() => hideRecordingWindow(), 2000);
      }

      return { success: false, error: 'Empty audio data' };
    }

    console.log('📍 Received audio data from renderer:', audioData.byteLength, 'bytes');
    
    const startTime = Date.now();
    const fs = require('fs');
    const path = require('path');
    
    // Convert ArrayBuffer to Buffer
    const buffer = Buffer.from(audioData);
    
    // Save to temp file (WebM format from MediaRecorder)
    const tempDir = path.join(app.getPath('userData'), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const audioFilePath = path.join(tempDir, `recording_${Date.now()}.webm`);
    fs.writeFileSync(audioFilePath, buffer);

    console.log('✓ Audio saved to:', audioFilePath);
    console.log('✓ File size:', (buffer.length / 1024).toFixed(2), 'KB');

    let transcriptionResult = null;
    try {
      // Run inference
      console.log('📍 Starting transcription...');
      transcriptionResult = await inferenceEngine.transcribe(audioFilePath);
    } finally {
      // Clean up temporary audio file
      try {
        if (fs.existsSync(audioFilePath)) {
          fs.unlinkSync(audioFilePath);
          console.log('✓ Temporary file cleaned up:', audioFilePath);
        }
      } catch (cleanupError) {
        console.warn('⚠️  Failed to delete temp file:', cleanupError.message);
      }
    }

    const result = transcriptionResult;
    const duration = Date.now() - startTime;

    // Extract text from result
    let transcriptionText = '';
    if (typeof result === 'string') {
      transcriptionText = result;
    } else if (result && typeof result === 'object' && typeof result.text === 'string') {
      transcriptionText = result.text;
    } else {
      console.warn('⚠️  Unexpected transcription result type:', typeof result, result);
      transcriptionText = String(result || '');
    }

    console.log('📍 Transcription text:', transcriptionText);
    console.log(`✓ Transcription completed in ${duration}ms`);

    // Update status
    if (transcriptionText && transcriptionText.trim()) {
      recordingWindow.webContents.send('transcription-complete', { text: transcriptionText });
      
      // TOUJOURS copier dans le clipboard
      clipboard.writeText(transcriptionText);
      console.log('✓ Texte copié dans le clipboard:', transcriptionText.substring(0, 50) + (transcriptionText.length > 50 ? '...' : ''));
      
      // Ajouter à l'historique
      addToHistory(transcriptionText, duration);
      console.log('✓ Texte ajouté à l\'historique');
      
      // Auto-paste if enabled
      const autoPaste = store.get('autoPaste', true);
      if (autoPaste) {
        await pasteToActiveApp();
      }

      // Hide after delay (isProcessing will be unlocked in finally)
      setTimeout(() => {
        hideRecordingWindow();
      }, 1500);

      return { success: true, text: transcriptionText };
    } else {
      console.warn('⚠️  No text transcribed');
      recordingWindow.webContents.send('transcription-error', { error: 'No text transcribed' });

      // Hide after delay (isProcessing will be unlocked in finally)
      setTimeout(() => {
        hideRecordingWindow();
      }, 2000);
      
      return { success: false, error: 'No text transcribed' };
    }
  } catch (error) {
    console.error('❌ Transcription failed:', error);
    console.error('Stack:', error.stack);

    // Reset audio recorder
    audioRecorder.reset();

    recordingWindow.webContents.send('transcription-error', { error: error.message });

    setTimeout(() => {
      hideRecordingWindow();
    }, 2000);

    return { success: false, error: error.message };
  } finally {
    // Clear safety timeout
    if (safetyTimeout) {
      clearTimeout(safetyTimeout);
    }

    // Always unlock processing in finally block to prevent deadlock
    isProcessing = false;
    console.log('✓ Processing unlocked');
  }
});

ipcMain.handle('save-settings', async (event, settings) => {
  for (const [key, value] of Object.entries(settings)) {
    store.set(key, value);
  }

  // Re-register hotkey
  registerHotkeys();

  return { success: true };
});

ipcMain.handle('get-history', async () => {
  return store.get('transcriptionHistory', []);
});

ipcMain.handle('clear-history', async () => {
  store.set('transcriptionHistory', []);
  return { success: true };
});

// Window controls
ipcMain.on('window-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

ipcMain.on('window-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

ipcMain.on('window-maximize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

function addToHistory(text, duration) {
  console.log('addToHistory called with text length:', text.length, 'duration:', duration);
  const history = store.get('transcriptionHistory', []);

  // Add new entry
  history.unshift({
    text,
    timestamp: Date.now(),
    duration
  });

  // Limit to 50 entries (FIFO)
  if (history.length > 50) {
    history.pop();
  }

  store.set('transcriptionHistory', history);
  console.log('History updated, total entries:', history.length);

  // Notify renderer to update
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('transcription-complete');
  }
}

function registerHotkeys() {
  globalShortcut.unregisterAll();

  const hotkey = store.get('hotkey', 'CommandOrControl+Shift+Space');
  
  console.log('Registering global hotkey:', hotkey);

  const success = globalShortcut.register(hotkey, () => {
    console.log('Hotkey triggered:', hotkey);
    toggleRecording();
  });

  if (success) {
    console.log('✓ Global hotkey registered:', hotkey);
  } else {
    console.error('⚠️  Failed to register hotkey:', hotkey);
    console.error('   The hotkey might already be in use by another application');
  }
}

/**
 * Create setup window for Python dependency installation
 */
function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 600,
    height: 500,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false // TODO: Enable contextIsolation for security (requires preload script refactor)
    }
  });

  setupWindow.loadFile(path.join(__dirname, '../ui/setup.html'));

  setupWindow.once('ready-to-show', () => {
    setupWindow.show();
  });

  setupWindow.on('closed', () => {
    setupWindow = null;
  });

  return setupWindow;
}

/**
 * Initialize Python environment with UI progress
 * Shows setup window if dependencies need to be installed
 */
async function ensurePythonDependencies() {
  console.log('🐍 Checking Python environment...');

  // Check if already initialized
  if (pythonManager.isDependenciesInstalled()) {
    console.log('✓ Python dependencies already installed');
    pythonManager.pythonExecutable = pythonManager.getPythonExecutable();
    pythonManager.isInitialized = true;
    return;
  }

  console.log('⚠️  Python dependencies not found, starting installation...');

  // Create setup window
  const window = createSetupWindow();

  return new Promise((resolve, reject) => {
    // Wait for renderer to be ready
    ipcMain.once('setup-ready', async () => {
      try {
        // Initialize Python with progress updates
        await pythonManager.initialize((progress, message) => {
          window.webContents.send('setup-progress', { progress, message });
        });

        // Send completion event
        window.webContents.send('setup-complete');

        console.log('✅ Python environment ready');

        // Close window after a short delay
        setTimeout(() => {
          if (window && !window.isDestroyed()) {
            window.close();
          }
          resolve();
        }, 1500);

      } catch (error) {
        console.error('❌ Python initialization failed:', error);
        window.webContents.send('setup-error', error.message);

        // Handle retry
        ipcMain.once('setup-retry', async () => {
          try {
            await pythonManager.initialize((progress, message) => {
              window.webContents.send('setup-progress', { progress, message });
            });
            window.webContents.send('setup-complete');
            setTimeout(() => {
              if (window && !window.isDestroyed()) {
                window.close();
              }
              resolve();
            }, 1500);
          } catch (retryError) {
            window.webContents.send('setup-error', retryError.message);
            reject(retryError);
          }
        });
      }
    });

    // Handle window close button
    ipcMain.on('setup-window-close', () => {
      if (window && !window.isDestroyed()) {
        window.close();
      }
      resolve();
    });
  });
}

// Create Dock menu (macOS fallback)
function createDockMenu() {
  if (process.platform === 'darwin') {
    const dockMenu = Menu.buildFromTemplate([
      {
        label: 'Show Window',
        click: () => {
          if (mainWindow) {
            showModelManager();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Record',
        click: () => toggleRecording()
      },
      { type: 'separator' },
      {
        label: 'Historique',
        click: () => showHistory()
      },
      {
        label: 'Download Models',
        click: () => showModelManager()
      },
      {
        label: 'Settings',
        click: () => showSettings()
      }
    ]);
    app.dock.setMenu(dockMenu);
  }
}

// App lifecycle
app.whenReady().then(async () => {
  // Initialize file logging FIRST for packaged app
  if (app.isPackaged) {
    initFileLogging();
  }
  
  // Fix PATH for packaged app to include Homebrew paths
  // This ensures sox and other CLI tools can be found
  if (app.isPackaged) {
    const homebrewPaths = [
      '/opt/homebrew/bin',     // Apple Silicon
      '/usr/local/bin',        // Intel Mac
      '/opt/local/bin'         // MacPorts
    ];
    
    const currentPath = process.env.PATH || '';
    const pathsToAdd = homebrewPaths.filter(p => !currentPath.includes(p));
    
    if (pathsToAdd.length > 0) {
      process.env.PATH = [...pathsToAdd, currentPath].join(':');
      console.log('✓ Added Homebrew paths to PATH');
    }
  }

  // Clean up old temporary files (older than 1 hour)
  try {
    const tempDir = path.join(app.getPath('userData'), 'temp');
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      let cleanedCount = 0;

      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < oneHourAgo) {
          fs.unlinkSync(filePath);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`✓ Cleaned up ${cleanedCount} old temporary file(s)`);
      }
    }
  } catch (err) {
    console.warn('⚠️  Failed to clean up temporary files:', err.message);
  }

  // Initialize modules
  pythonManager = new PythonManager();
  modelManager = new ModelManager();
  inferenceEngine = new InferenceEngine();
  audioRecorder = new AudioRecorder();
  soundManager = new SoundManager();

  // Link Python manager to inference engine
  inferenceEngine.setPythonManager(pythonManager);

  // Initialize Python environment (will show setup window if needed)
  await ensurePythonDependencies();

  // Auto-load previously active model if exists
  const activeModelPath = store.get('activeModel', null);
  if (activeModelPath && fs.existsSync(activeModelPath)) {
    console.log('🔄 Auto-loading previously active model:', activeModelPath);
    try {
      const result = await inferenceEngine.loadModel(activeModelPath);
      if (result.success) {
        console.log('✅ Model loaded successfully:', activeModelPath);
      } else {
        console.error('❌ Failed to load model:', result.error);
        // Clear the active model setting if loading fails
        store.delete('activeModel');
      }
    } catch (error) {
      console.error('❌ Error loading model:', error);
      store.delete('activeModel');
    }
  } else if (activeModelPath) {
    console.log('⚠️  Previously active model not found, clearing setting');
    store.delete('activeModel');
  }

  createTray();
  createMainWindow();
  createDockMenu(); // Fallback if tray doesn't work
  registerHotkeys();

  // Check accessibility permissions for auto-paste
  await checkAccessibilityPermissions();

  // Show welcome message on first run OR dev mode
  const hasRun = store.get('hasRun');
  const isDevMode = process.argv.includes('--dev');

  if (!hasRun || isDevMode) {
    if (!hasRun) {
      store.set('hasRun', true);
    }

    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('  Welcome to freesper!');
    console.log('═══════════════════════════════════════════');
    console.log('');
    console.log('✓ App is running');
    console.log('✓ Hotkey: Cmd+Shift+Space');
    if (isDevMode) {
      console.log('✓ Dev mode enabled');
    }
    console.log('');
    console.log('Next steps:');
    console.log('  1. Right-click Dock icon → Download Models');
    console.log('  2. Grant permissions when prompted');
    console.log('  3. Download/convert a model');
    console.log('  4. Start recording!');
    console.log('');
    console.log('Read START_HERE.md for full guide');
    console.log('═══════════════════════════════════════════');
    console.log('');

    // Show model manager on first run or dev mode
    // Wait for window to be ready
    setTimeout(() => {
      showModelManager();
    }, 500);
  } else {
    console.log('✓ freesper is running');
    console.log('✓ Hotkey: Cmd+Shift+Space');
    console.log('✓ Right-click Dock icon for menu');
  }
});

app.on('window-all-closed', (e) => {
  e.preventDefault(); // Prevent app from quitting
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (audioRecorder) {
    audioRecorder.cleanup();
  }
  if (inferenceEngine) {
    inferenceEngine.cleanup();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
