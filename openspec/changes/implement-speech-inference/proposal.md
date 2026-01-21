# Change: Implement Speech-to-Text Inference Pipeline

## Why
The freesper application currently has a complete infrastructure (Electron app, audio recording, ONNX Runtime integration, model management, UI) but cannot perform speech-to-text transcription. Two critical functions in the inference pipeline are missing: mel-spectrogram feature extraction and token decoding. Without these, recorded audio cannot be converted to text, rendering the core functionality non-operational.

## What Changes
- Implement mel-spectrogram extraction to convert raw audio waveforms into the log-mel spectrogram format required by Whisper/Parakeet models
- Implement tokenizer/decoder to convert model output token IDs into human-readable text
- Integrate Python-based feature extraction script (`scripts/extract_features.py`) with the Node.js inference engine
- Load and utilize vocabulary/tokenizer configuration files to decode model outputs
- Ensure proper error handling and validation throughout the inference pipeline

## Impact
- Affected specs: `speech-inference` (new capability)
- Affected code:
  - `src/modules/inferenceEngine.js` (lines 118-150 - feature extraction)
  - `src/modules/inferenceEngine.js` (lines 152-167 - token decoding)
  - New file: `src/modules/tokenizer.js` (token decoder utility)
- Dependencies: Requires Python 3 with librosa, numpy installed for feature extraction
- User impact: Enables end-to-end speech-to-text transcription (currently non-functional)
