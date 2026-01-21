const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

/**
 * Get the path to a script file, handling both dev and production modes
 * @param {string} scriptName - Name of the script file
 * @returns {string} Full path to the script
 */
function getScriptPath(scriptName) {
  if (app.isPackaged) {
    // Production: scripts are in Resources/scripts/
    const resourcesPath = process.resourcesPath;
    return path.join(resourcesPath, 'scripts', scriptName);
  } else {
    // Development: scripts are relative to project root
    return path.join(__dirname, '../../scripts', scriptName);
  }
}

class AutoConverter {
  constructor() {
    this.isConverting = false;
    this.currentProcess = null;
    this.venvDir = path.join(app.getPath('userData'), 'python-venv');
    this.venvPython = path.join(this.venvDir, 'bin', 'python3');
    this.venvPip = path.join(this.venvDir, 'bin', 'pip3');
  }

  /**
   * Find best Python version (prefer 3.11 or 3.12, avoid 3.14+)
   */
  async findPythonExecutable() {
    // Try Python versions in order of preference
    const pythonVersions = ['python3.12', 'python3.11', 'python3.13', 'python3'];

    for (const pythonCmd of pythonVersions) {
      const result = await this.checkPythonVersion(pythonCmd);
      if (result.available) {
        console.log(`Using ${pythonCmd}: Python ${result.version}`);

        // Warn if using Python 3.14+
        if (result.version && parseFloat(result.version) >= 3.14) {
          console.warn(`⚠️  Python ${result.version} detected - this version may have compatibility issues.`);
          console.warn('   Recommended: Install Python 3.11 or 3.12 with: brew install python@3.11');
        }

        return pythonCmd;
      }
    }

    return null;
  }

