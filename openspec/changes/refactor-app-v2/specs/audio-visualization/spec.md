## ADDED Requirements

### Requirement: Real-time Audio Waveform
The application SHALL display a real-time waveform visualization during audio recording.

#### Scenario: Display waveform while recording
- **WHEN** the user starts recording
- **THEN** the recording overlay SHALL display an animated waveform
- **AND** the waveform SHALL reflect the actual audio input in real-time
- **AND** the animation SHALL run at 60fps for smooth visualization

#### Scenario: Waveform stops when recording stops
- **WHEN** the user stops recording
- **THEN** the waveform animation SHALL stop
- **AND** the display SHALL transition to "Processing..." state

### Requirement: Audio Visualization Implementation
The application SHALL use Web Audio API for audio visualization.

#### Scenario: Initialize audio context
- **WHEN** recording starts
- **THEN** the application SHALL create an AudioContext
- **AND** connect an AnalyserNode to the audio input stream
- **AND** use getByteTimeDomainData for waveform data

#### Scenario: Render waveform on canvas
- **WHEN** audio data is available
- **THEN** the application SHALL render the waveform on a canvas element
- **AND** the canvas SHALL be sized appropriately for the recording overlay
- **AND** the waveform color SHALL match the application theme
