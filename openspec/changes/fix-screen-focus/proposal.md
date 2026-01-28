# Change: fix-screen-focus

## Why
Currently, when users press the global hotkey to start recording, the recording window appears on the primary display (screen with the macOS Dock) instead of staying on the screen where the user is currently working. This causes an annoying screen switch when users are working on secondary displays, disrupting their workflow.

## What Changes
- Modify the window positioning logic in `showRecordingWindow()` to detect the active screen
- Use cursor position or focused window position to determine which screen to display on
- Maintain backward compatibility with single-screen setups
- Add fallback to primary display if screen detection fails

## Impact
- Affected specs: window-management spec (new)
- Affected code: `src/main.js` - `showRecordingWindow()` function
- No breaking changes for existing functionality