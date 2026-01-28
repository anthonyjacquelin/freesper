const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, clipboard, systemPreferences, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const AudioRecorder = require('./modules/audioRecorder');
const InferenceEngine = require('./modules/inferenceEngine');
const ModelManager = require('./modules/modelManager');
const SoundManager = require('./modules/soundManager');
const PythonManager = require('./modules/pythonManager');
const UpdateManager = require('./modules/updateManager');

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
    
    console.log('=== Freesper started ===');
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
let updateWindow = null;
let audioRecorder = null;
let inferenceEngine = null;
let modelManager = null;
let soundManager = null;
let pythonManager = null;
let updateManager = null;
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
    console.log('ℹ️  Development mode detected');
    console.log('   Accessibility permission check skipped');
    console.log('   Auto-paste disabled in dev (requires packaged app)');
    console.log('   Text will be copied to clipboard');
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
  
  await requestAccessibilityPermissions();

  return hasAccessibilityPermission;
}

/**
 * Request accessibility permissions with a user-friendly dialog
 */
async function requestAccessibilityPermissions() {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: 'Accessibility Permissions Required',
    message: 'Freesper needs accessibility permissions to auto-paste',
    detail: 'Without this permission, you will need to manually paste (Cmd+V) after each transcription.\n\nTo enable auto-paste:\n1. Click "Open System Preferences"\n2. Click the lock icon to make changes\n3. Find and check "Freesper" in the list\n4. Restart Freesper if needed',
    buttons: ['Open System Preferences', 'Skip (Manual Paste)'],
    defaultId: 0,
    cancelId: 1
  });

  if (response === 0) {
    console.log('   User clicked "Open System Preferences", requesting permission...');
    // Request permission - this will open System Preferences
    systemPreferences.isTrustedAccessibilityClient(true);
    
    // Wait for user to potentially grant permission
    await waitForAccessibilityPermission();
  } else {
    console.log('   User clicked "Skip", auto-paste will be disabled');
    showNotification('Auto-Paste Disabled', 'You can enable it later in Settings → Privacy & Security → Accessibility');
  }

  // Final check
  hasAccessibilityPermission = systemPreferences.isTrustedAccessibilityClient(false);
  console.log('   Final permission status:', hasAccessibilityPermission);
  
  if (!hasAccessibilityPermission) {
    console.warn('⚠️  Accessibility permissions not granted - auto-paste disabled');
  } else {
    console.log('✅ Accessibility permissions granted - auto-paste enabled');
    showNotification('Auto-Paste Enabled', 'Transcribed text will be automatically pasted');
  }
}

/**
 * Wait for user to grant accessibility permission with periodic checks
 */
async function waitForAccessibilityPermission() {
  return new Promise(async (resolve) => {
    // Show waiting dialog
    const waitDialog = await dialog.showMessageBox({
      type: 'info',
      title: 'Waiting for Permission',
      message: 'Please enable Freesper in System Preferences',
      detail: 'After enabling the permission:\n• Check the box next to "Freesper"\n• Click "Done" below when finished\n\nNote: You may need to restart Freesper for changes to take effect.',
      buttons: ['Done', 'Cancel'],
      defaultId: 0,
      cancelId: 1
    });

    if (waitDialog.response === 0) {
      // Check if permission was granted
      const granted = systemPreferences.isTrustedAccessibilityClient(false);
      if (granted) {
        hasAccessibilityPermission = true;
        resolve(true);
      } else {
        // Permission still not granted, offer to check again
        const retryDialog = await dialog.showMessageBox({
          type: 'question',
          title: 'Permission Not Detected',
          message: 'Accessibility permission not yet enabled',
          detail: 'Make sure you:\n1. Clicked the lock icon to unlock\n2. Checked the box next to "Freesper"\n\nWould you like to try again?',
          buttons: ['Try Again', 'Skip for Now'],
          defaultId: 0,
          cancelId: 1
        });

        if (retryDialog.response === 0) {
          // Open preferences again
          systemPreferences.isTrustedAccessibilityClient(true);
          await waitForAccessibilityPermission();
        }
        resolve(false);
      }
    } else {
      resolve(false);
    }
  });
}

