const ort = require('onnxruntime-node');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const wav = require('wav');
const { spawn } = require('child_process');
const Tokenizer = require('./tokenizer');

// Get FFmpeg path - handle asar unpacked for production
let ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
if (app.isPackaged && ffmpegPath.includes('app.asar')) {
  // In production, ffmpeg is in app.asar.unpacked
  ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
}

/**
 * Get the path to a script file, handling both dev and production modes
 * @param {string} scriptName - Name of the script file (e.g., 'transcribe_sherpa_vad.py')
 * @returns {string} Full path to the script
 */
function getScriptPath(scriptName) {
  // In production (packaged app), scripts are in Resources/scripts/
  // In development, scripts are in project root/scripts/
  
  if (app.isPackaged) {
    // Production: scripts are in app.asar.unpacked or Resources
    const resourcesPath = process.resourcesPath;
    return path.join(resourcesPath, 'scripts', scriptName);
  } else {
    // Development: scripts are relative to project root
    return path.join(__dirname, '../../scripts', scriptName);
  }
}

class InferenceEngine {
  constructor() {
    // Single-model properties (legacy support)
    this.session = null;
    this.modelPath = null;

    // Multi-model properties (Whisper architecture)
    this.encoderSession = null;
    this.decoderSession = null;
    this.decoderWithPastSession = null;

    // Transducer properties (Parakeet architecture)
    this.joinerSession = null;
    this.tokens = null;  // Token list for transducer models

    this.modelDir = null;
    this.architecture = null;

    // Common properties
    this.modelConfig = null;
    this.tokenizer = null;
    this.isLoaded = false;

    // Python manager (set by main.js)
    this.pythonManager = null;
  }

  /**
   * Set Python manager instance
   * @param {PythonManager} pythonManager
   */
  setPythonManager(pythonManager) {
    this.pythonManager = pythonManager;
  }

  /**
   * Get Python executable path
   * @returns {string} Python executable path
   */
  getPythonExecutable() {
    if (this.pythonManager) {
      const pythonPath = this.pythonManager.getPythonExecutable();
      if (pythonPath) {
        return pythonPath;
      }
    }

    // Fallback to system python3 (dev mode or if pythonManager not set)
    return 'python3';
  }

