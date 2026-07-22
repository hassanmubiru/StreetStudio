# StreetStudio Keyboard Shortcuts System

## Overview

The StreetStudio web application now includes a comprehensive keyboard shortcuts system with context-sensitive shortcuts, conflict resolution, accessibility support, and visual indicators.

## Features Implemented

### ✅ Global Keyboard Shortcut Manager
- **Centralized Registration**: All shortcuts are managed through a single `KeyboardShortcuts` class
- **Conflict Resolution**: Priority-based conflict resolution with warnings for conflicting shortcuts
- **Dynamic Registration/Unregistration**: Shortcuts can be registered and removed at runtime

### ✅ Context-Sensitive Shortcuts
Different keyboard shortcuts are available based on the current application context:

#### Global Context (Available everywhere)
- `Cmd/Ctrl+K`: Open global search
- `/`: Focus search input
- `Cmd/Ctrl+N`: Start new recording
- `Escape`: Close modals and overlays
- `Alt+D`: Navigate to dashboard
- `Alt+P`: Navigate to projects
- `Alt+R`: Navigate to recordings
- `Alt+S`: Navigate to settings

#### Dashboard Context
- `Cmd/Ctrl+R`: Refresh dashboard
- `Cmd/Ctrl+F`: Filter dashboard content

#### Recordings Context
- `Space`: Start/stop recording
- `Delete`: Delete selected recording

#### Video Review Context
- `Space`: Play/pause video
- `J`: Rewind 10 seconds
- `L`: Forward 10 seconds
- `K`: Play/pause (alternative)
- `F`: Toggle fullscreen
- `C`: Add comment at current time
- `M`: Toggle mute
- `←`: Rewind 10 seconds
- `→`: Forward 10 seconds

#### Video Editor Context
- `Space`: Play/pause timeline
- `I`: Set in point
- `O`: Set out point
- `X`: Cut at playhead
- `Cmd/Ctrl+Z`: Undo last action
- `Cmd/Shift+Z`: Redo last action
- `Cmd/Ctrl+S`: Save project

#### Projects Context
- `Cmd/Ctrl+N`: Create new project
- `Delete`: Delete selected project

#### Search Context
- `Enter`: Execute search
- `↓`: Navigate to next result
- `↑`: Navigate to previous result

### ✅ Accessibility Support

#### ARIA Integration
- **Live Regions**: Screen reader announcements for shortcut actions and context changes
- **Proper Labeling**: All interactive elements have appropriate ARIA labels
- **Keyboard Navigation**: Complete keyboard navigation with visible focus indicators

#### Skip Links
- `Alt+1`: Skip to main content
- `Alt+2`: Skip to navigation
- `Alt+3`: Skip to search

#### Accessibility Toggles
- `Alt+H`: Toggle high contrast mode
- `Alt+M`: Toggle reduced motion

#### Help System
- `F1` or `?`: Show keyboard shortcuts help overlay
- `Esc`: Close help overlay

### ✅ Visual Indicators

#### Context Indicator
- Shows current keyboard context in top-right corner
- Displays active shortcut when keys are pressed
- Auto-hides after 2 seconds

#### Help Overlay
- Comprehensive list of all available shortcuts
- Organized by context with visual grouping
- Shows which context is currently active
- Responsive grid layout for better organization

## Usage Examples

### Registering Custom Shortcuts

```typescript
import { KeyboardShortcuts } from './app/keyboard-shortcuts.js';

const shortcuts = new KeyboardShortcuts({
  enableVisualIndicators: true,
  showHelpOverlay: true,
});

// Register a single shortcut
shortcuts.register({
  key: 'j',
  modifiers: ['ctrl'],
  context: 'editor',
  description: 'Jump to definition',
  handler: (event) => {
    event.preventDefault();
    jumpToDefinition();
  },
  priority: 100,
});

// Register multiple shortcuts
shortcuts.register([
  {
    key: 's',
    modifiers: ['cmd', 'ctrl'],
    description: 'Save document',
    handler: () => saveDocument(),
    priority: 90,
  },
  {
    key: 'p',
    modifiers: ['cmd', 'ctrl'],
    context: 'editor',
    description: 'Print document',
    handler: () => printDocument(),
  },
]);
```

### Context Management

```typescript
// Set current context
shortcuts.setContext('video-editor');

// Get shortcuts for specific context
const editorShortcuts = shortcuts.getShortcutsForContext('video-editor');

// Listen for context changes in components
document.addEventListener('keyboardshortcut:context-change', (event) => {
  console.log('Context changed to:', event.detail.context);
});
```

### Integration with Components

Components can listen for keyboard shortcut events:

```typescript
// Video player component
class VideoPlayer {
  constructor() {
    // Listen for play/pause shortcut
    document.addEventListener('keyboardshortcut:toggle-playback', () => {
      this.togglePlayback();
    });

    // Listen for seek shortcuts
    document.addEventListener('keyboardshortcut:seek', (event) => {
      this.seek(event.detail.seconds);
    });
  }
}
```

## Technical Architecture

### Class Structure
- `KeyboardShortcuts`: Main class managing all shortcuts
- `KeyboardShortcut`: Interface defining shortcut properties
- Context-sensitive registration and execution
- Priority-based conflict resolution
- Accessibility feature integration

### Event System
The system uses custom events for component communication:
- `keyboardshortcut:escape`: Escape key pressed
- `keyboardshortcut:toggle-playback`: Play/pause requested
- `keyboardshortcut:seek`: Seek video requested
- And more context-specific events

### Performance Considerations
- Efficient event handling with single global listeners
- Lazy loading of help overlay
- Optimized shortcut lookup with Map-based storage
- Debounced visual indicator updates

## Browser Compatibility

The keyboard shortcuts system supports:
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Keyboard and screen reader accessibility
- Cross-platform modifier key handling (Cmd on Mac, Ctrl on PC)
- Touch device compatibility (shortcuts disabled on touch-only devices)

## Requirements Validation

### ✅ Requirement 11.1: Complete keyboard navigation with visible focus indicators
- All interactive elements are keyboard accessible
- Focus indicators are clearly visible and styled
- Logical tab order throughout the application
- Skip links for efficient navigation

### ✅ Requirement 11.2: Proper ARIA labels, roles, and descriptions
- All shortcuts have descriptive text
- Interactive elements have appropriate ARIA labels
- Help overlay is properly labeled as a dialog
- Live regions announce shortcut actions and context changes
- Screen reader support for all functionality

## Future Enhancements

- User customization of keyboard shortcuts
- Import/export of shortcut configurations
- Shortcut recording functionality
- Integration with external accessibility tools
- Analytics for shortcut usage patterns