## ADDED Requirements

### Requirement: Language Consistency
The transcription system SHALL maintain language consistency throughout a single recording, avoiding code-switching or language mixing when the user speaks in a single language.

#### Scenario: French-only speech transcribed consistently
- **GIVEN** a user records audio speaking entirely in French
- **WHEN** the transcription is processed
- **THEN** the output text SHALL be entirely in French without English or other language words mixed in

#### Scenario: Long recording maintains language
- **GIVEN** a user records 2+ minutes of French speech
- **WHEN** the transcription is processed
- **THEN** the system SHALL NOT switch to another language mid-transcription

### Requirement: Model Quality Indicators
The Model Manager SHALL display quality indicators for each available model to help users choose the best model for their needs.

#### Scenario: Display model quality score
- **GIVEN** the Model Manager is displaying available models
- **WHEN** a model card is rendered
- **THEN** it SHALL display a quality indicator (e.g., stars, badge, or score) showing:
  - Language consistency (★★★★★ = no mixing)
  - Transcription accuracy (WER-based)
  - Speed/Performance (RTF)

#### Scenario: Recommended model highlighted
- **GIVEN** multiple models are available
- **WHEN** the Model Manager displays the list
- **THEN** the highest quality model SHALL be marked as "Recommandé" or with a prominent badge

### Requirement: Language Selection (Optional)
The system SHALL allow users to optionally specify their preferred language to improve transcription accuracy.

#### Scenario: Force French language
- **GIVEN** a user selects "Français" in Settings
- **WHEN** recording and transcribing audio
- **THEN** the system SHALL optimize inference parameters for French (if supported by the model)

#### Scenario: Automatic language detection fallback
- **GIVEN** no language is explicitly selected
- **WHEN** the system transcribes audio
- **THEN** it SHALL use automatic language detection but prioritize consistency over switching

## MODIFIED Requirements

### Requirement: Transcription Quality
The system SHALL transcribe speech with high accuracy, including proper punctuation and capitalization.

**Previous behavior**: Parakeet INT8 frequently mixes languages, producing unusable transcriptions like:
> "I'm saying I'm a problem of transcription, in fact, because the whole project which I pass in anglais"

**New behavior**: The system SHALL produce clean, single-language transcriptions:
> "Je suis en train de parler d'un problème de transcription, en fait, parce que tout le projet..."

#### Scenario: Punctuation accuracy
- **GIVEN** a user speaks with natural pauses and intonation
- **WHEN** the transcription is processed
- **THEN** the system SHALL insert appropriate punctuation (periods, commas) automatically

#### Scenario: Capitalization accuracy
- **GIVEN** a user starts a new sentence or mentions proper nouns
- **WHEN** the transcription is processed
- **THEN** the system SHALL capitalize appropriately (sentence starts, names, places)

#### Scenario: Technical vocabulary
- **GIVEN** a user speaks technical terms (product names, code terms)
- **WHEN** the transcription is processed
- **THEN** the system SHALL transcribe technical terms accurately without language switching

### Requirement: Model Selection
The Model Manager SHALL provide clear information about each model's capabilities to help users choose the right model.

**Previous behavior**: Models listed with size and generic description only.

**New behavior**: Models include quality metrics, language support details, and use-case recommendations.

#### Scenario: Compare models
- **GIVEN** a user is in the Model Manager
- **WHEN** viewing available models
- **THEN** each model SHALL display:
  - Supported languages (with flags or codes)
  - Quality score (accuracy, consistency)
  - Performance metrics (RTF, memory usage)
  - Recommended use cases (e.g., "Best for French", "Fast for short clips")

## REMOVED Requirements

None. No existing requirements are being removed.
