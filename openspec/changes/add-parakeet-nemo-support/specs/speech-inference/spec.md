## ADDED Requirements

### Requirement: NeMo Model Architecture Support
The system SHALL support speech inference using NeMo-based models (Parakeet TDT v3) via Python subprocess, in addition to existing ONNX models.

#### Scenario: Detect NeMo model architecture
- **GIVEN** a model directory containing encoder.pt, decoder.pt, joint.pt, and tokenizer.model files
- **WHEN** the model manager checks the architecture
- **THEN** it SHALL identify the architecture as "nemo" and enable NeMo inference path

#### Scenario: Load NeMo model successfully
- **GIVEN** NeMo dependencies are installed and model files are present
- **WHEN** user selects Parakeet TDT v3 model
- **THEN** the system SHALL load the model via Python/NeMo subprocess within 10 seconds
- **AND** display loading progress to the user

#### Scenario: Handle missing NeMo dependencies
- **GIVEN** NeMo toolkit is not installed
- **WHEN** user attempts to use Parakeet model
- **THEN** the system SHALL display an error with installation instructions
- **AND** gracefully fallback to available ONNX models

### Requirement: Python Subprocess Inference
The system SHALL execute speech-to-text inference for NeMo models using a Python subprocess that communicates via JSON.

#### Scenario: Transcribe audio with NeMo subprocess
- **GIVEN** a Parakeet model is loaded and an audio file path is provided
- **WHEN** transcription is requested
- **THEN** the system SHALL spawn Python subprocess with NeMo script
- **AND** pass audio file path via stdin/command args
- **AND** receive transcription result as JSON via stdout
- **AND** return transcribed text to the application

#### Scenario: Handle subprocess timeout
- **GIVEN** a transcription is in progress via subprocess
- **WHEN** the subprocess exceeds 30 seconds without response
- **THEN** the system SHALL terminate the subprocess
- **AND** return an error message to the user

#### Scenario: Handle subprocess crash
- **GIVEN** a Python subprocess crashes during transcription
- **WHEN** the crash is detected (non-zero exit code)
- **THEN** the system SHALL log the error details
- **AND** return a user-friendly error message

### Requirement: Model File Management
The system SHALL use Parakeet TDT v3 .nemo file directly from HuggingFace cache without requiring manual installation.

#### Scenario: Use model from HuggingFace cache
- **GIVEN** Parakeet TDT v3 has been downloaded via NeMo from_pretrained()
- **WHEN** the model is loaded
- **THEN** the system SHALL use the .nemo file from `~/.cache/huggingface/hub/models--nvidia--parakeet-tdt-0.6b-v3/`
- **AND** not require copying to application models directory

#### Scenario: Display model in catalog
- **GIVEN** Model Manager is opened
- **WHEN** the available models list is displayed
- **THEN** Parakeet TDT v3 SHALL appear with description "NVIDIA Parakeet - Multilingue 25 langues (dont FR) - Haute qualité"
- **AND** display size as "2.3GB"
- **AND** show badge "Multilingue" and "Haute Qualité"

### Requirement: Multilingual Transcription
The system SHALL support automatic language detection for 25 European languages when using Parakeet TDT v3, including French.

#### Scenario: Transcribe French audio
- **GIVEN** Parakeet TDT v3 is loaded
- **WHEN** a French audio file is transcribed
- **THEN** the system SHALL automatically detect French language
- **AND** return accurate French transcription without requiring explicit language parameter

#### Scenario: Transcribe English audio
- **GIVEN** Parakeet TDT v3 is loaded
- **WHEN** an English audio file is transcribed
- **THEN** the system SHALL automatically detect English language
- **AND** return accurate English transcription

### Requirement: Python Dependency Management
The system SHALL use `pyproject.toml` and `uv` for managing Python dependencies required by NeMo models.

#### Scenario: Install NeMo dependencies
- **GIVEN** pyproject.toml includes nemo_toolkit[asr] dependency
- **WHEN** user runs `uv sync` or `uv add nemo_toolkit[asr]`
- **THEN** the system SHALL install NeMo Toolkit and all required dependencies
- **AND** create a virtual environment at `.venv/`

#### Scenario: Verify dependencies before inference
- **GIVEN** user attempts to use Parakeet model
- **WHEN** inference is requested
- **THEN** the system SHALL check if nemo_toolkit is importable
- **AND** display clear error with installation command if missing

## MODIFIED Requirements

### Requirement: Model Architecture Detection
The system SHALL detect the model architecture (single-model, whisper-multi-model, transducer, or nemo) by examining files present in the model directory.

#### Scenario: Detect NeMo/TorchScript architecture
- **GIVEN** a model directory contains encoder.pt, decoder.pt, joint.pt
- **WHEN** modelExists() is called
- **THEN** return `{ exists: true, path: modelDir, architecture: 'nemo' }`

#### Scenario: Detect ONNX transducer architecture  
- **GIVEN** a model directory contains encoder.onnx, decoder.onnx, joiner.onnx
- **WHEN** modelExists() is called
- **THEN** return `{ exists: true, path: modelDir, architecture: 'transducer' }`

#### Scenario: Detect Whisper multi-model architecture
- **GIVEN** a model directory contains encoder_model.onnx, decoder_model.onnx, decoder_with_past_model.onnx
- **WHEN** modelExists() is called
- **THEN** return `{ exists: true, path: modelDir, architecture: 'whisper-multi-model' }`

#### Scenario: Detect single-model architecture
- **GIVEN** a model directory contains model.onnx
- **WHEN** modelExists() is called
- **THEN** return `{ exists: true, path: singleModelPath, architecture: 'single-model' }`
