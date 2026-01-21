## ADDED Requirements

### Requirement: Transcription History Storage
The application SHALL maintain a history of the last 50 transcriptions.

#### Scenario: Store transcription
- **WHEN** a transcription is completed
- **THEN** the application SHALL store the transcription with timestamp, text content, and audio duration
- **AND** the history SHALL be persisted across application restarts

#### Scenario: Limit history size
- **WHEN** a new transcription is added and history contains 50 entries
- **THEN** the application SHALL remove the oldest entry (FIFO)
- **AND** the history SHALL never exceed 50 entries

### Requirement: History View
The application SHALL provide a dedicated view to browse transcription history.

#### Scenario: Display history list
- **WHEN** the user opens the History view
- **THEN** the application SHALL display all stored transcriptions
- **AND** each entry SHALL show the date/time, text preview, and duration
- **AND** entries SHALL be sorted by date (most recent first)

#### Scenario: Copy from history
- **WHEN** the user clicks the copy button on a history entry
- **THEN** the full transcription text SHALL be copied to clipboard
- **AND** visual feedback SHALL confirm the copy action

### Requirement: History Access
The application SHALL provide easy access to the history view.

#### Scenario: Access via menu
- **WHEN** the user right-clicks the tray/dock icon
- **THEN** a "History" option SHALL be available in the menu
- **AND** clicking it SHALL open the History view