/**
 * Setup auto-paste permissions (can be called from menu)
 */
async function setupAutoPastePermissions() {
  if (process.platform !== 'darwin') {
    showNotification('Not Required', 'Auto-paste permissions are only needed on macOS');
    return;
  }

  // Check current status
  const currentStatus = systemPreferences.isTrustedAccessibilityClient(false);
  
  if (currentStatus) {
    hasAccessibilityPermission = true;
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Auto-Paste Already Enabled',
      message: 'Accessibility permissions are already granted',
      detail: 'Freesper can automatically paste transcribed text.\n\nIf auto-paste is not working, try restarting the app.',
      buttons: ['OK', 'Open System Preferences'],
      defaultId: 0
    });
    
    if (response === 1) {
      systemPreferences.isTrustedAccessibilityClient(true);
    }
  } else {
    await requestAccessibilityPermissions();
  }
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
      label: 'History',
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
      label: 'Enable Auto-Paste...',
      click: () => setupAutoPastePermissions()
    },
    {
      label: 'Check for Updates',
      click: () => checkForUpdatesManually()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ]);

  if (tray) {
    tray.setToolTip('Freesper - Offline Speech-to-Text');
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

/**
 * Detect the active screen based on cursor position
 * @returns {Electron.Display} The display where the cursor is located
 */
function getActiveDisplay() {
  try {
    const { screen } = require('electron');
    const cursorPos = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(cursorPos);

    console.log(`🎯 Cursor position: (${cursorPos.x}, ${cursorPos.y})`);
    console.log(`📺 Detected active display: ${activeDisplay.id}`);
    console.log(`   Bounds: (${activeDisplay.bounds.x}, ${activeDisplay.bounds.y}) ${activeDisplay.bounds.width}x${activeDisplay.bounds.height}`);
    console.log(`   WorkArea: (${activeDisplay.workArea.x}, ${activeDisplay.workArea.y}) ${activeDisplay.workArea.width}x${activeDisplay.workArea.height}`);

    return activeDisplay;
  } catch (error) {
    console.warn('⚠️ Failed to detect active display, falling back to primary:', error.message);
    const { screen } = require('electron');
    return screen.getPrimaryDisplay();
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

    // Make window visible on all workspaces to prevent space switching
    recordingWindow.setVisibleOnAllWorkspaces(true);

    recordingWindow.loadFile(path.join(__dirname, '../ui/recording.html'));

    // Wait for the renderer to be ready before proceeding
    await new Promise(resolve => {
      recordingWindow.webContents.once('did-finish-load', resolve);
    });

    console.log('✓ Recording window loaded (visible on all workspaces)');

    // Enable DevTools in dev mode for debugging
    if (process.argv.includes('--dev')) {
      recordingWindow.webContents.openDevTools({ mode: 'detach' });
      console.log('✓ Recording window DevTools opened');
    }
  }

  // Center on active screen (where cursor is located)
  const activeDisplay = getActiveDisplay();
  const { width, height } = activeDisplay.workAreaSize;

  // Calculate center position on the active display
  const centerX = Math.floor(activeDisplay.bounds.x + (width - 400) / 2);
  const centerY = Math.floor(activeDisplay.bounds.y + (height - 120) / 2);

  console.log(`📍 Positioning recording window at (${centerX}, ${centerY}) on display ${activeDisplay.id}`);

  recordingWindow.setPosition(centerX, centerY);

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
    showNotification('Model Required', 'Please download and activate a model before recording');

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

  // Always re-check permissions before attempting paste
  if (process.platform === 'darwin') {
    const currentPermission = systemPreferences.isTrustedAccessibilityClient(false);
    console.log('   Re-checking accessibility permission:', currentPermission);
    hasAccessibilityPermission = currentPermission;
  }

  if (!hasAccessibilityPermission) {
    console.log('⚠️  Auto-paste skipped: no accessibility permissions');
    console.log('   Text has been copied to clipboard - paste manually with Cmd+V');
    
    // Show notification with action hint
    showNotification('Text Copied - Paste with Cmd+V', 'Enable auto-paste via menu: Freesper → Enable Auto-Paste');
    return;
  }

  // Use AppleScript to paste (more reliable on macOS)
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  // Small delay to ensure focus is correct
  console.log('   Waiting 150ms before paste...');
  await new Promise(resolve => setTimeout(resolve, 150));

  try {
    console.log('   Executing AppleScript paste command...');
    // Simulate Command+V using AppleScript
    const { stdout, stderr } = await execAsync('osascript -e \'tell application "System Events" to keystroke "v" using command down\'', {
      timeout: 5000 // 5 second timeout
    });
    console.log('✅ AppleScript paste succeeded');
    if (stdout) console.log('   stdout:', stdout);
    if (stderr) console.log('   stderr:', stderr);
  } catch (error) {
    console.error('❌ Failed to paste:', error.message);
    console.error('   Error code:', error.code);
    if (error.stdout) console.error('   stdout:', error.stdout);
    if (error.stderr) console.error('   stderr:', error.stderr);

    // Re-check permission status
    const stillHasPermission = systemPreferences.isTrustedAccessibilityClient(false);
    
    if (!stillHasPermission) {
      // Permission was revoked or never properly granted
      hasAccessibilityPermission = false;
      showNotification('Text Copied - Paste with Cmd+V', 'Auto-paste failed. Enable via: Freesper → Enable Auto-Paste');
    } else {
      // Permission exists but paste still failed (rare edge case)
      showNotification('Text Copied', 'Auto-paste failed unexpectedly. Please paste manually with Cmd+V');
    }
  }
}

function showNotification(title, body) {
  const { Notification } = require('electron');
  new Notification({ title, body }).show();
}

function showModelManager() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    // Wait for renderer to fully load before sending IPC
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('show-view', 'model-manager');
    });
  } else {
    mainWindow.webContents.send('show-view', 'model-manager');
    mainWindow.show();
  }
}

