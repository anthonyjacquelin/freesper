## ADDED Requirements

### Requirement: Smart Window Positioning
The application SHALL position windows on the screen where the user is currently active, rather than always using the primary display.

#### Scenario: Recording window follows cursor
- **WHEN** user presses global hotkey to start recording
- **AND** cursor is on a secondary display
- **THEN** recording window SHALL appear centered on that display
- **AND** user SHALL NOT need to switch screens to see the recording window

#### Scenario: Fallback to primary display
- **WHEN** active screen detection fails
- **THEN** recording window SHALL appear on primary display
- **AND** functionality SHALL remain intact

### Requirement: Screen Detection Logic
The application SHALL detect the active screen using cursor position.

#### Scenario: Cursor-based detection
- **WHEN** positioning a window
- **THEN** application SHALL use `screen.getCursorScreenPoint()` to get current cursor position
- **AND** SHALL use `screen.getDisplayNearestPoint()` to determine target display
- **AND** SHALL center window on that display's work area