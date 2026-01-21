# Implementation Tasks

## 1. Mel-Spectrogram Feature Extraction
- [ ] 1.1 Integrate Python subprocess call in `extractFeatures()` method to invoke `scripts/extract_features.py`
- [ ] 1.2 Parse JSON output from Python script containing features array and shape dimensions
- [ ] 1.3 Convert parsed features to `Float32Array` and reshape for ONNX tensor input
- [ ] 1.4 Add error handling for Python script failures (missing dependencies, invalid audio)
- [ ] 1.5 Add validation to ensure feature dimensions match model expectations (80 mel bins)

## 2. Tokenizer/Decoder Implementation
- [ ] 2.1 Create `src/modules/tokenizer.js` with `Tokenizer` class
- [ ] 2.2 Implement vocabulary loading from `vocab.json` and `tokenizer.json` in model directory
- [ ] 2.3 Implement `decode()` method to convert token ID arrays to text
- [ ] 2.4 Handle special tokens (BOS, EOS, PAD, UNK) by filtering them from output
- [ ] 2.5 Handle subword tokens (WordPiece with `##` prefix, SentencePiece with `▁` prefix)
- [ ] 2.6 Integrate tokenizer into `InferenceEngine.loadModel()` to load on model initialization
- [ ] 2.7 Update `decodeOutput()` to use tokenizer instead of returning placeholder text

## 3. Integration & Testing
- [ ] 3.1 Test with Whisper Tiny model on sample audio (5-10 seconds)
- [ ] 3.2 Verify mel-spectrogram dimensions match expected shape [1, 80, T]
- [ ] 3.3 Verify tokenizer correctly decodes known output sequences
- [ ] 3.4 Test end-to-end: record audio → extract features → run inference → decode text
- [ ] 3.5 Add logging to track inference latency and identify performance bottlenecks
- [ ] 3.6 Document Python dependencies in README (librosa, numpy versions)

## 4. Error Handling & Edge Cases
- [ ] 4.1 Handle audio files with duration mismatches (< 30s padding, > 30s chunking)
- [ ] 4.2 Handle Python not installed or script not found
- [ ] 4.3 Handle missing tokenizer files gracefully with clear error messages
- [ ] 4.4 Handle model output shapes that don't match expected format
- [ ] 4.5 Add user-facing error notifications for inference failures

## 5. Documentation
- [ ] 5.1 Update IMPLEMENTATION_NOTES.md to mark TODOs as completed
- [ ] 5.2 Add performance benchmarks (RTF, latency) to PROJECT_STATUS.md
- [ ] 5.3 Create troubleshooting guide for common inference errors
