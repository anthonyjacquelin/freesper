## ADDED Requirements

### Requirement: Simplified Model Catalog
The application SHALL provide exactly two ASR models: Parakeet INT8 (639 MB, multilingue) and Whisper Tiny (150 MB).

#### Scenario: Display available models
- **WHEN** the user opens the Model Manager
- **THEN** the application SHALL display exactly two models: "Parakeet INT8" and "Whisper Tiny"
- **AND** each model SHALL show its name, size, and description

#### Scenario: Download Parakeet INT8
- **WHEN** the user clicks "Install" on Parakeet INT8
- **THEN** the application SHALL download the sherpa-onnx model files (encoder.int8.onnx, decoder.int8.onnx, joiner.int8.onnx, tokens.txt)
- **AND** the application SHALL show download progress
- **AND** the total download size SHALL be approximately 639 MB

#### Scenario: Download Whisper Tiny
- **WHEN** the user clicks "Install" on Whisper Tiny
- **THEN** the application SHALL download and convert the Whisper Tiny model
- **AND** the application SHALL show conversion progress
- **AND** the total size SHALL be approximately 150 MB

### Requirement: Parakeet INT8 Inference
The application SHALL use sherpa-onnx via Python subprocess for Parakeet INT8 inference.

#### Scenario: Transcribe with Parakeet INT8
- **WHEN** Parakeet INT8 is loaded and user records audio
- **THEN** the application SHALL invoke the sherpa-onnx Python script
- **AND** the transcription SHALL support 25 European languages including French
- **AND** the inference time SHALL be less than 2 seconds for 30 seconds of audio

### Requirement: Model Selection Persistence
The application SHALL remember the user's selected model between sessions.

#### Scenario: Remember selected model
- **WHEN** the user loads a model and restarts the application
- **THEN** the application SHALL automatically load the previously selected model
