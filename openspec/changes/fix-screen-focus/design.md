## Context
The current implementation uses `screen.getPrimaryDisplay()` which always returns the main screen (with macOS Dock), regardless of where the user is working. This causes the recording window to appear on the wrong screen in multi-monitor setups.

## Goals / Non-Goals
- Goals: Detect active screen based on user activity and position recording window there
- Non-Goals: Change window appearance, add new UI elements, modify recording functionality

## Decisions
- **Screen Detection Method**: Use cursor position (`screen.getCursorScreenPoint()`) as primary method since it's reliable and reflects user focus
- **Fallback Strategy**: Fall back to primary display if cursor detection fails
- **Positioning Logic**: Center window on detected screen's workArea (excluding system UI elements)

## Risks / Trade-offs
- **Performance**: Screen detection is fast (native Electron API) but could theoretically delay window appearance by 1-2ms
- **Edge Cases**: Cursor at screen boundaries might be ambiguous - using nearest screen as tiebreaker
- **Complexity**: Adding minimal code complexity for significant UX improvement

## Implementation Approach
1. Replace `getPrimaryDisplay()` with `getDisplayNearestPoint(getCursorScreenPoint())`
2. Use `workAreaSize` instead of `size` to respect system UI
3. Add error handling for screen detection failures