  /**
   * Check if a specific Python executable is available and get its version
   */
  async checkPythonVersion(pythonCmd) {
    return new Promise((resolve) => {
      const python = spawn(pythonCmd, ['--version']);

      let output = '';
      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        output += data.toString();
      });

      python.on('close', (code) => {
        if (code === 0) {
          // Extract version number (e.g., "Python 3.11.5" -> "3.11")
          const match = output.match(/Python (\d+\.\d+)/);
          const version = match ? match[1] : null;
          resolve({ available: true, version });
        } else {
          resolve({ available: false });
        }
      });

      python.on('error', () => {
        resolve({ available: false });
      });
    });
  }

  /**
   * Create Python virtual environment
   */
  async createVirtualEnv(pythonCmd, progressCallback) {
    return new Promise((resolve, reject) => {
      // Check if venv already exists
      if (fs.existsSync(this.venvPython)) {
        console.log('✓ Virtual environment already exists');
        resolve();
        return;
      }

      progressCallback({
        stage: 'creating-venv',
        progress: 5,
        message: 'Creating Python environment...',
        silent: false
      });

      const venv = spawn(pythonCmd, ['-m', 'venv', this.venvDir]);

      let errorOutput = '';

      venv.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      venv.on('close', (code) => {
        if (code === 0) {
          console.log('✓ Virtual environment created');
          resolve();
        } else {
          reject(new Error(`Failed to create virtual environment: ${errorOutput}`));
        }
      });

      venv.on('error', (error) => {
        reject(new Error(`Failed to create virtual environment: ${error.message}`));
      });

      this.currentProcess = venv;
    });
  }

  /**
   * Check if required Python packages are installed in venv
   */
  async checkPythonPackages() {
    return new Promise((resolve) => {
      // If venv doesn't exist, packages aren't installed
      if (!fs.existsSync(this.venvPython)) {
        resolve(false);
        return;
      }

      const python = spawn(this.venvPython, ['-c',
        'import optimum, transformers, torch, librosa, numpy; print("OK")'
      ]);

      let output = '';
      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.on('close', (code) => {
        resolve(code === 0 && output.includes('OK'));
      });

      python.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Install Python dependencies in virtual environment (in stages)
   */
  async installPythonDependencies(progressCallback) {
    try {
      // Stage 1: Upgrade pip and install setuptools/wheel first
      progressCallback({
        stage: 'installing-deps',
        progress: 10,
        message: 'Setting up build tools...',
        silent: false
      });

      await this.runPipInstall(['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel']);

      // Stage 2: Install ML packages
      progressCallback({
        stage: 'installing-deps',
        progress: 30,
        message: 'Installing ML packages (2-3 min)...',
        silent: false
      });

      await this.runPipInstall(['-m', 'pip', 'install',
        'optimum[onnxruntime]', 'transformers', 'torch', 'librosa', 'numpy'
      ]);

      progressCallback({
        stage: 'installing-deps',
        progress: 100,
        message: 'Dependencies installed!',
        silent: false
      });

    } catch (error) {
      throw new Error(`Failed to install dependencies: ${error.message}`);
    }
  }

  /**
   * Helper to run pip install commands
   */
  async runPipInstall(args) {
    return new Promise((resolve, reject) => {
      // Use venv's python to run pip (more reliable than calling pip directly)
      const process = spawn(this.venvPython, args);

      let output = '';
      let errorOutput = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(errorOutput || output));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to run pip: ${error.message}`));
      });

      this.currentProcess = process;
    });
  }

  /**
   * Convert model to ONNX format automatically
   */
  async convertModel(modelRepo, modelId, progressCallback) {
    return new Promise((resolve, reject) => {
      const modelsDir = path.join(app.getPath('userData'), 'models');
      const outputDir = path.join(modelsDir, modelId);
      const scriptPath = getScriptPath('convert_to_onnx.py');

      if (!fs.existsSync(scriptPath)) {
        return reject(new Error(`Conversion script not found: ${scriptPath}`));
      }

      progressCallback({
        stage: 'converting',
        progress: 0,
        message: `Converting ${modelRepo}...`,
        silent: false
      });

      // Use venv's python to run the conversion script
      const python = spawn(this.venvPython, [
        scriptPath,
        '--model', modelRepo,
        '--output', outputDir
      ]);

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log('[Converter]', text.trim());

        // Parse progress from script output (Whisper models)
        if (text.includes('Loading model')) {
          progressCallback({ stage: 'converting', progress: 20, message: 'Downloading model from Hugging Face...', silent: false });
        } else if (text.includes('Loading processor')) {
          progressCallback({ stage: 'converting', progress: 40, message: 'Loading tokenizer...', silent: false });
        } else if (text.includes('Saving ONNX')) {
          progressCallback({ stage: 'converting', progress: 60, message: 'Saving ONNX model...', silent: false });
        } else if (text.includes('Optimizing')) {
          progressCallback({ stage: 'converting', progress: 80, message: 'Optimizing for CoreML...', silent: false });
        } else if (text.includes('Conversion complete') || text.includes('Download complete')) {
          progressCallback({ stage: 'converting', progress: 95, message: 'Finalizing...', silent: false });
        } else if (text.includes('SUCCESS')) {
          progressCallback({ stage: 'complete', progress: 100, message: 'Model ready!', silent: false });
        }
        // Parse progress from script output (Parakeet models)
        else if (text.includes('Downloading from')) {
          progressCallback({ stage: 'converting', progress: 10, message: 'Downloading model...', silent: false });
        } else if (text.includes('Progress:')) {
          // Extract percentage from progress line
          const match = text.match(/Progress:\s*([\d.]+)%/);
          if (match) {
            const percent = parseFloat(match[1]);
            progressCallback({ stage: 'converting', progress: Math.min(10 + percent * 0.7, 80), message: `Downloading... ${Math.round(percent)}%`, silent: false });
          }
        } else if (text.includes('Extracting model')) {
          progressCallback({ stage: 'converting', progress: 85, message: 'Extracting model files...', silent: false });
        } else if (text.includes('Validating ONNX')) {
          progressCallback({ stage: 'converting', progress: 90, message: 'Validating model...', silent: false });
        } else if (text.includes('Parakeet model ready')) {
          progressCallback({ stage: 'converting', progress: 95, message: 'Model ready!', silent: false });
        }
      });

      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
        // Some stderr output is just warnings, not errors
        console.warn('[Converter stderr]', data.toString().trim());
      });

      python.on('close', (code) => {
        if (code === 0) {
          resolve({ outputDir, success: true });
        } else {
          reject(new Error(`Conversion failed (exit code ${code}): ${errorOutput || output}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to run Python: ${error.message}`));
      });

      this.currentProcess = python;
    });
  }

  /**
   * Full automatic conversion workflow
   */
  async autoConvert(modelRepo, modelId, progressCallback) {
    if (this.isConverting) {
      throw new Error('Another conversion is already in progress');
    }

    this.isConverting = true;

    try {
      // Step 1: Find best Python version
      progressCallback({ stage: 'checking', progress: 0, message: 'Checking Python installation...', silent: true });
      const pythonCmd = await this.findPythonExecutable();

      if (!pythonCmd) {
        console.warn('Python 3 is not installed. Model conversion skipped.');
        throw new Error(
          'Python 3 is not installed. Install with: brew install python@3.11'
        );
      }

      progressCallback({ stage: 'checking', progress: 5, message: 'Python found ✓', silent: true });

      // Step 2: Create virtual environment if needed
      await this.createVirtualEnv(pythonCmd, progressCallback);

      // Step 3: Check/Install dependencies in venv
      progressCallback({ stage: 'checking', progress: 10, message: 'Checking dependencies...', silent: true });
      const hasPackages = await this.checkPythonPackages();

      if (!hasPackages) {
        progressCallback({ stage: 'installing-deps', progress: 10, message: 'Setting up environment...', silent: false });
        await this.installPythonDependencies(progressCallback);
      } else {
        progressCallback({ stage: 'checking', progress: 100, message: 'Ready', silent: true });
      }

      // Step 4: Convert model
      progressCallback({ stage: 'converting', progress: 0, message: `Preparing model...`, silent: false });
      const result = await this.convertModel(modelRepo, modelId, progressCallback);

      progressCallback({
        stage: 'complete',
        progress: 100,
        message: 'Ready to use!',
        outputDir: result.outputDir,
        silent: false
      });

      return { success: true, outputDir: result.outputDir };

    } catch (error) {
      progressCallback({
        stage: 'error',
        progress: 0,
        message: error.message,
        error: true,
        silent: false
      });
      throw error;
    } finally {
      this.isConverting = false;
      this.currentProcess = null;
    }
  }

  /**
   * Cancel ongoing conversion
   */
  cancel() {
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
      this.isConverting = false;
    }
  }
}

module.exports = AutoConverter;
