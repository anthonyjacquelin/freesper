## ADDED Requirements

### Requirement: Customizable Recording Hotkey
The application SHALL allow users to configure their preferred keyboard shortcut for starting/stopping recording.

#### Scenario: Display current hotkey
- **WHEN** the user opens Settings
- **THEN** the current hotkey SHALL be displayed in the hotkey input field
- **AND** the default hotkey SHALL be "CommandOrControl+Shift+Space"

#### Scenario: Capture new hotkey
- **WHEN** the user clicks on the hotkey input field
- **THEN** the field SHALL enter capture mode (visual indication)
- **AND** the next key combination pressed SHALL be captured
- **AND** the new hotkey SHALL be displayed in the field

#### Scenario: Save hotkey configuration
- **WHEN** the user saves settings with a new hotkey
- **THEN** the application SHALL persist the hotkey to electron-store
- **AND** the global shortcut SHALL be re-registered immediately
- **AND** the old shortcut SHALL be unregistered

### Requirement: Hotkey Validation
The application SHALL validate hotkey configurations.

#### Scenario: Validate modifier keys
- **WHEN** the user attempts to set a hotkey without modifier keys
- **THEN** the application SHALL show an error message
- **AND** the hotkey SHALL NOT be saved

#### Scenario: Prevent system conflicts
- **WHEN** the user attempts to set a common system shortcut (e.g., Cmd+C, Cmd+V)
- **THEN** the application SHALL warn the user about potential conflicts
- **AND** allow them to proceed or choose a different shortcut

### Requirement: Hotkey Persistence
The application SHALL remember the configured hotkey across sessions.

#### Scenario: Load saved hotkey on startup
- **WHEN** the application starts
- **THEN** the saved hotkey SHALL be loaded from electron-store
- **AND** the global shortcut SHALL be registered with the saved hotkey
