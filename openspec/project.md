# Project Context

## Purpose
Freesper is a privacy-focused, 100% offline speech-to-text application for macOS. It enables users to transcribe audio in real-time using local ML models without sending data to external servers. The application aims to match the performance and user experience of superwhisper while remaining completely open-source and privacy-preserving.

## Tech Stack
- **Runtime**: Electron 28 (Node.js + Chromium)
- **UI**: HTML/CSS/JavaScript (vanilla, no framework)
- **ML Inference**: ONNX Runtime with CoreML execution provider (Metal GPU acceleration)
- **Audio**: SoX (command-line recording), node-record-lpcm16 (Node.js bindings), WAV format parsing
- **System Integration**: macOS AppleScript (for pasting), Accessibility API
- **Model Formats**: ONNX (converted from Hugging Face Whisper/Parakeet models)
- **Feature Extraction**: Python 3.9+ with librosa, numpy (subprocess for preprocessing)

## Project Conventions

### Code Style
- JavaScript ES6+ with async/await for asynchronous operations
- Use `const` and `let`, avoid `var`
- 2-space indentation
- Descriptive variable names (`audioRecorder` not `ar`)
- Functions should have single responsibility
- Error handling: use try-catch with specific error messages
- Logging: `console.log` for info, `console.warn` for warnings, `console.error` for errors

### Architecture Patterns
- **Modular Design**: Core functionality split into separate modules (`audioRecorder.js`, `inferenceEngine.js`, `modelManager.js`)
- **Single Responsibility**: Each module handles one aspect (recording, inference, model management)
- **Separation of Concerns**: Main process (Node.js backend) vs. Renderer process (UI)
- **Event-Driven**: IPC (Inter-Process Communication) between main and renderer
- **Fail-Safe**: App continues running even if individual operations fail (e.g., tray icon missing)

### Testing Strategy
- Manual testing through UI and console output
- Test files stored in repository root (e.g., `test_audio.wav`)
- Validation through end-to-end workflow: record → transcribe → paste
- Performance metrics: Real-Time Factor (RTF) for inference speed

### Git Workflow
- Work directly on main branch (single developer currently)
- Commit messages: descriptive, focus on "what" and "why"
- Documentation updated alongside code changes

## Domain Context

### Speech Recognition Models
- **Whisper**: OpenAI's open-source multilingual model (Tiny: 75MB, Base: 145MB, Small: 488MB)
- **Parakeet**: NVIDIA's fast speech recognition model (0.6B variant: ~600MB)
- Models require **ONNX format** with specific input/output shapes
- Input: Log-mel spectrogram (80 mel bins, variable time steps)
- Output: Token ID sequence (variable length)

### Audio Processing
- **Sample Rate**: 16kHz mono (standard for speech recognition)
- **Format**: WAV (PCM 16-bit)
- **Duration**: Up to 30 seconds per transcription
- **Recording**: Triggered by global hotkey (Cmd+Shift+Space)

### ML Inference Pipeline
1. **Audio Capture**: Record WAV file to temp directory
2. **Feature Extraction**: Convert waveform → log-mel spectrogram (Python/librosa)
3. **Model Inference**: Run ONNX model with CoreML acceleration
4. **Token Decoding**: Convert output token IDs → text (vocabulary lookup)
5. **Output**: Paste transcribed text to active application

### Performance Targets
- **RTF (Real-Time Factor)**: < 0.2x (1 minute audio in < 12 seconds)
- **Latency**: Total end-to-end < 2 seconds for 5-second audio clip
- **Memory**: < 500MB total (including model in memory)
- **Accuracy**: Match reference Whisper implementations (>90% WER on clean speech)

## Important Constraints

### Privacy & Security
- **No Network Calls**: All processing happens locally
- **No Telemetry**: No usage tracking or analytics
- **Secure Storage**: Audio files stored in user's Library folder, deleted after transcription

### macOS-Specific
- **Metal GPU**: Must use CoreML execution provider for performance
- **Permissions Required**: Microphone access, Accessibility access (for pasting)
- **System Integration**: AppleScript for simulating keyboard shortcuts

### Model Limitations
- **Model Size**: Must fit in memory (max ~2GB for practical use)
- **ONNX Only**: Models must be pre-converted; no on-the-fly conversion
- **Vocabulary Files Required**: vocab.json or tokenizer.json must accompany model

### Python Dependency
- **External Dependency**: Feature extraction requires Python 3.9+ with librosa, numpy
- **Subprocess Overhead**: ~50-100ms added latency per transcription
- **User Installation**: Users must manually install Python dependencies

## External Dependencies

### Required External Tools
- **SoX (Sound eXchange)**: Audio recording (installed via Homebrew)
- **Python 3.9+**: Feature extraction runtime
- **librosa 0.10.x**: Mel-spectrogram computation
- **numpy 1.24.x**: Numerical operations for audio processing

### Node.js Dependencies (package.json)
- `electron@^28.0.0`: Application runtime
- `electron-store@^8.1.0`: Settings persistence
- `node-record-lpcm16@^1.0.1`: Audio recording
- `onnxruntime-node@^1.19.0`: ML inference
- `wav@^1.0.2`: WAV file parsing

### Model Sources
- **Hugging Face**: Primary source for pre-trained models
- **Conversion**: Models converted locally using `optimum[onnxruntime]` library
- **Storage**: Models stored in `~/Library/Application Support/freesper/models/`

### System Services (macOS)
- **Accessibility API**: Required for auto-pasting transcriptions
- **Audio Input**: Microphone access permission
- **AppleScript**: Keyboard event simulation

## Current Implementation Status

### Completed (100%)
- ✅ Electron application shell with menu bar integration
- ✅ Audio recording system (16kHz mono WAV)
- ✅ ONNX Runtime integration with CoreML provider
- ✅ Model download and management UI
- ✅ Global hotkey support (customizable)
- ✅ Settings persistence (electron-store)
- ✅ System paste integration (AppleScript)
- ✅ UI components (Model Manager, Settings, Recording overlay)

### In Progress (40%)
- ⚠️ ML inference pipeline (infrastructure done, core functions missing):
  - Model loading: ✅ Complete
  - Audio file loading: ✅ Complete
  - Feature extraction: ❌ Placeholder (needs implementation)
  - Token decoding: ❌ Placeholder (needs implementation)

### Not Started
- Real-time streaming transcription
- Multi-language UI
- Custom vocabulary support
- Export/import settings
