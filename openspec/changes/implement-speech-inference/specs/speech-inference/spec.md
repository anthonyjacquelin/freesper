# Speech Inference Capability

## ADDED Requirements

### Requirement: Mel-Spectrogram Feature Extraction
The inference engine SHALL convert raw audio waveforms into log-mel spectrograms suitable for speech recognition model input.

#### Scenario: 16kHz mono WAV audio conversion
- **WHEN** a 16kHz mono WAV file is provided to `extractFeatures()`
- **THEN** the system SHALL invoke Python script `scripts/extract_features.py` with the audio file path
- **AND** parse the JSON output containing features array and shape dimensions
- **AND** convert features to Float32Array with shape [1, n_mels, time_steps]
- **AND** return a tensor-compatible object with `data` and `dims` properties

#### Scenario: Audio duration handling
- **WHEN** audio duration is less than 30 seconds
- **THEN** the system SHALL pad with zeros to reach 30 seconds
- **WHEN** audio duration exceeds 30 seconds
- **THEN** the system SHALL truncate to 30 seconds

#### Scenario: Python subprocess failure
- **WHEN** Python is not installed or script fails to execute
- **THEN** the system SHALL throw an error with message indicating missing Python dependencies
- **AND** log the subprocess stderr output for debugging

#### Scenario: Feature validation
- **WHEN** features are extracted
- **THEN** the system SHALL validate that n_mels equals 80 (standard for Whisper/Parakeet)
- **AND** validate that time_steps is a positive integer
- **AND** throw an error if dimensions are invalid

### Requirement: Token Decoding
The inference engine SHALL decode model output token IDs into human-readable text using vocabulary files.

#### Scenario: Basic token decoding
- **WHEN** model inference produces token ID array [464, 318, 257, 1332]
- **THEN** tokenizer SHALL map each ID to corresponding text token from vocab.json
- **AND** concatenate tokens into final transcription string

#### Scenario: Special token filtering
- **WHEN** token IDs include special tokens (BOS, EOS, PAD, UNK)
- **THEN** tokenizer SHALL skip these tokens in final output
- **AND** not include them in concatenated text

#### Scenario: Subword token handling
- **WHEN** tokens use WordPiece encoding (prefix `##`)
- **THEN** tokenizer SHALL remove `##` prefix and concatenate without spaces
- **WHEN** tokens use SentencePiece encoding (prefix `▁`)
- **THEN** tokenizer SHALL replace `▁` with space character

#### Scenario: Missing vocabulary files
- **WHEN** model directory lacks vocab.json or tokenizer.json
- **THEN** loadModel() SHALL fail with clear error message
- **AND** indicate which vocabulary files are missing

#### Scenario: Decode empty or invalid output
- **WHEN** model output tensor is empty or has unexpected shape
- **THEN** tokenizer SHALL return empty string
- **AND** log warning about unexpected output format

### Requirement: End-to-End Transcription Pipeline
The inference engine SHALL orchestrate feature extraction, model inference, and text decoding to produce transcriptions from audio files.

#### Scenario: Successful transcription
- **WHEN** `transcribe(audioFilePath)` is called with valid WAV file
- **THEN** system SHALL load audio data from file
- **AND** extract mel-spectrogram features via Python subprocess
- **AND** create ONNX tensor from features
- **AND** run inference session with prepared tensor
- **AND** decode output tokens to text using loaded tokenizer
- **AND** return final transcription string

#### Scenario: Model not loaded
- **WHEN** `transcribe()` is called before `loadModel()` completes
- **THEN** system SHALL throw error "Model not loaded"
- **AND** not attempt feature extraction or inference

#### Scenario: Audio file not found
- **WHEN** audio file path does not exist
- **THEN** system SHALL throw error indicating file not found
- **AND** include file path in error message

#### Scenario: Inference performance logging
- **WHEN** transcription completes successfully
- **THEN** system SHALL log feature extraction time, inference time, and decoding time
- **AND** calculate and log Real-Time Factor (RTF = processing_time / audio_duration)

### Requirement: Tokenizer Initialization
The inference engine SHALL load tokenizer vocabulary during model initialization to enable text decoding.

#### Scenario: Tokenizer loading on model load
- **WHEN** `loadModel(modelPath)` is called
- **THEN** system SHALL search model directory for vocab.json and tokenizer.json files
- **AND** instantiate Tokenizer class with found vocabulary files
- **AND** store tokenizer instance for use during transcription

#### Scenario: Multiple vocabulary file formats
- **WHEN** model directory contains tokenizer.json (Hugging Face format)
- **THEN** system SHALL parse and use that format
- **WHEN** model directory contains only vocab.json (legacy format)
- **THEN** system SHALL parse and use that format
- **WHEN** both files exist
- **THEN** system SHALL prefer tokenizer.json over vocab.json

#### Scenario: Vocabulary validation
- **WHEN** vocabulary files are loaded
- **THEN** system SHALL validate they contain non-empty token mappings
- **AND** validate special token IDs exist (BOS, EOS) if present in config.json

### Requirement: Error Handling and User Feedback
The inference pipeline SHALL provide clear error messages and recovery guidance when failures occur.

#### Scenario: Python dependency missing
- **WHEN** feature extraction fails due to missing librosa
- **THEN** system SHALL show error "Python dependencies not installed"
- **AND** provide command to install: "pip3 install librosa numpy"

#### Scenario: ONNX Runtime inference failure
- **WHEN** ONNX session.run() throws error
- **THEN** system SHALL catch error and rethrow with context
- **AND** include model path and input tensor shape in error message

#### Scenario: Tokenizer decode failure
- **WHEN** token ID not found in vocabulary
- **THEN** tokenizer SHALL use UNK token or skip unknown tokens
- **AND** log warning with problematic token ID

#### Scenario: User notification on transcription failure
- **WHEN** any step in transcription pipeline fails
- **THEN** main process SHALL show notification "Transcription failed"
- **AND** log detailed error to console for debugging
- **AND** not crash the application
