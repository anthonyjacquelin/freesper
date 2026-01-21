const fs = require('fs');
const path = require('path');
const https = require('https');
const { app } = require('electron');

class ModelManager {
  constructor() {
    this.modelsDir = path.join(app.getPath('userData'), 'models');
    this.ensureModelsDirectory();

    // Available models catalog - Only Parakeet for now
    this.availableModels = [
      {
        name: 'Parakeet INT8',
        id: 'parakeet-int8',
        type: 'sherpa-onnx',
        downloadUrl: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2',
        size: '639MB',
        description: '🏆 Meilleur modèle - 25 langues dont Français - Haute qualité'
      }
      // Whisper models will be added in a future version
    ];
  }

  ensureModelsDirectory() {
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }
  }

  listModels() {
    const installed = [];
    const available = [];

    for (const model of this.availableModels) {
      const modelDir = path.join(this.modelsDir, model.id);
      const modelInfo = this.modelExists(modelDir);

      if (modelInfo.exists) {
        installed.push({
          ...model,
          path: modelInfo.path,
          architecture: modelInfo.architecture,
          installed: true
        });
      } else {
        available.push({
          ...model,
          installed: false
        });
      }
    }

    return { installed, available };
  }

  modelExists(modelPathOrId) {
    let modelDir;

    if (path.isAbsolute(modelPathOrId)) {
      // If it's a file path, get the directory
      if (fs.existsSync(modelPathOrId) && fs.lstatSync(modelPathOrId).isFile()) {
        modelDir = path.dirname(modelPathOrId);
      } else {
        modelDir = modelPathOrId;
      }
    } else {
      modelDir = path.join(this.modelsDir, modelPathOrId);
    }

    // Check for sherpa-onnx INT8 architecture (Parakeet INT8)
    const sherpaEncoderPath = path.join(modelDir, 'encoder.int8.onnx');
    const sherpaDecoderPath = path.join(modelDir, 'decoder.int8.onnx');
    const sherpaJoinerPath = path.join(modelDir, 'joiner.int8.onnx');
    const sherpaTokensPath = path.join(modelDir, 'tokens.txt');

    if (fs.existsSync(sherpaEncoderPath) && fs.existsSync(sherpaDecoderPath) && 
        fs.existsSync(sherpaJoinerPath) && fs.existsSync(sherpaTokensPath)) {
      return {
        exists: true,
        path: modelDir,
        architecture: 'sherpa-onnx'
      };
    }

    // Check for transducer architecture (Parakeet) first
    const transducerEncoderPath = path.join(modelDir, 'encoder.onnx');
    const transducerDecoderPath = path.join(modelDir, 'decoder.onnx');
    const transducerJoinerPath = path.join(modelDir, 'joiner.onnx');

    if (fs.existsSync(transducerEncoderPath) && fs.existsSync(transducerDecoderPath) && fs.existsSync(transducerJoinerPath)) {
      return {
        exists: true,
        path: modelDir,
        architecture: 'transducer'
      };
    }

    // Check for multi-file Whisper architecture
    const encoderPath = path.join(modelDir, 'encoder_model.onnx');
    const decoderPath = path.join(modelDir, 'decoder_model.onnx');
    const decoderWithPastPath = path.join(modelDir, 'decoder_with_past_model.onnx');

    if (fs.existsSync(encoderPath) && fs.existsSync(decoderPath) && fs.existsSync(decoderWithPastPath)) {
      return {
        exists: true,
        path: modelDir,  // Return directory for multi-model
        architecture: 'whisper-multi-model'
      };
    }

    // Fall back to single-file model detection
    const singleModelPath = path.join(modelDir, 'model.onnx');
    if (fs.existsSync(singleModelPath)) {
      return {
        exists: true,
        path: singleModelPath,  // Return file for single-model
        architecture: 'single-model'
      };
    }

    return { exists: false, path: null, architecture: null };
  }

  async downloadModel(modelId, progressCallback) {
    const model = this.availableModels.find(m => m.id === modelId);

    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    const modelDir = path.join(this.modelsDir, model.id);

    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }

    // Download each file
    for (let i = 0; i < model.files.length; i++) {
      const file = model.files[i];
      const fileUrl = this.getHuggingFaceFileUrl(model.huggingFaceRepo, file);
      const filePath = path.join(modelDir, file);

      console.log(`Downloading ${file}...`);

      await this.downloadFile(fileUrl, filePath, model, (progress) => {
        const totalProgress = ((i + progress) / model.files.length) * 100;
        progressCallback(totalProgress);
      });

      console.log(`Downloaded ${file}`);
    }

    progressCallback(100);
    return { success: true, path: path.join(modelDir, 'model.onnx') };
  }

  getHuggingFaceFileUrl(repo, file) {
    // Use Hugging Face's CDN for faster downloads
    return `https://huggingface.co/${repo}/resolve/main/${file}`;
  }

  downloadFile(url, dest, modelInfo, progressCallback) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      let downloadedBytes = 0;
      let totalBytes = 0;

      https.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          return this.downloadFile(response.headers.location, dest, modelInfo, progressCallback)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          const errorMsg = response.statusCode === 404
            ? `Model file not found on Hugging Face. ONNX models must be converted locally.\n\n` +
              `To convert ${modelInfo.name}:\n` +
              `1. Install tools: pip3 install optimum[onnxruntime] transformers torch\n` +
              `2. Run conversion:\n` +
              `   python3 scripts/convert_to_onnx.py \\\n` +
              `     --model ${modelInfo.huggingFaceRepo} \\\n` +
              `     --output "${path.join(this.modelsDir, modelInfo.id)}"\n\n` +
              `3. See INFERENCE_GUIDE.md for detailed instructions\n` +
              `4. Or manually place converted ONNX files in: ${this.modelsDir}/${modelInfo.id}/`
            : `Failed to download: ${response.statusCode}`;
          return reject(new Error(errorMsg));
        }

        totalBytes = parseInt(response.headers['content-length'], 10);

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const progress = totalBytes ? (downloadedBytes / totalBytes) : 0;
          progressCallback(progress);
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (error) => {
        fs.unlink(dest, () => {}); // Delete partial file
        reject(error);
      });

      file.on('error', (error) => {
        fs.unlink(dest, () => {}); // Delete partial file
        reject(error);
      });
    });
  }

  async downloadParakeetInt8(progressCallback) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    const modelDir = path.join(this.modelsDir, 'parakeet-int8');
    const downloadUrl = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2';
    const archivePath = path.join(this.modelsDir, 'parakeet-int8.tar.bz2');

    try {
      // Vérifier si le modèle est déjà installé
      if (fs.existsSync(modelDir)) {
        const requiredFiles = ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt'];
        const allFilesExist = requiredFiles.every(file => 
          fs.existsSync(path.join(modelDir, file))
        );
        
        if (allFilesExist) {
          console.log('Parakeet INT8 déjà installé');
          progressCallback && progressCallback(100, 'Déjà installé');
          return { success: true, path: modelDir };
        }
        
        // Fichiers incomplets, supprimer et réinstaller
        console.log('Installation incomplète détectée, nettoyage...');
        fs.rmSync(modelDir, { recursive: true, force: true });
      }

      // Créer le répertoire
      fs.mkdirSync(modelDir, { recursive: true });

      // Télécharger avec curl (natif sur macOS)
      console.log('Téléchargement de Parakeet INT8...');
      progressCallback && progressCallback(10, 'Téléchargement en cours...');

      await execAsync(`curl -L -o "${archivePath}" "${downloadUrl}"`, {
        maxBuffer: 1024 * 1024 * 100 // 100MB buffer
      });

      progressCallback && progressCallback(60, 'Extraction de l\'archive...');

      // Extraire l'archive dans un dossier temporaire
      const tempDir = path.join(this.modelsDir, 'temp-parakeet-extract');
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      fs.mkdirSync(tempDir, { recursive: true });

      await execAsync(`tar -xjf "${archivePath}" -C "${tempDir}"`);

      progressCallback && progressCallback(80, 'Organisation des fichiers...');

      // Le dossier extrait a un nom spécifique
      const extractedDir = path.join(tempDir, 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8');
      
      // Copier les fichiers nécessaires uniquement
      if (fs.existsSync(extractedDir)) {
        const requiredFiles = [
          'encoder.int8.onnx',
          'decoder.int8.onnx', 
          'joiner.int8.onnx',
          'tokens.txt'
        ];

        for (const file of requiredFiles) {
          const srcPath = path.join(extractedDir, file);
          const destPath = path.join(modelDir, file);
          if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, destPath);
          } else {
            throw new Error(`Fichier manquant dans l'archive: ${file}`);
          }
        }
      } else {
        throw new Error('Dossier extrait introuvable');
      }

      // Nettoyer
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.unlinkSync(archivePath);

      // Installer les dépendances Python nécessaires pour Sherpa-ONNX
      progressCallback && progressCallback(90, 'Installation des dépendances Python...');
      await this.installSherpaOnnxDependencies();

      progressCallback && progressCallback(100, 'Installation terminée !');

      return { success: true, path: modelDir, outputDir: modelDir };

    } catch (error) {
      console.error('Erreur téléchargement Parakeet INT8:', error);
      // Nettoyer en cas d'erreur
      if (fs.existsSync(archivePath)) {
        try { fs.unlinkSync(archivePath); } catch (e) {}
      }
      const tempDir = path.join(this.modelsDir, 'temp-parakeet-extract');
      if (fs.existsSync(tempDir)) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
      }
      return { success: false, error: error.message };
    }
  }

  deleteModel(modelId) {
    const modelDir = path.join(this.modelsDir, modelId);

    if (fs.existsSync(modelDir)) {
      fs.rmSync(modelDir, { recursive: true, force: true });
      return { success: true };
    }

    return { success: false, error: 'Model not found' };
  }

  /**
   * Install Python dependencies required for Sherpa-ONNX transcription
   * This ensures the venv has sherpa-onnx and soundfile installed
   */
  async installSherpaOnnxDependencies() {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    const venvDir = path.join(app.getPath('userData'), 'python-venv');
    const venvPip = path.join(venvDir, 'bin', 'pip');

    // Check if venv exists
    if (!fs.existsSync(venvPip)) {
      console.log('Python venv not found, creating...');
      
      // Create venv
      try {
        await execAsync(`python3 -m venv "${venvDir}"`);
        console.log('✓ Python venv created');
      } catch (error) {
        console.error('Failed to create Python venv:', error);
        throw new Error('Impossible de créer l\'environnement Python. Assurez-vous que Python 3 est installé.');
      }
    }

    // Install sherpa-onnx and soundfile
    console.log('Installing sherpa-onnx and soundfile in venv...');
    
    try {
      // Upgrade pip first
      await execAsync(`"${venvPip}" install --upgrade pip`, {
        timeout: 60000
      });
      
      // Install dependencies
      const { stdout, stderr } = await execAsync(`"${venvPip}" install sherpa-onnx soundfile torch torchaudio`, {
        timeout: 180000, // 3 minutes timeout
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });
      
      console.log('✓ sherpa-onnx, soundfile, torch, and torchaudio installed successfully');
      if (stdout) console.log('pip stdout:', stdout.slice(-500)); // Last 500 chars
      
      return { success: true };
    } catch (error) {
      console.error('Failed to install Python dependencies:', error);
      // Don't throw - the model is still usable, just warn
      console.warn('⚠️  Python dependencies may not be fully installed. Transcription might fail.');
      return { success: false, error: error.message };
    }
  }
}

module.exports = ModelManager;
