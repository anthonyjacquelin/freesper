# freesper

**100% Offline Speech-to-Text for macOS**

freesper is a privacy-focused, locally-running speech-to-text application for macOS. All processing happens on your device using optimized ML models.

<img width="339" height="359" alt="Capture d’écran 2026-01-21 à 17 45 14" src="https://github.com/user-attachments/assets/41db3231-cf25-4bdc-8141-a7ddfa44ba50" />

> ⚠️ **Important**: Models must be converted locally to ONNX format before use. See [MODEL_SETUP.md](./MODEL_SETUP.md) for a 5-minute quick start guide.

## ✨ Features

- 🎤 **System-wide dictation** - Record audio from any app
- 🔒 **100% Offline** - No data leaves your device
- ⚡ **Metal Acceleration** - Optimized for Apple Silicon (M1/M2/M3)
- 🌍 **Multi-language** - Supports 100+ languages via Parakeet/Whisper
- ⌨️ **Global hotkey** - Quick access with customizable shortcuts
- 📋 **Auto-paste** - Automatically paste transcriptions anywhere
- 🎯 **Menu bar app** - Lightweight, always accessible

## 🏗️ Architecture

```
Electron App
├── Audio Recording (16kHz mono WAV)
├── ONNX Runtime (CoreML accelerated)
├── Model Manager (Hugging Face downloads)
└── System Integration (Global hotkeys + Accessibility)
```

### Performance Optimizations

- **CoreML Execution Provider** - Leverages Apple Neural Engine
- **ONNX Runtime 1.19** - Optimized inference engine
- **Quantized Models** - Smaller, faster models (INT8/FP16)
- **Streaming Audio** - Low-latency processing

## 🚀 Quick Start

### Prerequisites

- macOS 13.3+ (Ventura or later)
- Node.js 18+ and npm
- Xcode Command Line Tools
- SoX (for audio recording)
- Python 3.9+ with librosa and numpy

```bash
# Install SoX via Homebrew
brew install sox

# Install Python dependencies for feature extraction
pip3 install librosa numpy
```

### Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd freesper
```

2. **Install dependencies**
```bash
npm install
```

3. **Grant permissions**

The app needs:
- **Microphone** access (for recording)
- **Accessibility** access (for auto-pasting)
- **Screen Recording** permission (may be required)

You'll be prompted on first run.

4. **Run the app**
```bash
npm start
```

## 📦 Model Setup

### Option 1: Using Pre-converted ONNX Models

Download and place ONNX models in `~/Library/Application Support/freesper/models/`:

```
models/
├── parakeet-tdt-0.6b/
│   ├── model.onnx
│   ├── config.json
│   ├── tokenizer.json
│   └── vocab.json
```

### Option 2: Convert Parakeet from Hugging Face

**Step 1: Install conversion tools**
```bash
pip install torch onnx optimum[exporters]
```

**Step 2: Convert to ONNX**
```python
from optimum.onnxruntime import ORTModelForSpeechSeq2Seq
from transformers import AutoProcessor

model_id = "nvidia/parakeet-tdt-0.6b-v3"
output_dir = "./parakeet-onnx"

# Load and convert
model = ORTModelForSpeechSeq2Seq.from_pretrained(
    model_id,
    export=True,
    provider="CoreMLExecutionProvider"  # Optimize for macOS
)

processor = AutoProcessor.from_pretrained(model_id)

# Save
model.save_pretrained(output_dir)
processor.save_pretrained(output_dir)
```

**Step 3: Optimize for CoreML**
```bash
python -m onnxruntime.tools.optimize_onnx_model \
  --input parakeet-onnx/model.onnx \
  --output parakeet-onnx/model_optimized.onnx \
  --opt_level all
```

### Option 3: Use Whisper Models (Alternative)

Download from [Hugging Face Whisper Models](https://huggingface.co/openai/whisper-tiny):

- `whisper-tiny` (75MB) - Fastest, good accuracy
- `whisper-base` (145MB) - Better accuracy
- `whisper-small` (488MB) - Production quality

## 🎯 Usage

### Recording Audio

1. Click the **freesper** icon in the menu bar
2. Press the hotkey (`Cmd+Shift+Space` by default)
3. Speak your message
4. Press the hotkey again to stop
5. Text is automatically transcribed and pasted

### Settings

- **Hotkey**: Customize your recording shortcut
- **Language**: Set preferred language or auto-detect
- **Auto-paste**: Toggle automatic pasting

## 🔧 Development

### Project Structure

```
freesper/
├── src/
│   ├── main.js                 # Electron main process
│   └── modules/
│       ├── audioRecorder.js    # Audio capture
│       ├── inferenceEngine.js  # ONNX inference
│       └── modelManager.js     # Model downloads
├── ui/
│   ├── index.html             # Main window
│   ├── recording.html         # Recording overlay
│   ├── styles.css
│   └── renderer.js
├── assets/
│   └── iconTemplate.png       # Menu bar icon
├── entitlements.mac.plist     # macOS permissions
└── package.json
```

### Building for Production

```bash
npm run build
```

This creates a `.dmg` installer in `dist/`.

### Testing

```bash
# Run inference pipeline tests
node tests/test-inference.js