  async loadModel(modelPathOrDir) {
    try {
      console.log(`Loading model from: ${modelPathOrDir}`);

      // Detect architecture by checking if it's a directory with multi-model files
      const isDirectory = fs.existsSync(modelPathOrDir) && fs.lstatSync(modelPathOrDir).isDirectory();

      if (isDirectory) {
        // Check for sherpa-onnx INT8 model (Parakeet)
        const sherpaEncoderPath = path.join(modelPathOrDir, 'encoder.int8.onnx');
        if (fs.existsSync(sherpaEncoderPath)) {
          return await this.loadSherpaOnnxModel(modelPathOrDir);
        }

        // Check for config.json to determine model type
        const configPath = path.join(modelPathOrDir, 'config.json');
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          if (config.model_type === 'transducer') {
            return await this.loadTransducerModel(modelPathOrDir);
          }
        }

        // Check for transducer architecture (Parakeet)
        // First check in main directory
        let encoderTransducerPath = path.join(modelPathOrDir, 'encoder.onnx');
        let joinerPath = path.join(modelPathOrDir, 'joiner.onnx');

        // Also check in onnx subdirectory (HuggingFace format)
        if (!fs.existsSync(encoderTransducerPath)) {
          const onnxSubdir = path.join(modelPathOrDir, 'onnx');
          if (fs.existsSync(onnxSubdir)) {
            encoderTransducerPath = path.join(onnxSubdir, 'encoder.onnx');
            joinerPath = path.join(onnxSubdir, 'joiner.onnx');
          }
        }

        if (fs.existsSync(encoderTransducerPath) && fs.existsSync(joinerPath)) {
          return await this.loadTransducerModel(modelPathOrDir);
        }
        
        // Check for multi-model Whisper architecture
        const encoderPath = path.join(modelPathOrDir, 'encoder_model.onnx');
        const decoderPath = path.join(modelPathOrDir, 'decoder_model.onnx');
        const decoderWithPastPath = path.join(modelPathOrDir, 'decoder_with_past_model.onnx');

        if (fs.existsSync(encoderPath) && fs.existsSync(decoderPath) && fs.existsSync(decoderWithPastPath)) {
          return await this.loadMultiModel(modelPathOrDir);
        } else {
          // Try single model in directory
          const singleModelPath = path.join(modelPathOrDir, 'model.onnx');
          if (fs.existsSync(singleModelPath)) {
            return await this.loadSingleModel(singleModelPath);
          } else {
            throw new Error('No valid model files found in directory');
          }
        }
      } else {
        // It's a file path - single model
        return await this.loadSingleModel(modelPathOrDir);
      }

    } catch (error) {
      console.error('Failed to load model:', error);
      this.isLoaded = false;
      return { success: false, error: error.message };
    }
  }

  async loadSherpaOnnxModel(modelDir) {
    console.log('Detected Sherpa-ONNX architecture (Parakeet INT8 via Python)');
    this.architecture = 'sherpa-onnx';
    this.modelDir = modelDir;

    // Use VAD-enabled script for better long-audio support
    const scriptPath = getScriptPath('transcribe_sherpa_vad.py');
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Script transcribe_sherpa_vad.py not found at: ${scriptPath}`);
    }

    // Verify model files exist
    const requiredFiles = ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt'];
    for (const file of requiredFiles) {
      const filePath = path.join(modelDir, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Missing model file: ${file}`);
      }
    }

    this.sherpaScriptPath = scriptPath;
    this.isLoaded = true;

    console.log('✓ Sherpa-ONNX model configured for use via Python subprocess');
    console.log('Model directory:', modelDir);
    console.log('Script path:', scriptPath);
    console.log('Note: Model will be loaded on first transcription');

    return { success: true };
  }

  async loadTransducerModel(modelDir) {
    console.log('Detected transducer architecture (Parakeet)');
    this.architecture = 'transducer';
    this.modelDir = modelDir;

    // Check if models are in subdirectory (HuggingFace ONNX models)
    const onnxSubdir = path.join(modelDir, 'onnx');
    const modelsDir = fs.existsSync(onnxSubdir) ? onnxSubdir : modelDir;

    const encoderPath = path.join(modelsDir, 'encoder.onnx');
    const decoderPath = path.join(modelsDir, 'decoder.onnx');
    const joinerPath = path.join(modelsDir, 'joiner.onnx');
    const tokensPath = path.join(modelDir, 'tokens.txt');

    // Create session options
    const sessionOptions = {
      executionProviders: ['coreml', 'cpu'],
      graphOptimizationLevel: 'all',
      enableCpuMemArena: true,
      enableMemPattern: true,
      executionMode: 'sequential'
    };

    console.log('Loading transducer encoder...');
    this.encoderSession = await ort.InferenceSession.create(encoderPath, sessionOptions);
    console.log('✓ Encoder loaded');

    console.log('Loading transducer decoder...');
    this.decoderSession = await ort.InferenceSession.create(decoderPath, sessionOptions);
    console.log('✓ Decoder loaded');

    console.log('Loading transducer joiner...');
    this.joinerSession = await ort.InferenceSession.create(joinerPath, sessionOptions);
    console.log('✓ Joiner loaded');

    // Load tokens
    if (fs.existsSync(tokensPath)) {
      const tokensContent = fs.readFileSync(tokensPath, 'utf-8');
      this.tokens = tokensContent.split('\n').map(line => {
        const parts = line.split(' ');
        return parts[0];  // Token string is first part
      }).filter(t => t);
      console.log(`✓ Loaded ${this.tokens.length} tokens`);
    }

    // Load config
    const configPath = path.join(modelDir, 'config.json');
    if (fs.existsSync(configPath)) {
      this.modelConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }

    this.isLoaded = true;
    console.log('Transducer model loaded successfully');
    return { success: true };
  }

  async loadMultiModel(modelDir) {
    console.log('Detected multi-model Whisper architecture');
    this.architecture = 'whisper-multi-model';
    this.modelDir = modelDir;

    const encoderPath = path.join(modelDir, 'encoder_model.onnx');
    const decoderPath = path.join(modelDir, 'decoder_model.onnx');
    const decoderWithPastPath = path.join(modelDir, 'decoder_with_past_model.onnx');

    // Create session options with CoreML/CPU fallback
    const sessionOptions = {
      executionProviders: ['coreml', 'cpu'],
      graphOptimizationLevel: 'all',
      enableCpuMemArena: true,
      enableMemPattern: true,
      executionMode: 'sequential',
      logSeverityLevel: 0,
      logVerbosityLevel: 0
    };

    console.log('Loading encoder model...');
    this.encoderSession = await ort.InferenceSession.create(encoderPath, sessionOptions);
    console.log('✓ Encoder loaded:', this.encoderSession.executionProviders);

    console.log('Loading decoder model...');
    this.decoderSession = await ort.InferenceSession.create(decoderPath, sessionOptions);
    console.log('✓ Decoder loaded:', this.decoderSession.executionProviders);

    console.log('Loading decoder with past model...');
    this.decoderWithPastSession = await ort.InferenceSession.create(decoderWithPastPath, sessionOptions);
    console.log('✓ Decoder with past loaded:', this.decoderWithPastSession.executionProviders);

    // Load model configuration
    const configPath = path.join(modelDir, 'config.json');
    if (fs.existsSync(configPath)) {
      this.modelConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }

    // Load tokenizer
    try {
      this.tokenizer = new Tokenizer(modelDir);
      console.log('✓ Tokenizer loaded successfully');
    } catch (tokenizerError) {
      console.warn('Failed to load tokenizer:', tokenizerError.message);
      // Don't fail model loading if tokenizer fails
    }

    this.isLoaded = true;
    console.log('Multi-model loaded successfully');
    return { success: true };
  }

  async loadSingleModel(modelPath) {
    console.log('Loading single-model architecture');
    this.architecture = 'single-model';
    this.modelPath = modelPath;

    // Load model configuration
    const configPath = path.join(path.dirname(modelPath), 'config.json');
    if (fs.existsSync(configPath)) {
      this.modelConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }

    // Create ONNX Runtime session with optimizations
    const sessionOptions = {
      executionProviders: ['coreml', 'cpu'],
      graphOptimizationLevel: 'all',
      enableCpuMemArena: true,
      enableMemPattern: true,
      executionMode: 'sequential',
      logSeverityLevel: 0,
      logVerbosityLevel: 0
    };

    this.session = await ort.InferenceSession.create(modelPath, sessionOptions);
    this.isLoaded = true;

    console.log('✓ Model loaded successfully');
    console.log('Execution providers:', this.session.executionProviders);

    // Load tokenizer for text decoding
    try {
      const modelDir = path.dirname(modelPath);
      this.tokenizer = new Tokenizer(modelDir);
      console.log('✓ Tokenizer loaded successfully');
    } catch (tokenizerError) {
      console.warn('Failed to load tokenizer:', tokenizerError.message);
      console.warn('Token decoding will not be available');
    }

    return { success: true };
  }

  async loadNeMoModel(modelId) {
    console.log('Detected NeMo architecture (Parakeet via Python)');
    this.architecture = 'nemo';
    this.modelId = modelId || 'nvidia/parakeet-tdt-0.6b-v3';
    
    // Verify Python script exists
    const scriptPath = getScriptPath('transcribe_parakeet.py');
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Script transcribe_parakeet.py not found at: ${scriptPath}`);
    }
    
    this.nemoScriptPath = scriptPath;
    this.isLoaded = true;
    
    console.log('✓ NeMo model configuration loaded');
    console.log('Model ID:', this.modelId);
    console.log('Script path:', scriptPath);
    console.log('Note: Model will be loaded on first transcription');

    return { success: true };
  }

  isModelLoaded() {
    return this.isLoaded;
  }

  /**
   * Convert audio file to WAV format using FFmpeg
   * @param {string} inputPath - Path to input audio file
   * @returns {Promise<string>} Path to converted WAV file
   */
  async convertToWav(inputPath) {
    const { spawn } = require('child_process');
    const fs = require('fs');
    const path = require('path');

    return new Promise((resolve, reject) => {
      // Generate output path
      const outputPath = inputPath.replace(/\.[^.]+$/, '.wav');

      console.log(`  Input: ${inputPath}`);
      console.log(`  Output: ${outputPath}`);
      console.log(`  FFmpeg path: ${ffmpegPath}`);

      // FFmpeg command to convert to 16kHz mono WAV
      const ffmpeg = spawn(ffmpegPath, [
        '-i', inputPath,           // Input file
        '-ar', '16000',            // Sample rate: 16kHz
        '-ac', '1',                // Mono
        '-c:a', 'pcm_s16le',       // PCM 16-bit
        '-y',                      // Overwrite output file
        outputPath
      ]);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          console.error('FFmpeg stderr:', stderr);
          return reject(new Error(`FFmpeg conversion failed (exit code ${code})`));
        }

        // Verify output file exists
        if (!fs.existsSync(outputPath)) {
          return reject(new Error('Conversion failed: output file not created'));
        }

        // Delete original WebM file
        try {
          fs.unlinkSync(inputPath);
          console.log('  ✓ Cleaned up original file');
        } catch (e) {
          console.warn('  Warning: Could not delete original file:', e.message);
        }

        resolve(outputPath);
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`Failed to start bundled FFmpeg: ${error.message}`));
      });
    });
  }

  async transcribe(audioFilePath) {
    if (!this.isLoaded) {
      throw new Error('Model not loaded');
    }

    // Convert WebM to WAV if necessary
    if (audioFilePath.endsWith('.webm')) {
      console.log('📍 Converting WebM to WAV for compatibility...');
      audioFilePath = await this.convertToWav(audioFilePath);
      console.log('✓ Conversion complete:', audioFilePath);
    }

    if (this.architecture === 'sherpa-onnx') {
      return await this.transcribeSherpaOnnx(audioFilePath);
    } else if (this.architecture === 'nemo') {
      return await this.transcribeNeMo(audioFilePath);
    } else if (this.architecture === 'transducer') {
      return await this.transcribeTransducer(audioFilePath);
    } else if (this.architecture === 'whisper-multi-model') {
      return await this.transcribeMultiModel(audioFilePath);
    } else {
      return await this.transcribeSingleModel(audioFilePath);
    }
  }

  async transcribeSherpaOnnx(audioFilePath) {
    return new Promise((resolve, reject) => {
      const overallStart = Date.now();

      console.log('Transcribing with Sherpa-ONNX/Parakeet INT8 via Python subprocess...');
      console.log('Audio file:', audioFilePath);

      // Determine working directory
      // In packaged app, use the Resources directory
      // In dev mode, use the project root
      let workingDir;
      if (app.isPackaged) {
        workingDir = process.resourcesPath;
      } else {
        workingDir = path.join(__dirname, '../..');
      }
      
      console.log('Working directory for Python:', workingDir);
      console.log('Script path:', this.sherpaScriptPath);

      // Determine Python command
      // In packaged app, use embedded Python from pythonManager
      // In dev mode, use uv run python
      let pythonCmd;
      let args;

      if (app.isPackaged) {
        // In packaged app, use embedded Python
        pythonCmd = this.getPythonExecutable();
        console.log('Using embedded Python:', pythonCmd);

        args = [
          this.sherpaScriptPath,
          audioFilePath,
          '--model-dir',
          this.modelDir
        ];
      } else {
        // In dev mode, use uv run python
        pythonCmd = 'uv';
        args = [
          'run',
          'python',
          this.sherpaScriptPath,
          audioFilePath,
          '--model-dir',
          this.modelDir
        ];
      }

      console.log('Python command:', pythonCmd, args.join(' '));

      const subprocess = spawn(pythonCmd, args, {
        cwd: workingDir
      });

      let stdout = '';
      let stderr = '';
      let timeoutId = null;
      let isResolved = false;

      // Manual timeout implementation
      timeoutId = setTimeout(() => {
        if (!isResolved) {
          console.error('⏱️  Python subprocess timeout (60s), killing process');
          subprocess.kill('SIGKILL');
          reject(new Error('Transcription timeout (60 seconds)'));
          isResolved = true;
        }
      }, 60000);

      subprocess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      subprocess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      subprocess.on('error', (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (!isResolved) {
          console.error('Failed to start Python subprocess:', error);
          reject(new Error(`Subprocess error: ${error.message}`));
          isResolved = true;
        }
      });

      subprocess.on('close', (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (isResolved) return; // Already handled by timeout
        const overallTime = Date.now() - overallStart;
        isResolved = true;

        if (code !== 0) {
          console.error('Python script failed with code:', code);
          console.error('STDERR:', stderr);
          console.error('STDOUT:', stdout);

          // Try to parse JSON error from stdout
          try {
            const lines = stdout.trim().split('\n');
            const jsonLine = lines[lines.length - 1];
            const result = JSON.parse(jsonLine);
            if (result.error) {
              reject(new Error(result.error));
              return;
            }
          } catch (e) {
            // Could not parse JSON, use generic error
          }

          reject(new Error(`Transcription failed (exit code ${code})`));
          return;
        }

        try {
          // Parse JSON from stdout (dernière ligne contenant le JSON)
          const lines = stdout.trim().split('\n');
          const jsonLine = lines[lines.length - 1];
          const result = JSON.parse(jsonLine);

          if (!result.success) {
            console.error('Transcription error:', result.error);
            reject(new Error(result.error || 'Transcription failed'));
            return;
          }

          console.log(`✓ Sherpa-ONNX transcription completed in ${overallTime}ms`);
          console.log('Transcription:', result.text);

          resolve({
            text: result.text,
            timing: {
              total: overallTime
            }
          });
        } catch (error) {
          console.error('Failed to parse Python output:', error);
          console.error('STDOUT:', stdout);
          console.error('STDERR:', stderr);
          reject(new Error(`Failed to parse transcription result: ${error.message}`));
        }
      });
    });
  }

  async transcribeTransducer(audioFilePath) {
    try {
      const overallStart = Date.now();

      // Step 1: Extract audio features
      console.log('Step 1: Extracting audio features...');
      const featureStart = Date.now();
      const features = await this.extractFeaturesForTransducer(audioFilePath);
      const featureTime = Date.now() - featureStart;
      console.log(`Feature extraction completed in ${featureTime}ms`);
      console.log(`Feature shape: [${features.dims.join(', ')}]`);

      // Step 2: Run encoder
      console.log('Step 2: Encoding audio...');
      const encodeStart = Date.now();
      
      // Parakeet encoder expects [batch, 128, time] for audio_signal
      const encoderFeeds = {
        'audio_signal': new ort.Tensor('float32', features.data, features.dims),
        'length': new ort.Tensor('int64', BigInt64Array.from([BigInt(features.dims[2])]), [1])
      };
      
      const encoderOutputs = await this.encoderSession.run(encoderFeeds);
      const encoderOut = encoderOutputs['outputs'];
      const encodedLengths = encoderOutputs['encoded_lengths'];
      const encodeTime = Date.now() - encodeStart;
      console.log(`Encoding completed in ${encodeTime}ms`);
      console.log('Encoder output shape:', encoderOut.dims);

      // Step 3: Greedy transducer decoding
      console.log('Step 3: Decoding with transducer...');
      const decodeStart = Date.now();
      const tokenIds = await this.greedyTransducerDecode(encoderOut, encodedLengths);
      const decodeTime = Date.now() - decodeStart;
      console.log(`Decoding completed in ${decodeTime}ms (${tokenIds.length} tokens)`);

      // Step 4: Convert token IDs to text
      const transcription = this.decodeTransducerTokens(tokenIds);

      const totalTime = Date.now() - overallStart;
      console.log('Performance metrics:');
      console.log(`  Feature extraction: ${featureTime}ms`);
      console.log(`  Encoding: ${encodeTime}ms`);
      console.log(`  Decoding: ${decodeTime}ms`);
      console.log(`  Total: ${totalTime}ms`);

      return transcription;

    } catch (error) {
      console.error('Transducer transcription failed:', error);
      throw error;
    }
  }

  async extractFeaturesForTransducer(audioFilePath) {
    // Parakeet expects 128-dim mel filterbank features
    // We'll use a modified Python script for this
    const { spawn } = require('child_process');
    const { app } = require('electron');

    return new Promise((resolve, reject) => {
      // Security: validate that audioFilePath is within the app's temp directory
      const tempDir = path.join(app.getPath('userData'), 'temp');
      const resolvedPath = path.resolve(audioFilePath);
      const resolvedTempDir = path.resolve(tempDir);

      if (!resolvedPath.startsWith(resolvedTempDir)) {
        return reject(new Error('Security: audio file path outside temp directory'));
      }

      if (!fs.existsSync(audioFilePath)) {
        return reject(new Error(`Audio file not found: ${audioFilePath}`));
      }

      const scriptPath = getScriptPath('extract_features.py');

      if (!fs.existsSync(scriptPath)) {
        return reject(new Error(`Feature extraction script not found: ${scriptPath}`));
      }

      // Get Python executable from manager (or fallback to system python3)
      const pythonExecutable = this.getPythonExecutable();

      // Pass --n_mels 128 for Parakeet
      const python = spawn(pythonExecutable, [scriptPath, audioFilePath, '--n_mels', '128']);
      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          console.error('Python stderr:', stderr);
          return reject(new Error(`Feature extraction failed: ${stderr}`));
        }

        try {
          const result = JSON.parse(stdout);
          if (result.error) {
            return reject(new Error(result.error));
          }

          const [n_mels, time_steps] = result.shape;
          const featuresFlat = new Float32Array(result.features.flat());

          // Parakeet expects [batch, n_mels, time]
          resolve({
            data: featuresFlat,
            dims: [1, n_mels, time_steps]
          });

        } catch (parseError) {
          return reject(new Error(`Failed to parse features: ${parseError.message}`));
        }
      });

      python.on('error', (error) => {
        return reject(new Error(`Failed to spawn Python: ${error.message}`));
      });
    });
  }

  async greedyTransducerDecode(encoderOut, encodedLengths) {
    const tokenIds = [];
    
    // Parakeet uses blank token at the end of vocabulary
    // tokens.txt has 8193 lines (0-8192), blank is at index 8192
    const blankId = this.tokens ? this.tokens.length - 1 : 8192;
    const maxSteps = 500;  // Safety limit
    
    console.log(`Using blank token ID: ${blankId}, vocab size: ${this.tokens?.length || 'unknown'}`);
    
    // Encoder output shape from Parakeet: [batch, encoder_dim, T] = [1, 1024, T]
    const batch = encoderOut.dims[0];  // 1
    const encoderDim = encoderOut.dims[1];  // 1024
    const T = encoderOut.dims[2];  // Time dimension (after subsampling)
    const decoderDim = 640;  // From ONNX inspection
    
    console.log(`Decoding ${T} encoder frames...`);
    
    // Initialize decoder state (LSTM states)
    // states.1: [2, batch, 640] - hidden states for 2 LSTM layers
    // onnx::Slice_3: [2, 1, 640] - cell states
    let decoderState1 = new Float32Array(2 * 1 * decoderDim).fill(0);
    let decoderState2 = new Float32Array(2 * 1 * decoderDim).fill(0);
    
    // Start with blank token
    let prevToken = blankId;
    
    for (let t = 0; t < T && tokenIds.length < maxSteps; t++) {
      // Get encoder output for current time step
      // Data layout: [batch, encoder_dim, T] -> index = d * T + t for each dimension d
      const encoderSlice = new Float32Array(encoderDim);
      for (let d = 0; d < encoderDim; d++) {
        encoderSlice[d] = encoderOut.data[d * T + t];
      }
      
      let emittedThisFrame = false;
      let innerSteps = 0;
      
      // Inner loop: emit tokens until blank
      while (!emittedThisFrame && innerSteps < 10) {
        innerSteps++;
        
        // Run decoder with previous token (Parakeet expects int32, not int64)
        const targetsTensor = new ort.Tensor('int32', Int32Array.from([prevToken]), [1, 1]);
        const targetLengthTensor = new ort.Tensor('int32', Int32Array.from([1]), [1]);
        const state1Tensor = new ort.Tensor('float32', decoderState1, [2, 1, decoderDim]);
        const state2Tensor = new ort.Tensor('float32', decoderState2, [2, 1, decoderDim]);
        
        const decoderFeeds = {
          'targets': targetsTensor,
          'target_length': targetLengthTensor,
          'states.1': state1Tensor,
          'onnx::Slice_3': state2Tensor
        };
        
        const decoderOutputs = await this.decoderSession.run(decoderFeeds);
        const decoderOut = decoderOutputs['outputs'];  // [batch, 640, 1]
        
        // Get new decoder states (but don't update yet - wait for decision)
        const newState1 = decoderOutputs['states'];
        const newState2 = decoderOutputs['162'];
        
        // Run joiner
        // encoder_outputs: [batch, 1024, 1], decoder_outputs: [batch, 640, 1]
        const joinerFeeds = {
          'encoder_outputs': new ort.Tensor('float32', encoderSlice, [1, encoderDim, 1]),
          'decoder_outputs': new ort.Tensor('float32', new Float32Array(decoderOut.data), [1, decoderDim, 1])
        };
        
        const joinerOutputs = await this.joinerSession.run(joinerFeeds);
        const logits = joinerOutputs['outputs'];  // [1, 1, 1, vocab_size]
        
        // Greedy: argmax over vocabulary
        const vocabSize = logits.dims[logits.dims.length - 1];
        
        // IMPORTANT: The joiner vocab (8198) is larger than decoder vocab (8193)
        // We must constrain our search to valid decoder token range
        const decoderVocabSize = this.tokens ? this.tokens.length : 8193;
        const maxValidToken = Math.min(vocabSize, decoderVocabSize);
        
        let maxLogit = -Infinity;
        let bestToken = blankId;
        
        // Debug: log joiner output shape and vocab size on first iteration
        if (t === 0 && innerSteps === 1) {
          console.log(`Joiner output shape: [${logits.dims.join(', ')}]`);
          console.log(`Joiner vocab size: ${vocabSize}, Decoder vocab size: ${decoderVocabSize}`);
          console.log(`Searching tokens 0-${maxValidToken - 1} (blank at ${blankId})`);
          
          // Debug: show top 5 logits
          const logitArray = Array.from(logits.data).slice(0, maxValidToken);
          const indexed = logitArray.map((val, idx) => ({ idx, val }));
          indexed.sort((a, b) => b.val - a.val);
          console.log('Top 5 logits:', indexed.slice(0, 5).map(x => `${x.idx}(${this.tokens?.[x.idx] || '?'})=${x.val.toFixed(3)}`).join(', '));
          console.log('Blank logit:', logits.data[blankId]?.toFixed(3));
        }
        
        // No blank penalty - let model use natural blank/non-blank balance
        // Works best for English. Multilingual may need different approach.
        const adjustedLogits = new Float32Array(logits.data);

        // Only search within valid decoder token range
        for (let v = 0; v < maxValidToken; v++) {
          if (adjustedLogits[v] > maxLogit) {
            maxLogit = adjustedLogits[v];
            bestToken = v;
          }
        }
        
        // Debug: log generated token (only first few frames and non-blank emissions)
        if ((t < 5 || (t < 20 && bestToken !== blankId)) && innerSteps === 1) {
          // Show top 10 logits for debugging
          const logitArray = Array.from(logits.data).slice(0, maxValidToken);
          const indexed = logitArray.map((val, idx) => ({ idx, val }));
          indexed.sort((a, b) => b.val - a.val);
          console.log(`\nFrame ${t}: Top 10 logits:`, indexed.slice(0, 10).map(x => `${x.idx}(${this.tokens?.[x.idx] || '?'})=${x.val.toFixed(3)}`).join(', '));
          console.log(`Frame ${t}: Selected token ${bestToken} (${this.tokens?.[bestToken] || '?'}), logit: ${logits.data[bestToken]?.toFixed(3)}`);
        }
        
        if (bestToken === blankId) {
          // Blank token - move to next encoder frame
          // Update states from this decoder run (we processed prevToken)
          if (newState1) decoderState1 = new Float32Array(newState1.data);
          if (newState2) decoderState2 = new Float32Array(newState2.data);
          emittedThisFrame = true;
        } else {
          // Non-blank token - emit and update state
          tokenIds.push(bestToken);
          
          // Update states from this decoder run
          if (newState1) decoderState1 = new Float32Array(newState1.data);
          if (newState2) decoderState2 = new Float32Array(newState2.data);
          
          // Update prevToken for next iteration
          prevToken = bestToken;
          
          // Continue inner loop with the same encoder frame
          // The next decoder call will use bestToken as input
        }
      }
      
      // Progress logging
      if (t > 0 && t % 50 === 0) {
        console.log(`  Processed ${t}/${T} frames, ${tokenIds.length} tokens`);
      }
    }
    
    return tokenIds;
  }

  decodeTransducerTokens(tokenIds) {
    if (!this.tokens || this.tokens.length === 0) {
      console.warn('No tokens loaded for transducer model');
      return tokenIds.map(id => `[${id}]`).join('');
    }

    console.log('Token IDs to decode:', tokenIds);
    console.log('First 10 token strings:', tokenIds.slice(0, 10).map(id => `${id}:${this.tokens[id]}`));

    let text = '';
    for (const id of tokenIds) {
      if (id >= 0 && id < this.tokens.length) {
        let token = this.tokens[id];

        // Handle special tokens
        if (token === '<blk>' || token === '<blank>' || token === '<unk>') {
          continue;
        }

        // Handle SentencePiece-style tokens
        if (token.startsWith('▁')) {
          text += ' ' + token.slice(1);
        } else {
          text += token;
        }
      }
    }

    return text.trim();
  }

  async transcribeNeMo(audioFilePath) {
    return new Promise((resolve, reject) => {
      const overallStart = Date.now();
      
      console.log('Transcribing with NeMo/Parakeet via Python subprocess...');
      console.log('Audio file:', audioFilePath);
      
      // Use uv run to ensure correct Python environment
      const pythonCmd = 'uv';
      const args = ['run', 'python', this.nemoScriptPath, audioFilePath];
      
      const subprocess = spawn(pythonCmd, args, {
        cwd: path.join(__dirname, '../..'),
        timeout: 60000 // 60 second timeout
      });
      
      let stdout = '';
      let stderr = '';
      
      subprocess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      subprocess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      subprocess.on('error', (error) => {
        console.error('Failed to start Python subprocess:', error);
        reject(new Error(`Subprocess error: ${error.message}`));
      });
      
      subprocess.on('close', (code) => {
        const overallTime = Date.now() - overallStart;
        
        if (code !== 0) {
          console.error('Python script failed with code:', code);
          console.error('STDERR:', stderr);
          reject(new Error(`Transcription failed (exit code ${code})`));
          return;
        }
        
        try {
          // Parse JSON from stdout (dernière ligne contenant le JSON)
          const lines = stdout.trim().split('\n');
          const jsonLine = lines[lines.length - 1];
          const result = JSON.parse(jsonLine);
          
          if (!result.success) {
            console.error('Transcription error:', result.error);
            reject(new Error(result.error || 'Transcription failed'));
            return;
          }
          
          console.log(`✓ NeMo transcription completed in ${overallTime}ms`);
          console.log('Transcription:', result.text);
          
          resolve({
            text: result.text,
            timing: {
              total: overallTime
            }
          });
        } catch (error) {
          console.error('Failed to parse Python output:', error);
          console.error('STDOUT:', stdout);
          console.error('STDERR:', stderr);
          reject(new Error(`Failed to parse transcription result: ${error.message}`));
        }
      });
    });
  }

  async transcribeMultiModel(audioFilePath) {
    try {
      const overallStart = Date.now();

      // Step 1: Extract audio features (log-mel spectrogram)
      console.log('Step 1: Extracting audio features...');
      const featureStart = Date.now();
      const features = await this.extractFeatures(audioFilePath);
      const featureTime = Date.now() - featureStart;
      console.log(`Feature extraction completed in ${featureTime}ms`);

      // Step 1.5: Pad features to Whisper's expected length (3000 time steps = 30 seconds)
      const paddedFeatures = this.padFeaturesToWhisperLength(features);

      // Step 2: Encode audio features
      console.log('Step 2: Encoding audio...');
      const encodeStart = Date.now();
      const encoderFeeds = {
        'input_features': new ort.Tensor('float32', paddedFeatures.data, paddedFeatures.dims)
      };
      const encoderOutputs = await this.encoderSession.run(encoderFeeds);
      const encoderHiddenStates = encoderOutputs['last_hidden_state'];
      const encodeTime = Date.now() - encodeStart;
      console.log(`Encoding completed in ${encodeTime}ms`);

      // Step 3: Auto-regressive decoding
      console.log('Step 3: Generating transcription...');
      const decodeStart = Date.now();
      const tokenIds = await this.autoregressiveDecode(encoderHiddenStates, 'fr');  // French
      const decodeTime = Date.now() - decodeStart;
      console.log(`Decoding completed in ${decodeTime}ms (${tokenIds.length} tokens)`);

      // Step 4: Decode tokens to text
      const transcription = this.tokenizer ? this.tokenizer.decode(tokenIds) : tokenIds.join(' ');

      const totalTime = Date.now() - overallStart;

      // Log performance metrics
      console.log('Performance metrics:');
      console.log(`  Feature extraction: ${featureTime}ms`);
      console.log(`  Encoding: ${encodeTime}ms`);
      console.log(`  Decoding: ${decodeTime}ms`);
      console.log(`  Total: ${totalTime}ms`);

      return transcription;

    } catch (error) {
      console.error('Multi-model transcription error:', error);
      throw error;
    }
  }

  async autoregressiveDecode(encoderHiddenStates, language = 'auto') {
    const maxLength = 448;  // Whisper max sequence length
    
    // Whisper special tokens
    const SOT = 50258;           // <|startoftranscript|>
    const EOT = 50257;           // <|endoftext|>
    const LANG_EN = 50259;       // <|en|> - English
    const LANG_FR = 50265;       // <|fr|> - French
    const TRANSCRIBE = 50359;    // <|transcribe|>
    const NO_TIMESTAMPS = 50363; // <|notimestamps|>
    
    // Auto-detect language or use specified one
    const langToken = language === 'fr' ? LANG_FR : (language === 'en' ? LANG_EN : LANG_EN);
    
    // Initial prompt tokens for Whisper
    // Format: <|startoftranscript|><|lang|><|transcribe|><|notimestamps|>
    const promptTokens = [SOT, langToken, TRANSCRIBE, NO_TIMESTAMPS];
    const tokenIds = [...promptTokens];

    let pastKeyValues = {};
    let encoderKeyValues = {};  // Store encoder KV cache separately (doesn't change)

    // First, process all prompt tokens to build up the KV cache
    console.log(`Processing prompt tokens: ${promptTokens.map(t => t).join(', ')}`);
    for (let i = 0; i < promptTokens.length; i++) {
      const currentToken = promptTokens[i];
      let decoderOutputs;

      if (i === 0) {
        // First token: use decoder without past
        const decoderFeeds = {
          'input_ids': new ort.Tensor('int64', BigInt64Array.from([BigInt(currentToken)]), [1, 1]),
          'encoder_hidden_states': encoderHiddenStates
        };
        decoderOutputs = await this.decoderSession.run(decoderFeeds);
        console.log(`Prompt token ${i}: ${currentToken}, decoder outputs: ${Object.keys(decoderOutputs).join(', ')}`);
      } else {
        // Subsequent prompt tokens: use decoder with past
        const decoderFeeds = {
          'input_ids': new ort.Tensor('int64', BigInt64Array.from([BigInt(currentToken)]), [1, 1]),
          'encoder_hidden_states': encoderHiddenStates,
          ...encoderKeyValues,  // Encoder KV cache (constant)
          ...pastKeyValues      // Decoder KV cache (changes each step)
        };
        decoderOutputs = await this.decoderWithPastSession.run(decoderFeeds);
      }

      // Update KV cache - separate encoder and decoder KV caches
      const newPastKeyValues = {};
      for (const [key, value] of Object.entries(decoderOutputs)) {
        if (key.startsWith('present')) {
          const pastKey = key.replace('present', 'past_key_values');
          const tensor = new ort.Tensor(value.type, value.data, value.dims);

          // Encoder keys don't change, store them separately on first iteration
          if (i === 0 && pastKey.includes('.encoder.')) {
            encoderKeyValues[pastKey] = tensor;
          } else if (pastKey.includes('.decoder.')) {
            // Decoder keys change each iteration
            newPastKeyValues[pastKey] = tensor;
          }
        }
      }
      pastKeyValues = newPastKeyValues;
    }
    
    console.log(`Prompt processing complete. pastKeyValues keys: ${Object.keys(pastKeyValues).length}`);

    // Now generate tokens autoregressively
    for (let step = 0; step < maxLength - promptTokens.length; step++) {
      const lastToken = tokenIds[tokenIds.length - 1];

      const decoderFeeds = {
        'input_ids': new ort.Tensor('int64', BigInt64Array.from([BigInt(lastToken)]), [1, 1]),
        'encoder_hidden_states': encoderHiddenStates,
        ...encoderKeyValues,  // Encoder KV cache (constant)
        ...pastKeyValues      // Decoder KV cache (changes each step)
      };

      const decoderOutputs = await this.decoderWithPastSession.run(decoderFeeds);

      // Extract logits
      const logits = decoderOutputs['logits'];

      // Update decoder past key-values for next iteration (encoder keys stay the same)
      const newPastKeyValues = {};
      for (const [key, value] of Object.entries(decoderOutputs)) {
        if (key.startsWith('present') && key.includes('.decoder.')) {
          const pastKey = key.replace('present', 'past_key_values');
          newPastKeyValues[pastKey] = new ort.Tensor(value.type, value.data, value.dims);
        }
      }
      pastKeyValues = newPastKeyValues;

      // Greedy decoding: argmax over vocabulary
      const vocabSize = logits.dims[logits.dims.length - 1];
      const logitsData = logits.data;
      const lastTokenLogits = logitsData.slice(-vocabSize);

      let maxLogit = -Infinity;
      let nextTokenId = 0;
      for (let i = 0; i < vocabSize; i++) {
        if (lastTokenLogits[i] > maxLogit) {
          maxLogit = lastTokenLogits[i];
          nextTokenId = i;
        }
      }

      // Stop if end-of-sequence token generated
      if (nextTokenId === EOT) {
        console.log(`Decoding stopped at step ${step} (end token)`);
        console.log(`Last token before EOT: ${lastToken}`);
        console.log(`Token IDs so far: ${tokenIds.join(', ')}`);
        console.log(`Logits shape: ${logits.dims.join(', ')}, top 5 logits:`, 
          Array.from(logitsData.slice(-vocabSize))
            .map((v, i) => ({i, v}))
            .sort((a, b) => b.v - a.v)
            .slice(0, 5)
            .map(x => `${x.i}:${x.v.toFixed(3)}`)
            .join(', ')
        );
        break;
      }

      tokenIds.push(nextTokenId);
      
      // Safety: log progress every 50 tokens
      if (step > 0 && step % 50 === 0) {
        console.log(`Decoding progress: ${step} tokens generated`);
      }
    }

    return tokenIds;
  }

  async transcribeSingleModel(audioFilePath) {
    try {
      const overallStart = Date.now();

      // Extract features using Python/librosa
      const featureStart = Date.now();
      const features = await this.extractFeatures(audioFilePath);
      const featureTime = Date.now() - featureStart;

      // Run inference
      const inferenceStart = Date.now();
      const feeds = {};
      feeds[this.session.inputNames[0]] = new ort.Tensor('float32', features.data, features.dims);

      const results = await this.session.run(feeds);
      const inferenceTime = Date.now() - inferenceStart;

      // Decode output
      const decodeStart = Date.now();
      const transcription = this.decodeOutput(results);
      const decodeTime = Date.now() - decodeStart;

      const totalTime = Date.now() - overallStart;

      // Log performance metrics
      console.log('Performance metrics:');
      console.log(`  Feature extraction: ${featureTime}ms`);
      console.log(`  Inference: ${inferenceTime}ms`);
      console.log(`  Decoding: ${decodeTime}ms`);
      console.log(`  Total: ${totalTime}ms`);

      return transcription;
    } catch (error) {
      console.error('Single-model transcription error:', error);
      throw error;
    }
  }

  padFeaturesToWhisperLength(features) {
    // Whisper expects exactly 3000 time steps (30 seconds at 100 Hz)
    const WHISPER_N_MELS = 80;
    const WHISPER_TIME_STEPS = 3000;

    const [batch, nMels, timeSteps] = features.dims;

    if (nMels !== WHISPER_N_MELS) {
      throw new Error(`Expected ${WHISPER_N_MELS} mel bins, got ${nMels}`);
    }

    if (timeSteps === WHISPER_TIME_STEPS) {
      // Already correct size
      return features;
    }

    console.log(`Padding features: ${timeSteps} → ${WHISPER_TIME_STEPS} time steps`);

    // Create padded array
    const paddedSize = batch * WHISPER_N_MELS * WHISPER_TIME_STEPS;
    const paddedData = new Float32Array(paddedSize);

    if (timeSteps < WHISPER_TIME_STEPS) {
      // Pad with zeros (audio is shorter than 30 seconds)
      for (let b = 0; b < batch; b++) {
        for (let mel = 0; mel < WHISPER_N_MELS; mel++) {
          for (let t = 0; t < WHISPER_TIME_STEPS; t++) {
            if (t < timeSteps) {
              // Copy original data
              const srcIdx = b * nMels * timeSteps + mel * timeSteps + t;
              const dstIdx = b * WHISPER_N_MELS * WHISPER_TIME_STEPS + mel * WHISPER_TIME_STEPS + t;
              paddedData[dstIdx] = features.data[srcIdx];
            }
            // else: leave as zero (already initialized to 0)
          }
        }
      }
    } else {
      // Truncate (audio is longer than 30 seconds)
      console.warn(`Audio longer than 30s - truncating from ${timeSteps} to ${WHISPER_TIME_STEPS} frames`);
      for (let b = 0; b < batch; b++) {
        for (let mel = 0; mel < WHISPER_N_MELS; mel++) {
          for (let t = 0; t < WHISPER_TIME_STEPS; t++) {
            const srcIdx = b * nMels * timeSteps + mel * timeSteps + t;
            const dstIdx = b * WHISPER_N_MELS * WHISPER_TIME_STEPS + mel * WHISPER_TIME_STEPS + t;
            paddedData[dstIdx] = features.data[srcIdx];
          }
        }
      }
    }

    return {
      data: paddedData,
      dims: [batch, WHISPER_N_MELS, WHISPER_TIME_STEPS]
    };
  }

  async loadAudioFile(filePath) {
    return new Promise((resolve, reject) => {
      const reader = new wav.Reader();
      const audioChunks = [];

      reader.on('format', (format) => {
        console.log('Audio format:', format);
      });

      reader.on('data', (chunk) => {
        audioChunks.push(chunk);
      });

      reader.on('end', () => {
        const audioBuffer = Buffer.concat(audioChunks);
        // Convert to Float32Array
        const samples = new Float32Array(audioBuffer.length / 2);
        for (let i = 0; i < samples.length; i++) {
          samples[i] = audioBuffer.readInt16LE(i * 2) / 32768.0;
        }
        resolve(samples);
      });

      reader.on('error', reject);

      fs.createReadStream(filePath).pipe(reader);
    });
  }

  async extractFeatures(audioFilePath) {
    // Convert audio file to log-mel spectrogram using Python/librosa
    const { spawn } = require('child_process');
    const { promisify } = require('util');

    return new Promise((resolve, reject) => {
      const scriptPath = getScriptPath('extract_features.py');

      // Check if Python script exists
      if (!fs.existsSync(scriptPath)) {
        return reject(new Error(`Feature extraction script not found: ${scriptPath}`));
      }

      console.log('Extracting features from:', audioFilePath);
      const startTime = Date.now();

      // Get Python executable from manager (or fallback to system python3)
      const pythonExecutable = this.getPythonExecutable();

      const python = spawn(pythonExecutable, [scriptPath, audioFilePath]);
      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        const extractionTime = Date.now() - startTime;
        console.log(`Feature extraction completed in ${extractionTime}ms`);

        if (code !== 0) {
          console.error('Python stderr:', stderr);

          // Provide helpful error messages
          if (stderr.includes('librosa') || stderr.includes('numpy')) {
            return reject(new Error(
              'Python dependencies not installed. Please restart the app to trigger automatic setup.'
            ));
          } else if (stderr.includes('ModuleNotFoundError')) {
            return reject(new Error(
              'Missing Python modules. Please restart the app to trigger automatic setup.'
            ));
          } else {
            return reject(new Error(`Feature extraction failed (code ${code}): ${stderr}`));
          }
        }

        try {
          // Parse JSON output from Python script
          const result = JSON.parse(stdout);

          if (result.error) {
            return reject(new Error(`Feature extraction error: ${result.error}`));
          }

          // Validate output structure
          if (!result.features || !result.shape) {
            return reject(new Error('Invalid feature extraction output: missing features or shape'));
          }

          // Validate dimensions (should be [n_mels, time_steps])
          const [n_mels, time_steps] = result.shape;

          if (n_mels !== 80) {
            return reject(new Error(`Invalid mel bins count: expected 80, got ${n_mels}`));
          }

          if (time_steps <= 0) {
            return reject(new Error(`Invalid time steps: ${time_steps}`));
          }

          console.log(`Feature shape: [${n_mels}, ${time_steps}]`);

          // Convert features to Float32Array for ONNX
          // Features are returned as flat array, reshape to [1, n_mels, time_steps]
          const featuresFlat = new Float32Array(result.features.flat());

          resolve({
            data: featuresFlat,
            dims: [1, n_mels, time_steps]
          });

        } catch (parseError) {
          console.error('Failed to parse Python output:', stdout);
          return reject(new Error(`Failed to parse feature extraction output: ${parseError.message}`));
        }
      });

      python.on('error', (error) => {
        if (error.code === 'ENOENT') {
          return reject(new Error(
            'Python 3 not found. Please install Python 3.9+ and ensure it is in your PATH'
          ));
        }
        return reject(new Error(`Failed to spawn Python process: ${error.message}`));
      });
    });
  }

  decodeOutput(results) {
    // Get the output tensor
    const outputName = this.session.outputNames[0];
    const outputTensor = results[outputName];

    if (!this.tokenizer) {
      console.error('Tokenizer not loaded - cannot decode output');
      return "Error: Tokenizer not available";
    }

    try {
      // Extract token IDs from output tensor
      // Handle different output shapes: [batch, sequence_length] or [batch, beam, sequence_length]
      let tokenIds;

      if (outputTensor.dims.length === 2) {
        // Shape: [batch, sequence_length] - take first batch
        tokenIds = Array.from(outputTensor.data);
      } else if (outputTensor.dims.length === 3) {
        // Shape: [batch, beam, sequence_length] - take first batch, first beam
        const batchSize = outputTensor.dims[0];
        const beamSize = outputTensor.dims[1];
        const seqLength = outputTensor.dims[2];

        // Extract first beam from first batch
        tokenIds = Array.from(outputTensor.data).slice(0, seqLength);
      } else {
        console.error('Unexpected output tensor shape:', outputTensor.dims);
        return "Error: Unexpected model output format";
      }

      // Log shape for debugging
      console.log('Output tensor shape:', outputTensor.dims);
      console.log('Token IDs count:', tokenIds.length);

      // Decode token IDs to text using tokenizer
      const transcription = this.tokenizer.decode(tokenIds);

      if (!transcription || transcription.trim().length === 0) {
        console.warn('Decoded empty transcription - model may not be producing valid output');
        return ""; // Return empty string rather than error
      }

      return transcription;

    } catch (decodeError) {
      console.error('Failed to decode output:', decodeError);
      return `Error: Decoding failed - ${decodeError.message}`;
    }
  }

  cleanup() {
    // Clean up multi-model sessions
    if (this.encoderSession) {
      this.encoderSession = null;
    }
    if (this.decoderSession) {
      this.decoderSession = null;
    }
    if (this.decoderWithPastSession) {
      this.decoderWithPastSession = null;
    }

    // Clean up single-model session
    if (this.session) {
      this.session = null;
    }

    // Clean up common properties
    if (this.tokenizer) {
      this.tokenizer = null;
    }

    this.isLoaded = false;
    this.modelPath = null;
    this.modelDir = null;
    this.architecture = null;
    this.modelConfig = null;
  }
}

module.exports = InferenceEngine;