function showSettings() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    // Wait for renderer to fully load before sending IPC
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('show-view', 'settings');
    });
  } else {
    mainWindow.webContents.send('show-view', 'settings');
    mainWindow.show();
  }
}

function showHistory() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    // Wait for renderer to fully load before sending IPC
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('show-view', 'history');
    });
  } else {
    mainWindow.webContents.send('show-view', 'history');
    mainWindow.show();
  }
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-progress', { modelName, progress });
    }
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('conversion-progress', { 
          modelId, 
          progress,
          message,
          stage
        });
      }
    });

    if (result.success) {
      // Notify that installation is complete
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('conversion-complete', { modelId });
        }
      }, 500);
    }

    return result;
  } catch (error) {
    console.error('Parakeet INT8 download failed:', error);
    // Send error to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('conversion-progress', { 
        modelId, 
        progress: 0,
        message: error.message,
        stage: 'error'
      });
    }
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
        console.log(`⚠️  Deleting active model: ${modelId}`);
        
        // Unload the model
        if (inferenceEngine) {
          inferenceEngine.cleanup();
        }
        
        // Clear the active model setting
        store.delete('activeModel');
        
        console.log('✓ Model unloaded from memory');
      }
      
      const result = modelManager.deleteModel(modelId);
      
      if (result.success) {
        console.log(`✓ Model deleted from disk: ${modelId}`);
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

// Update handlers
ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});

ipcMain.handle('check-for-updates', async () => {
  if (!updateManager) {
    console.log('Update manager not initialized');
    return null;
  }
  return await updateManager.checkForUpdates();
});

ipcMain.handle('download-update', async () => {
  if (!updateManager) {
    throw new Error('Update manager not initialized');
  }
  return await updateManager.downloadUpdate((progress) => {
    if (updateWindow && !updateWindow.isDestroyed()) {
      updateWindow.webContents.send('update-download-progress', progress);
    }
  });
});

ipcMain.handle('install-update-now', async () => {
  if (!updateManager) {
    throw new Error('Update manager not initialized');
  }
  updateManager.quitAndInstall();
});

ipcMain.handle('install-update-on-quit', async () => {
  if (!updateManager) {
    throw new Error('Update manager not initialized');
  }
  updateManager.scheduleInstallOnQuit();
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.close();
  }
});