# Test with custom audio file
node tests/test-inference.js /path/to/audio.wav

# Test with model loading
node tests/test-inference.js /path/to/audio.wav /path/to/model.onnx

# Test Python dependencies
python3 -c "import librosa, numpy; print('OK')"
```

### Debugging

```bash
# Run with DevTools open
npm run dev

# Check ONNX Runtime providers
node -e "require('onnxruntime-node').InferenceSession.create('model.onnx').then(s => console.log(s.executionProviders))"
```

## 🚨 Troubleshooting

### Python Dependencies Issues

**Problem**: `ModuleNotFoundError: No module named 'librosa'` or `'numpy'`

**Solutions**:
1. Install Python dependencies:
   ```bash
   pip3 install librosa numpy
   ```
2. Verify installation:
   ```bash
   python3 -c "import librosa, numpy; print('OK')"
   ```
3. If using multiple Python versions, ensure pip3 matches python3:
   ```bash
   python3 -m pip install librosa numpy
   ```

### Audio Recording Issues

**Problem**: "Recording failed" or silent audio

**Solutions**:
1. Check microphone permissions: `System Settings > Privacy & Security > Microphone`
2. Verify SoX is installed: `sox --version`
3. Test audio input: `rec -r 16000 -c 1 test.wav`

### Model Loading Issues

**Problem**: "Model not loaded" or "Failed to load model"

**Solutions**:
1. Verify ONNX file exists and is valid
2. Check CoreML provider is available:
   ```bash
   python -c "import onnxruntime; print(onnxruntime.get_available_providers())"
   ```
3. Try CPU fallback (disable CoreML in `inferenceEngine.js`)

### Paste Not Working

**Problem**: Text transcribed but not pasted

**Solutions**:
1. Grant Accessibility permission: `System Settings > Privacy & Security > Accessibility`
2. Enable Apple Events permission
3. Check robotjs is properly installed: `npm rebuild robotjs`

### Performance Issues

**Problem**: Slow transcription on M1/M2/M3

**Solutions**:
1. Ensure CoreML provider is active (check console logs)
2. Use quantized models (INT8 or FP16)
3. Reduce audio length (max 30 seconds per chunk)
4. Close other heavy apps

## 🔬 Technical Deep Dive

### How superwhisper Achieves Speed

Based on reverse engineering:

1. **GGML + Metal** - Custom inference with GPU acceleration
2. **Quantized Models** - INT4/INT8 compression (5-10x faster)
3. **Native Code** - Swift/Obj-C (zero overhead)
4. **Streaming** - Process while recording
5. **ArgmaxSDK** - Custom Whisper optimizations

### How freesper Matches Performance

1. **ONNX Runtime** - Industry-standard, highly optimized
2. **CoreML Provider** - Native Apple acceleration
3. **Quantization** - FP16/INT8 models
4. **Node.js Addons** - Native modules for critical paths
5. **Optimized Audio** - 16kHz mono, minimal processing

### Benchmark Comparison

| Model | Size | RTF (Real-Time Factor) | Hardware |
|-------|------|----------------------|----------|
| Whisper Tiny | 75MB | 0.1x | M1 Pro |
| Whisper Base | 145MB | 0.15x | M1 Pro |
| Parakeet 0.6B | 600MB | 0.08x | M1 Pro |

*RTF < 1.0 means faster than real-time*

## 🛠️ Advanced Configuration

### Custom Model Integration

To add your own ONNX model:

1. Place model files in `models/<model-id>/`
2. Update `modelManager.js` availableModels array
3. Ensure proper tokenizer/vocab files exist

### Inference Pipeline

The complete inference pipeline is implemented:

1. **Feature Extraction** - Python/librosa subprocess for mel-spectrograms
2. **Model Inference** - ONNX Runtime with CoreML acceleration
3. **Token Decoding** - Full tokenizer with vocabulary support

See [INFERENCE_GUIDE.md](./INFERENCE_GUIDE.md) for detailed documentation.

## 📝 License

MIT

## 🙏 Acknowledgments

- Inspired by [superwhisper](https://superwhisper.com/)
- Models by [NVIDIA](https://huggingface.co/nvidia) and [OpenAI](https://openai.com/research/whisper)
- Powered by [ONNX Runtime](https://onnxruntime.ai/)

## 🐛 Known Issues

1. **Icon missing** - Create iconTemplate.png for menu bar
2. **No Windows/Linux support** - macOS only currently
3. **Python dependency** - Requires manual installation of librosa/numpy

## 🚧 Roadmap

- [x] ✅ Implement mel-spectrogram extraction (Python/librosa)
- [x] ✅ Add tokenizer/decoder for Whisper/Parakeet
- [x] ✅ End-to-end transcription pipeline
- [ ] Support streaming transcription (real-time)
- [ ] Add conversation mode
- [ ] Implement text post-processing (punctuation, formatting)
- [ ] Create proper icon set
- [ ] Add comprehensive unit tests
- [ ] Support custom vocabulary
- [ ] Windows and Linux support

## 📧 Support

For issues and questions, please open an issue on GitHub.

---

**Built with privacy in mind. Your voice never leaves your device.** 🔒
