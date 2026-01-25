const { app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

/**
 * PythonManager - Handles embedded Python runtime and dependency installation
 *
 * Manages:
 * - Detection of bundled Python runtime
 * - First-run dependency installation (librosa, numpy)
 * - Python executable path resolution
 */
class PythonManager {
  constructor() {
    this.pythonExecutable = null;
    this.isInitialized = false;
    this.isInitializing = false;
    this.venvDir = path.join(app.getPath('userData'), 'python-env');
    this.statusFile = path.join(app.getPath('userData'), '.python-ready');
  }

  /**
   * Get path to bundled Python runtime
   * @returns {string|null} Path to python3 executable or null if not found
   */
  getBundledPythonPath() {
    if (app.isPackaged) {
      // In production, Python is in Resources/python/
      const resourcesPath = process.resourcesPath;
      const pythonPath = path.join(resourcesPath, 'python', 'python', 'bin', 'python3');

      if (fs.existsSync(pythonPath)) {
        return pythonPath;
      }

      console.warn('⚠️  Bundled Python not found at:', pythonPath);
      return null;
    } else {
      // In development, use downloaded Python or system Python
      const devPythonPath = path.join(__dirname, '..', '..', 'python', 'python', 'bin', 'python3');

      if (fs.existsSync(devPythonPath)) {
        return devPythonPath;
      }

      // Fallback to system Python in dev mode
      console.log('📍 Dev mode: Using system Python');
      return 'python3';
    }
  }

  /**
   * Check if Python dependencies are already installed
   * @returns {boolean}
   */
  isDependenciesInstalled() {
    // Check if status file exists (marks successful installation)
    if (fs.existsSync(this.statusFile)) {
      return true;
    }

    // Check if venv exists and has required packages
    const venvPython = path.join(this.venvDir, 'bin', 'python3');
    if (!fs.existsSync(venvPython)) {
      return false;
    }

    try {
      // Test if librosa and numpy are importable
      execSync(`"${venvPython}" -c "import librosa, numpy"`, {
        stdio: 'ignore',
        timeout: 5000
      });

      // Mark as installed for next time
      fs.writeFileSync(this.statusFile, new Date().toISOString());
      return true;
    } catch (err) {
      // Log error for debugging (could be timeout, import error, etc.)
      if (err.killed && err.signal === 'SIGTERM') {
        console.warn('⚠️  Dependency check timeout (5s) - dependencies may be missing or system is slow');
      } else {
        console.warn('⚠️  Dependency check failed:', err.message);
      }
      return false;
    }
  }

  /**
   * Get path to bundled venv archive (pre-installed with all dependencies)
   * @returns {string|null}
   */
  getBundledVenvArchivePath() {
    if (app.isPackaged) {
      // In production, venv archive is in Resources/python-venv.tar.gz
      const resourcesPath = process.resourcesPath;
      const archivePath = path.join(resourcesPath, 'python-venv.tar.gz');

      if (fs.existsSync(archivePath)) {
        return archivePath;
      }

      console.warn('⚠️  Bundled venv archive not found at:', archivePath);
      return null;
    } else {
      // In development, use archive or folder from project root
      const devArchivePath = path.join(__dirname, '..', '..', 'python-venv.tar.gz');
      const devVenvPath = path.join(__dirname, '..', '..', 'python-venv');

      if (fs.existsSync(devArchivePath)) {
        return devArchivePath;
      } else if (fs.existsSync(devVenvPath)) {
        // Return the folder path for dev mode (will be copied directly)
        return devVenvPath;
      }

      console.log('📍 Dev mode: Bundled venv not found, will create on-demand');
      return null;
    }
  }

  /**
   * Install Python dependencies in a virtual environment
   * @param {Function} progressCallback - Called with progress updates (percentage, message)
   * @returns {Promise<void>}
   */
  async installDependencies(progressCallback = null) {
    // Install from scratch

    const basePython = this.getBundledPythonPath();

    if (!basePython) {
      throw new Error('Python runtime not found. Please reinstall the application.');
    }

    console.log('📦 Installing Python dependencies...');
    console.log(`   Base Python: ${basePython}`);
    console.log(`   Virtual env: ${this.venvDir}`);

    // Step 1: Create virtual environment (20%)
    if (progressCallback) progressCallback(10, 'Création de l\'environnement Python...');

    if (!fs.existsSync(this.venvDir)) {
      console.log('   Creating virtual environment...');
      await this.runCommand(basePython, ['-m', 'venv', this.venvDir]);
    }

    const venvPython = path.join(this.venvDir, 'bin', 'python3');
    const venvPip = path.join(this.venvDir, 'bin', 'pip3');

    if (!fs.existsSync(venvPython)) {
      throw new Error('Failed to create virtual environment');
    }

    // Step 2: Upgrade pip (30%)
    if (progressCallback) progressCallback(30, 'Mise à jour de pip...');
    console.log('   Upgrading pip...');
    await this.runCommand(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip']);

    // Step 3: Install numpy (30%)
    if (progressCallback) progressCallback(30, 'Installation de numpy...');
    console.log('   Installing numpy...');
    await this.runCommand(venvPip, ['install', 'numpy']);

    // Step 4: Install librosa (50%)
    if (progressCallback) progressCallback(45, 'Installation de librosa...');
    console.log('   Installing librosa...');
    await this.runCommand(venvPip, ['install', 'librosa']);

    // Step 5: Install soundfile (60%)
    if (progressCallback) progressCallback(60, 'Installation de soundfile...');
    console.log('   Installing soundfile...');
    await this.runCommand(venvPip, ['install', 'soundfile']);

    // Step 6: Install torch (80% - this is the biggest package)
    if (progressCallback) progressCallback(70, 'Installation de torch (peut prendre quelques minutes)...');
    console.log('   Installing torch...');
    await this.runCommand(venvPip, ['install', 'torch', 'torchaudio']);

    // Step 7: Install sherpa-onnx (95%)
    if (progressCallback) progressCallback(90, 'Installation de sherpa-onnx...');
    console.log('   Installing sherpa-onnx...');
    await this.runCommand(venvPip, ['install', 'sherpa-onnx']);

    // Step 8: Verify installation (100%)
    if (progressCallback) progressCallback(95, 'Vérification...');
    console.log('   Verifying installation...');

    try {
      await this.runCommand(venvPython, ['-c', 'import librosa, numpy, sherpa_onnx, torch; print("OK")']);
    } catch (err) {
      throw new Error('Dependency verification failed');
    }

    // Mark as successfully installed
    fs.writeFileSync(this.statusFile, new Date().toISOString());

    if (progressCallback) progressCallback(100, 'Installation terminée !');
    console.log('✅ Python dependencies installed successfully');
  }

  /**
   * Run a command and return a promise
   * @param {string} command
   * @param {string[]} args
   * @param {number} timeout - Timeout in ms (default: 5 minutes)
   * @returns {Promise<string>}
   */
  runCommand(command, args, timeout = 300000) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let timeoutId = null;
      let isResolved = false;

      // Set timeout to prevent hanging
      timeoutId = setTimeout(() => {
        if (!isResolved) {
          console.error(`⏱️  Command timeout (${timeout}ms), killing process:`, command, args.join(' '));
          proc.kill('SIGKILL');
          reject(new Error(`Command timeout after ${timeout}ms`));
          isResolved = true;
        }
      }, timeout);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (isResolved) return; // Already handled by timeout

        isResolved = true;
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (!isResolved) {
          isResolved = true;
          reject(err);
        }
      });
    });
  }

  /**
   * Initialize Python environment (check/install dependencies)
   * @param {Function} progressCallback - Optional progress callback
   * @returns {Promise<string>} Path to Python executable
   */
  async initialize(progressCallback = null) {
    if (this.isInitialized) {
      return this.pythonExecutable;
    }

    if (this.isInitializing) {
      throw new Error('Python initialization already in progress');
    }

    this.isInitializing = true;

    try {
      // Check if dependencies are already installed
      if (this.isDependenciesInstalled()) {
        console.log('✓ Python dependencies already installed');
        this.pythonExecutable = path.join(this.venvDir, 'bin', 'python3');
        this.isInitialized = true;
        this.isInitializing = false;
        return this.pythonExecutable;
      }

      // Install dependencies
      await this.installDependencies(progressCallback);

      this.pythonExecutable = path.join(this.venvDir, 'bin', 'python3');
      this.isInitialized = true;
      this.isInitializing = false;

      return this.pythonExecutable;

    } catch (err) {
      this.isInitializing = false;
      throw err;
    }
  }

  /**
   * Get Python executable path (must call initialize() first)
   * @returns {string|null}
   */
  getPythonExecutable() {
    if (this.isInitialized) {
      return this.pythonExecutable;
    }

    // Try to return venv Python if it exists
    const venvPython = path.join(this.venvDir, 'bin', 'python3');
    if (fs.existsSync(venvPython) && this.isDependenciesInstalled()) {
      this.pythonExecutable = venvPython;
      this.isInitialized = true;
      return venvPython;
    }

    return null;
  }

  /**
   * Show error dialog if Python is not ready
   */
  showPythonNotReadyDialog() {
    dialog.showErrorBox(
      'Dépendances manquantes',
      'L\'application n\'a pas pu initialiser Python. Veuillez réinstaller freesper.'
    );
  }
}

module.exports = PythonManager;
