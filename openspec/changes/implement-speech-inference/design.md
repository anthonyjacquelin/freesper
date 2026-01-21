# Design: Speech-to-Text Inference Pipeline

## Context
Freesper is an Electron-based offline speech-to-text application using ONNX Runtime for model inference. The infrastructure is complete (audio recording, model management, UI) but the ML inference pipeline has placeholder implementations for feature extraction and output decoding. Speech recognition models (Whisper, Parakeet) require specific input preprocessing (log-mel spectrograms) and output postprocessing (token ID → text conversion) that are currently missing.

**Constraints:**
- Must run 100% offline (no API calls)
- Must work on macOS with Apple Silicon optimization (CoreML execution provider)
- Python available for preprocessing (user installs via pip)
- Audio format: 16kHz mono WAV (already implemented)

**Stakeholders:**
- Users: Want fast, accurate transcription without data leaving their device
- Developers: Need maintainable code with clear error messages

## Goals / Non-Goals

### Goals
- Enable end-to-end transcription: audio file → text output
- Achieve reasonable performance (RTF < 0.2x, meaning 1 minute audio processes in < 12 seconds)
- Provide clear error messages when dependencies missing or inference fails
- Support multiple model types (Whisper, Parakeet) through shared interface

### Non-Goals
- Real-time streaming transcription (future enhancement)
- Custom model training or fine-tuning
- GPU-accelerated feature extraction (Python subprocess is CPU-only)
- Automatic punctuation or capitalization (model-dependent)

## Decisions

### Decision 1: Python Subprocess for Feature Extraction
**What:** Use Python subprocess to call `scripts/extract_features.py` (librosa-based) instead of JavaScript implementation

**Why:**
- Librosa is battle-tested, maintains compatibility with Whisper preprocessing
- JavaScript audio processing libraries (e.g., meyda, tensorflow.js) lack mel-spectrogram implementations or have incomplete support
- Avoids reinventing complex DSP algorithms
- Users already need Python to convert models

**Alternatives considered:**
- **WASM module**: Higher performance but requires compiling C++/Rust, adds build complexity
- **TensorFlow.js**: Requires large additional dependencies (~200MB), slower than native librosa
- **Pure JavaScript DSP**: Error-prone, difficult to validate correctness against reference implementations

**Trade-off:** Adds Python runtime dependency, subprocess overhead (~50-100ms), but gains reliability and accuracy

### Decision 2: Tokenizer as Separate Module
**What:** Create `src/modules/tokenizer.js` as standalone class, not embedded in `InferenceEngine`

**Why:**
- Single Responsibility Principle - tokenization logic separate from inference
- Reusable if future features need text encoding (e.g., prompt engineering)
- Easier to test in isolation
- Matches pattern used by model loaders (separate `ModelManager` class)

**Alternatives considered:**
- **Inline in InferenceEngine**: Simpler file structure but violates SRP, harder to test
- **External npm package** (e.g., `transformers.js`): Adds 100MB+ dependency for functionality we only partially need

### Decision 3: Eager Tokenizer Loading
**What:** Load tokenizer vocabulary during `loadModel()`, fail fast if files missing

**Why:**
- Catches configuration errors early (missing vocab files)
- Avoids first-transcription failures after model load appears successful
- Memory overhead minimal (< 5MB for vocabulary)

**Alternatives considered:**
- **Lazy loading**: Load on first transcription attempt - worse UX, harder to debug

## Risks / Trade-offs

### Risk: Python Subprocess Overhead
**Impact:** ~50-100ms added latency per transcription
**Mitigation:**
- Acceptable for batch transcription (not real-time streaming)
- Future: Could cache Python process or use WASM for performance-critical path
- Document expected latency in user guide

### Risk: Python Version Compatibility
**Impact:** librosa/numpy may have breaking changes across Python versions
**Mitigation:**
- Pin recommended versions in documentation: Python 3.9-3.11, librosa 0.10.x
- Add version check in extract_features.py with clear error message
- Provide fallback instructions for installing compatible versions

### Risk: Tokenizer File Format Variations
**Impact:** Different model sources may use different vocabulary formats (vocab.json vs tokenizer.json structure)
**Mitigation:**
- Support common formats: Hugging Face tokenizer.json, legacy vocab.json
- Fail gracefully with message indicating which files are missing
- Document expected file structure in README

### Risk: Model Output Shape Mismatch
**Impact:** Different Whisper variants output different tensor shapes
**Mitigation:**
- Log tensor shapes on first inference for debugging
- Add validation step to check output dimensions before decoding
- Support common shapes: [batch, sequence_length] and [batch, beam, sequence_length]

## Migration Plan

### Prerequisites
1. User must install Python dependencies: `pip3 install librosa numpy`
2. User must have converted ONNX model with vocab files

### Rollout Steps
1. **Phase 1**: Implement feature extraction (mel-spectrogram)
   - Test with raw model outputs (log tensor shapes)
   - Validate feature dimensions

2. **Phase 2**: Implement tokenizer
   - Test with known token sequences
   - Validate against reference Whisper outputs

3. **Phase 3**: End-to-end integration
   - Test with 5-10 second audio samples
   - Measure RTF (Real-Time Factor)
   - Document performance characteristics

### Rollback
If inference fails or produces gibberish:
- Placeholder "Transcription output (decoder TODO)" still returned
- No breaking changes to existing API
- User can continue using app for model management, recording

### Validation
- Success criteria: Transcribe "testing one two three" audio with >90% accuracy
- Performance: RTF < 0.2x on M1 Pro with Whisper Tiny model
- Error handling: Clear messages for missing dependencies, invalid models

## Open Questions

1. **Q:** Should we support beam search decoding or just greedy decoding?
   **A:** Start with greedy (simpler). Beam search is model-dependent and adds complexity.

2. **Q:** Should we cache mel-spectrograms to avoid reprocessing?
   **A:** No immediate need. Audio files are deleted after transcription. Could add if users request re-transcription feature.

3. **Q:** How to handle multiple languages? Does tokenizer need language hints?
   **A:** Depends on model. Whisper models are multilingual by default. Document that users should set language in settings if model supports it.

4. **Q:** Should we validate model compatibility before loading?
   **A:** Yes, add basic check: verify config.json has expected keys (model_type, feature_size). Don't over-engineer - let ONNX Runtime fail naturally for incompatible models.