ipcMain.on('update-window-close', () => {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.close();
  }
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
 * Create update notification window
 */
function createUpdateWindow(updateInfo) {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.focus();
    return;
  }

  updateWindow = new BrowserWindow({
    width: 500,
    height: 550,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  updateWindow.loadFile(path.join(__dirname, '../ui/update.html'));

  updateWindow.once('ready-to-show', () => {
    updateWindow.webContents.send('update-info', updateInfo);
    updateWindow.show();
  });

  updateWindow.on('closed', () => {
    updateWindow = null;
  });
}

/**
 * Check for updates manually (from menu)
 */
async function checkForUpdatesManually() {
  if (!updateManager) {
    console.log('Update manager not initialized');
    const isDevMode = !app.isPackaged;
    const message = isDevMode
      ? 'Update manager not available in dev mode. Build the app to test updates.'
      : 'Update manager is not available';
    showNotification('Update Check', message);
    return;
  }

  console.log('🔄 Manual update check requested');

  try {
    const result = await updateManager.checkForUpdates();

    if (result && result.updateInfo) {
      console.log('✅ Update available:', result.updateInfo.version);
      createUpdateWindow(result.updateInfo);
    } else {
      console.log('ℹ️ No update available');
      showNotification('No Update Available', 'You already have the latest version of Freesper');
    }
  } catch (error) {
    console.error('❌ Update check failed:', error);
    showNotification('Error', 'Unable to check for updates: ' + error.message);
  }
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

// Create Application menu (macOS menu bar)
function createApplicationMenu() {
  if (process.platform === 'darwin') {
    const template = [
      {
        label: app.name,
        submenu: [
          {
            label: 'About Freesper',
            role: 'about'
          },
          {
            label: 'Check for Updates...',
            click: () => checkForUpdatesManually()
          },
          { type: 'separator' },
          {
            label: 'Enable Auto-Paste...',
            click: () => setupAutoPastePermissions()
          },
          {
            label: 'Settings',
            accelerator: 'Command+,',
            click: () => showSettings()
          },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
        {
          label: 'File',
          submenu: [
            {
              label: 'Record',
              accelerator: 'CommandOrControl+Shift+Space',
              click: () => toggleRecording()
            },
            { type: 'separator' },
            {
              label: 'History',
              click: () => showHistory()
            },
            {
              label: 'Download Models',
              click: () => showModelManager()
            },
            { type: 'separator' },
            { role: 'close' }
          ]
        },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          { type: 'separator' },
          { role: 'front' }
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'Learn More',
            click: async () => {
              const { shell } = require('electron');
              await shell.openExternal('https://github.com/anthonyjacquelin/freesper');
            }
          }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }
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
        label: 'History',
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

  createApplicationMenu(); // macOS menu bar
  createTray();
  createMainWindow();
  createDockMenu(); // Fallback if tray doesn't work
  registerHotkeys();

  // Check accessibility permissions for auto-paste
  await checkAccessibilityPermissions();

  // Initialize update manager (always, for manual checks via menu)
  updateManager = new UpdateManager();
  console.log('🔄 Update manager initialized');

  // Auto-check for updates only in packaged mode
  if (app.isPackaged) {
    // Check for updates 5 seconds after launch
    setTimeout(() => {
      console.log('🔄 Checking for updates automatically...');
      updateManager.checkForUpdates().then(result => {
        if (result && result.updateInfo) {
          console.log('✅ Update available:', result.updateInfo.version);
          createUpdateWindow(result.updateInfo);
        } else {
          console.log('ℹ️ No update available');
        }
      }).catch(error => {
        console.log('⚠️  Update check failed (silent):', error.message);
      });
    }, 5000);
  }

  // Show welcome message on first run OR dev mode
  const hasRun = store.get('hasRun');
  const isDevMode = process.argv.includes('--dev');

  if (!hasRun || isDevMode) {
    if (!hasRun) {
      store.set('hasRun', true);
    }

    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('  Welcome to Freesper!');
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
    console.log('✓ Freesper is running');
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
