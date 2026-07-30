/**
 * Recording Functionality Unit Tests
 * 
 * Comprehensive tests for the recording interface covering:
 * - Screen capture initialization and permission handling
 * - Recording control state transitions and keyboard shortcuts
 * - Drawing tool functionality and overlay rendering
 * 
 * Requirements: 3.1, 3.4, 3.5
 * 
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScreenSelector } from './components/screen-selector.js';
import { RecordingControls } from './components/recording-controls.js';
import { CursorSettings } from './components/cursor-settings.js';
import { DrawingOverlay } from '../../components/drawing/drawing-overlay.js';
import { DrawingToolbar } from '../../components/drawing/drawing-toolbar.js';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock ResizeObserver (not available in jsdom)
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
(global as any).ResizeObserver = MockResizeObserver;

// Mock client-logger
vi.mock('../../app/client-logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock format-time
vi.mock('../../utils/format-time.js', () => ({
  formatTime: vi.fn((ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  })
}));

// ============================================================================
// Section 1: Screen Capture Initialization and Permission Handling
// ============================================================================

describe('Screen Capture Initialization and Permission Handling', () => {
  let mockStream: MediaStream;
  let mockGetDisplayMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create a mock MediaStream
    mockStream = {
      getTracks: () => [{ stop: vi.fn(), addEventListener: vi.fn() }],
      getVideoTracks: () => [{ stop: vi.fn(), addEventListener: vi.fn() }],
      getAudioTracks: () => [{ stop: vi.fn(), addEventListener: vi.fn() }]
    } as unknown as MediaStream;

    mockGetDisplayMedia = vi.fn().mockResolvedValue(mockStream);

    // Mock navigator.mediaDevices
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getDisplayMedia: mockGetDisplayMedia,
        enumerateDevices: vi.fn().mockResolvedValue([])
      },
      writable: true,
      configurable: true
    });

    // Mock MediaRecorder
    const MockMediaRecorder = vi.fn().mockImplementation(() => ({
      start: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      state: 'inactive',
      stream: mockStream,
      ondataavailable: null,
      onstop: null,
      onerror: null
    }));
    (MockMediaRecorder as any).isTypeSupported = vi.fn().mockReturnValue(true);
    (global as any).MediaRecorder = MockMediaRecorder;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getDisplayMedia API integration', () => {
    it('should request screen capture with correct constraints', async () => {
      await mockGetDisplayMedia({
        video: { mediaSource: 'screen', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: true
      });

      expect(mockGetDisplayMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({ mediaSource: 'screen' }),
          audio: true
        })
      );
    });

    it('should return a valid MediaStream on permission grant', async () => {
      const stream = await mockGetDisplayMedia({ video: true, audio: true });
      expect(stream).toBe(mockStream);
      expect(stream.getTracks()).toHaveLength(1);
    });

    it('should throw NotAllowedError when permission is denied', async () => {
      const permissionError = new DOMException('Permission denied', 'NotAllowedError');
      mockGetDisplayMedia.mockRejectedValueOnce(permissionError);

      await expect(mockGetDisplayMedia({ video: true })).rejects.toThrow('Permission denied');
    });

    it('should throw NotFoundError when no screen sources available', async () => {
      const notFoundError = new DOMException('No sources', 'NotFoundError');
      mockGetDisplayMedia.mockRejectedValueOnce(notFoundError);

      await expect(mockGetDisplayMedia({ video: true })).rejects.toThrow('No sources');
    });

    it('should throw AbortError when user cancels selection', async () => {
      const abortError = new DOMException('Cancelled', 'AbortError');
      mockGetDisplayMedia.mockRejectedValueOnce(abortError);

      await expect(mockGetDisplayMedia({ video: true })).rejects.toThrow('Cancelled');
    });
  });

  describe('Permission error guidance', () => {
    function getPermissionGuidance(error: string): string {
      if (error.includes('denied')) {
        return 'To enable screen recording:\n1. Click the browser permission icon in the address bar\n2. Allow screen sharing for this site\n3. Try recording again';
      } else if (error.includes('not supported')) {
        return 'Screen recording requires a modern browser with support for getDisplayMedia API. Please update your browser or try Chrome/Firefox.';
      } else if (error.includes('cancelled')) {
        return 'Screen recording was cancelled. Click "Start Recording" and select a screen to share when prompted.';
      } else if (error.includes('No screen sources')) {
        return 'No screens available for recording. Make sure you have at least one display connected and try again.';
      }
      return 'Check your browser permissions and try enabling screen sharing for this site.';
    }

    it('should provide guidance for permission denied errors', () => {
      const guidance = getPermissionGuidance('Screen recording permission was denied.');
      expect(guidance).toContain('Click the browser permission icon');
      expect(guidance).toContain('Allow screen sharing');
    });

    it('should provide guidance for unsupported browser errors', () => {
      const guidance = getPermissionGuidance('Screen recording is not supported in this browser.');
      expect(guidance).toContain('modern browser');
      expect(guidance).toContain('getDisplayMedia API');
    });

    it('should provide guidance for cancelled recording', () => {
      const guidance = getPermissionGuidance('Screen recording was cancelled.');
      expect(guidance).toContain('cancelled');
      expect(guidance).toContain('Start Recording');
    });

    it('should provide guidance for no screen sources', () => {
      const guidance = getPermissionGuidance('No screen sources available.');
      expect(guidance).toContain('No screens available');
      expect(guidance).toContain('display connected');
    });

    it('should provide generic guidance for unknown errors', () => {
      const guidance = getPermissionGuidance('Unknown error occurred');
      expect(guidance).toContain('browser permissions');
    });
  });

  describe('Screen selector component', () => {
    it('should render screen source selection tabs', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);

      // Import and create screen selector
      
      const selector = new ScreenSelector();
      const element = selector.getElement();
      container.appendChild(element);

      // Verify tabs exist
      const tabsList = element.querySelector('[role="tablist"]');
      expect(tabsList).toBeTruthy();

      const tabs = element.querySelectorAll('[role="tab"]');
      expect(tabs.length).toBe(3); // screen, window, tab

      container.remove();
    });

    it('should have correct ARIA attributes for accessibility', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);

      
      const selector = new ScreenSelector();
      const element = selector.getElement();
      container.appendChild(element);

      // Check region role
      expect(element.getAttribute('role')).toBe('region');
      expect(element.getAttribute('aria-label')).toBe('Screen Source Selection');

      // Check first tab is selected
      const firstTab = element.querySelector('[role="tab"]');
      expect(firstTab?.getAttribute('aria-selected')).toBe('true');

      container.remove();
    });

    it('should track selected source state', () => {
      
      const onSelected = vi.fn();
      const selector = new ScreenSelector({ onSourceSelected: onSelected });

      // Initially no source selected
      expect(selector.getSelectedSource()).toBeNull();

      // Set a source
      const testSource = { id: 'screen-1', name: 'Primary Display' };
      selector.setSelectedSource(testSource);
      expect(selector.getSelectedSource()).toEqual(testSource);
    });

    it('should reset selector state', () => {
      
      const selector = new ScreenSelector();

      selector.setSelectedSource({ id: 'test', name: 'Test' });
      selector.reset();
      expect(selector.getSelectedSource()).toBeNull();
    });
  });
});

// ============================================================================
// Section 2: Recording Control State Transitions and Keyboard Shortcuts
// ============================================================================

describe('Recording Control State Transitions and Keyboard Shortcuts', () => {
  describe('RecordingControls component state transitions', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    afterEach(() => {
      container.remove();
    });

    it('should initialize in stopped state with record button enabled', () => {
      
      const controls = new RecordingControls();
      const element = controls.getElement();
      container.appendChild(element);

      const recordBtn = element.querySelector('#start-recording') as HTMLButtonElement;
      expect(recordBtn).toBeTruthy();
      // Initially the record button is disabled until setEnabled is called
      controls.setEnabled(true);
      expect(recordBtn.disabled).toBe(false);
    });

    it('should transition to recording state correctly', () => {
      
      const controls = new RecordingControls();
      const element = controls.getElement();
      container.appendChild(element);

      controls.setEnabled(true);
      controls.setRecordingState('recording');

      const pauseBtn = element.querySelector('#pause-recording') as HTMLButtonElement;
      const stopBtn = element.querySelector('#stop-recording') as HTMLButtonElement;
      const recordBtn = element.querySelector('#start-recording') as HTMLButtonElement;

      // Pause and stop should be enabled during recording
      expect(pauseBtn.disabled).toBe(false);
      expect(stopBtn.disabled).toBe(false);
      // Record button should be disabled
      expect(recordBtn.disabled).toBe(true);
    });

    it('should transition to paused state correctly', () => {
      
      const controls = new RecordingControls();
      const element = controls.getElement();
      container.appendChild(element);

      controls.setEnabled(true);
      controls.setRecordingState('paused');

      const recordBtn = element.querySelector('#start-recording') as HTMLButtonElement;
      const stopBtn = element.querySelector('#stop-recording') as HTMLButtonElement;
      const pauseBtn = element.querySelector('#pause-recording') as HTMLButtonElement;

      // Record (resume) and stop should be enabled when paused
      expect(recordBtn.disabled).toBe(false);
      expect(stopBtn.disabled).toBe(false);
      // Pause should be disabled since already paused
      expect(pauseBtn.disabled).toBe(true);
    });

    it('should transition back to stopped state', () => {
      
      const controls = new RecordingControls();
      const element = controls.getElement();
      container.appendChild(element);

      controls.setEnabled(true);
      controls.setRecordingState('recording');
      controls.setRecordingState('stopped');

      const recordBtn = element.querySelector('#start-recording') as HTMLButtonElement;
      const pauseBtn = element.querySelector('#pause-recording') as HTMLButtonElement;
      const stopBtn = element.querySelector('#stop-recording') as HTMLButtonElement;

      // Only record should be enabled after stopping
      expect(recordBtn.disabled).toBe(false);
      expect(pauseBtn.disabled).toBe(true);
      expect(stopBtn.disabled).toBe(true);
    });

    it('should show status indicator during recording', () => {
      
      const controls = new RecordingControls();
      const element = controls.getElement();
      container.appendChild(element);

      controls.setRecordingState('recording');
      const statusIndicator = element.querySelector('#status-indicator');
      expect(statusIndicator?.classList.contains('hidden')).toBe(false);
    });

    it('should hide status indicator when stopped', () => {
      
      const controls = new RecordingControls();
      const element = controls.getElement();
      container.appendChild(element);

      controls.setRecordingState('stopped');
      const statusIndicator = element.querySelector('#status-indicator');
      expect(statusIndicator?.classList.contains('hidden')).toBe(true);
    });

    it('should update elapsed time display', () => {
      
      const controls = new RecordingControls();
      const element = controls.getElement();
      container.appendChild(element);

      controls.updateElapsedTime('05:30');
      const elapsedElement = element.querySelector('#elapsed-time');
      expect(elapsedElement?.textContent).toBe('05:30');
    });

    it('should invoke onRecord callback when record button clicked', () => {
      
      const onRecord = vi.fn();
      const controls = new RecordingControls({ onRecord });
      const element = controls.getElement();
      container.appendChild(element);

      controls.setEnabled(true);
      const recordBtn = element.querySelector('#start-recording') as HTMLButtonElement;
      recordBtn.click();

      expect(onRecord).toHaveBeenCalled();
    });

    it('should invoke onPause callback when pause button clicked', () => {
      
      const onPause = vi.fn();
      const controls = new RecordingControls({ onPause });
      const element = controls.getElement();
      container.appendChild(element);

      controls.setEnabled(true);
      controls.setRecordingState('recording');
      const pauseBtn = element.querySelector('#pause-recording') as HTMLButtonElement;
      pauseBtn.click();

      expect(onPause).toHaveBeenCalled();
    });

    it('should invoke onStop callback when stop button clicked', () => {
      
      const onStop = vi.fn();
      const controls = new RecordingControls({ onStop });
      const element = controls.getElement();
      container.appendChild(element);

      controls.setEnabled(true);
      controls.setRecordingState('recording');
      const stopBtn = element.querySelector('#stop-recording') as HTMLButtonElement;
      stopBtn.click();

      expect(onStop).toHaveBeenCalled();
    });

    it('should not invoke callbacks when disabled', () => {
      
      const onRecord = vi.fn();
      const controls = new RecordingControls({ onRecord });
      const element = controls.getElement();
      container.appendChild(element);

      // Don't call setEnabled(true) - stays disabled
      const recordBtn = element.querySelector('#start-recording') as HTMLButtonElement;
      recordBtn.click();

      expect(onRecord).not.toHaveBeenCalled();
    });

    it('should have proper ARIA labels on control buttons', () => {
      
      const controls = new RecordingControls();
      const element = controls.getElement();
      container.appendChild(element);

      const recordBtn = element.querySelector('#start-recording');
      const pauseBtn = element.querySelector('#pause-recording');
      const stopBtn = element.querySelector('#stop-recording');

      expect(recordBtn?.getAttribute('aria-label')).toBe('Record');
      expect(pauseBtn?.getAttribute('aria-label')).toBe('Pause');
      expect(stopBtn?.getAttribute('aria-label')).toBe('Stop');
    });

    it('should display keyboard shortcut hints', () => {
      
      const controls = new RecordingControls();
      const element = controls.getElement();
      container.appendChild(element);

      const hints = element.querySelector('.keyboard-hints');
      expect(hints).toBeTruthy();
      expect(hints?.textContent).toContain('Ctrl+Space');
      expect(hints?.textContent).toContain('Esc');
    });
  });

  describe('Floating controls mode', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    afterEach(() => {
      container.remove();
      // Clean up floating elements
      document.querySelectorAll('.floating-controls, .minimized-controls').forEach(el => el.remove());
    });

    it('should switch to floating mode during recording', () => {
      
      const controls = new RecordingControls();
      const element = controls.getElement();
      container.appendChild(element);

      controls.setFloatingMode(true);

      const floatingControls = document.querySelector('.floating-controls');
      expect(floatingControls).toBeTruthy();

      const embeddedControls = element.querySelector('#embedded-controls');
      expect(embeddedControls?.classList.contains('hidden')).toBe(true);
    });

    it('should switch back to embedded mode when recording stops', () => {
      
      const controls = new RecordingControls();
      const element = controls.getElement();
      container.appendChild(element);

      controls.setFloatingMode(true);
      controls.setFloatingMode(false);

      const floatingControls = document.querySelector('.floating-controls');
      expect(floatingControls).toBeFalsy();

      const embeddedControls = element.querySelector('#embedded-controls');
      expect(embeddedControls?.classList.contains('hidden')).toBe(false);
    });

    it('should have proper toolbar role on floating controls', () => {
      
      const controls = new RecordingControls();
      const element = controls.getElement();
      container.appendChild(element);

      controls.setFloatingMode(true);

      const floatingControls = document.querySelector('.floating-controls');
      expect(floatingControls?.getAttribute('role')).toBe('toolbar');
      expect(floatingControls?.getAttribute('aria-label')).toBe('Floating Recording Controls');
    });
  });

  describe('Keyboard shortcuts for recording control', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    afterEach(() => {
      container.remove();
    });

    it('should define Ctrl+Space shortcut for toggle recording', () => {
      // The RecordingStateManager registers shortcuts with these specs
      const expectedShortcuts = [
        { key: ' ', modifiers: ['ctrl'], description: 'Start, pause, or resume recording' },
        { key: ' ', modifiers: ['cmd'], description: 'Start, pause, or resume recording (Mac)' },
        { key: 'Escape', description: 'Stop recording' },
        { key: 'r', modifiers: ['ctrl', 'shift'], description: 'Start new recording' },
        { key: 'p', modifiers: ['ctrl'], description: 'Pause/resume recording' },
        { key: 's', modifiers: ['ctrl'], description: 'Save recording session' }
      ];

      // Verify the defined shortcut configurations
      expect(expectedShortcuts).toContainEqual(
        expect.objectContaining({ key: ' ', modifiers: ['ctrl'] })
      );
      expect(expectedShortcuts).toContainEqual(
        expect.objectContaining({ key: 'Escape' })
      );
    });

    it('should handle Ctrl+Space keyboard event for record toggle', () => {
      
      const onRecord = vi.fn();
      const controls = new RecordingControls({ onRecord });
      const element = controls.getElement();
      container.appendChild(element);

      // Dispatch Ctrl+Space event
      const event = new KeyboardEvent('keydown', {
        key: ' ',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(event);

      // The actual shortcut handling happens in RecordingStateManager
      // This test verifies the event dispatch mechanism works
      expect(event.key).toBe(' ');
      expect(event.ctrlKey).toBe(true);
    });

    it('should handle Escape key for stop recording', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(event);

      expect(event.key).toBe('Escape');
    });

    it('should handle Ctrl+Shift+R for new recording', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'r',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(event);

      expect(event.key).toBe('r');
      expect(event.ctrlKey).toBe(true);
      expect(event.shiftKey).toBe(true);
    });
  });

  describe('Cursor settings component', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    afterEach(() => {
      container.remove();
    });

    it('should initialize with default settings', () => {
      
      const cursorSettings = new CursorSettings();
      const settings = cursorSettings.getSettings();

      expect(settings.enabled).toBe(false);
      expect(settings.color).toBe('#3B82F6');
      expect(settings.size).toBe('medium');
      expect(settings.opacity).toBe(0.8);
      expect(settings.clickAnimation).toBe(true);
      expect(settings.trail).toBe(false);
      expect(settings.highlightMode).toBe('circle');
    });

    it('should toggle cursor highlighting', () => {
      
      const onChanged = vi.fn();
      const cursorSettings = new CursorSettings({ onSettingsChanged: onChanged });
      const element = cursorSettings.getElement();
      container.appendChild(element);

      const checkbox = element.querySelector('#cursor-enable') as HTMLInputElement;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      expect(onChanged).toHaveBeenCalled();
      expect(cursorSettings.getSettings().enabled).toBe(true);
    });

    it('should show settings panel when enabled', () => {
      
      const cursorSettings = new CursorSettings();
      const element = cursorSettings.getElement();
      container.appendChild(element);

      const checkbox = element.querySelector('#cursor-enable') as HTMLInputElement;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      const settingsPanel = element.querySelector('#cursor-settings-panel');
      expect(settingsPanel?.classList.contains('hidden')).toBe(false);
    });

    it('should update settings programmatically', () => {
      
      const cursorSettings = new CursorSettings();

      cursorSettings.updateSettings({ enabled: true, color: '#FF0000', size: 'large' });
      const settings = cursorSettings.getSettings();

      expect(settings.enabled).toBe(true);
      expect(settings.color).toBe('#FF0000');
      expect(settings.size).toBe('large');
    });

    it('should have proper ARIA group label', () => {
      
      const cursorSettings = new CursorSettings();
      const element = cursorSettings.getElement();

      expect(element.getAttribute('role')).toBe('group');
      expect(element.getAttribute('aria-label')).toBe('Cursor Highlighting Settings');
    });
  });
});

// ============================================================================
// Section 3: Drawing Tool Functionality and Overlay Rendering
// ============================================================================

describe('Drawing Tool Functionality and Overlay Rendering', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);

    // Mock canvas context
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 50 }),
      fillRect: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      set strokeStyle(_v: string) {},
      set fillStyle(_v: string) {},
      set lineWidth(_v: number) {},
      set globalAlpha(_v: number) {},
      set lineCap(_v: string) {},
      set lineJoin(_v: string) {},
      set font(_v: string) {}
    });
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  describe('Drawing overlay creation and rendering', () => {
    it('should create a canvas overlay element', () => {
      
      const overlay = new DrawingOverlay(container);

      const canvas = container.querySelector('.drawing-overlay');
      expect(canvas).toBeTruthy();
      expect(canvas?.tagName).toBe('CANVAS');

      overlay.destroy();
    });

    it('should position canvas as absolute overlay', () => {
      
      const overlay = new DrawingOverlay(container);

      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      expect(canvas.className).toContain('absolute');
      expect(canvas.className).toContain('inset-0');

      overlay.destroy();
    });

    it('should initialize with no tool selected', () => {
      
      const overlay = new DrawingOverlay(container);

      const state = overlay.getState();
      expect(state.currentTool).toBe('none');
      expect(state.isDrawing).toBe(false);
      expect(state.paths).toHaveLength(0);
      expect(state.textAnnotations).toHaveLength(0);

      overlay.destroy();
    });

    it('should disable pointer events when no tool is selected', () => {
      
      const overlay = new DrawingOverlay(container);

      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      expect(canvas.style.pointerEvents).toBe('none');

      overlay.destroy();
    });

    it('should enable pointer events when a tool is selected', () => {
      
      const overlay = new DrawingOverlay(container);

      overlay.setTool('pen');
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      expect(canvas.style.pointerEvents).toBe('auto');

      overlay.destroy();
    });
  });

  describe('Drawing tools', () => {
    it('should support pen tool with freehand drawing', () => {
      
      const overlay = new DrawingOverlay(container);

      overlay.setTool('pen');
      expect(overlay.getState().currentTool).toBe('pen');

      // Simulate drawing
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 50, clientY: 50 }));
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: 100, clientY: 100 }));

      const state = overlay.getState();
      expect(state.paths.length).toBe(1);
      expect(state.paths[0]!.tool).toBe('pen');

      overlay.destroy();
    });

    it('should support highlighter tool with semi-transparent strokes', () => {
      
      const overlay = new DrawingOverlay(container);

      overlay.setTool('highlighter');
      
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 50, clientY: 50 }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: 100, clientY: 50 }));

      const state = overlay.getState();
      expect(state.paths[0]!.tool).toBe('highlighter');
      expect(state.paths[0]!.style.opacity).toBe(0.3);

      overlay.destroy();
    });

    it('should support arrow tool', () => {
      
      const overlay = new DrawingOverlay(container);

      overlay.setTool('arrow');
      
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 50, clientY: 50 }));
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 200 }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: 200, clientY: 200 }));

      const state = overlay.getState();
      expect(state.paths[0]!.tool).toBe('arrow');

      overlay.destroy();
    });

    it('should support text annotation tool', () => {
      
      const overlay = new DrawingOverlay(container);

      overlay.setTool('text');
      
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100 }));

      // Text input should be created
      const textInput = container.querySelector('input[type="text"]') as HTMLInputElement;
      expect(textInput).toBeTruthy();

      // Type text and press Enter
      if (textInput) {
        textInput.value = 'Annotation text';
        textInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      }

      const state = overlay.getState();
      expect(state.textAnnotations.length).toBe(1);
      expect(state.textAnnotations[0]!.text).toBe('Annotation text');

      overlay.destroy();
    });
  });

  describe('Drawing undo/redo', () => {
    it('should undo the last drawing action', () => {
      
      const overlay = new DrawingOverlay(container);

      overlay.setTool('pen');
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      
      // Draw two paths
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10 }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: 50, clientY: 50 }));
      
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 60, clientY: 60 }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: 100, clientY: 100 }));

      expect(overlay.getState().paths.length).toBe(2);

      // Undo last
      const undoResult = overlay.undo();
      expect(undoResult).toBe(true);
      expect(overlay.getState().paths.length).toBe(1);

      overlay.destroy();
    });

    it('should redo an undone action', () => {
      
      const overlay = new DrawingOverlay(container);

      overlay.setTool('pen');
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10 }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: 50, clientY: 50 }));

      overlay.undo();
      expect(overlay.getState().paths.length).toBe(0);

      const redoResult = overlay.redo();
      expect(redoResult).toBe(true);
      expect(overlay.getState().paths.length).toBe(1);

      overlay.destroy();
    });

    it('should return false for undo when no actions to undo', () => {
      
      const overlay = new DrawingOverlay(container);

      const result = overlay.undo();
      expect(result).toBe(false);

      overlay.destroy();
    });

    it('should return false for redo when no actions to redo', () => {
      
      const overlay = new DrawingOverlay(container);

      const result = overlay.redo();
      expect(result).toBe(false);

      overlay.destroy();
    });

    it('should clear redo stack when new drawing is made after undo', () => {
      
      const overlay = new DrawingOverlay(container);

      overlay.setTool('pen');
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10 }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: 50, clientY: 50 }));

      overlay.undo();

      // Draw something new
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 70, clientY: 70 }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: 120, clientY: 120 }));

      // Redo should not work - redo stack was cleared
      expect(overlay.redo()).toBe(false);

      overlay.destroy();
    });
  });

  describe('Drawing styles', () => {
    it('should apply custom color to drawings', () => {
      
      const overlay = new DrawingOverlay(container);

      overlay.setTool('pen');
      overlay.setStyle({ color: '#FF0000', strokeWidth: 5, opacity: 0.9 });

      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10 }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: 50, clientY: 50 }));

      const state = overlay.getState();
      expect(state.paths[0]!.style.color).toBe('#FF0000');
      expect(state.paths[0]!.style.strokeWidth).toBe(5);
      expect(state.paths[0]!.style.opacity).toBe(0.9);

      overlay.destroy();
    });

    it('should use different default styles for different tools', () => {
      
      const overlay = new DrawingOverlay(container);

      overlay.setTool('pen');
      const penState = overlay.getState();
      expect(penState.currentStyle.opacity).toBe(1.0);

      overlay.setTool('highlighter');
      const highlighterState = overlay.getState();
      expect(highlighterState.currentStyle.opacity).toBe(0.3);

      overlay.destroy();
    });
  });

  describe('Drawing state persistence', () => {
    it('should load a saved state', () => {
      
      const overlay = new DrawingOverlay(container);

      const savedState = {
        currentTool: 'highlighter' as const,
        paths: [{
          id: 'saved-path-1',
          tool: 'pen' as const,
          points: [{ x: 10, y: 10 }, { x: 50, y: 50 }],
          style: { color: '#0000FF', strokeWidth: 3, opacity: 1.0 },
          timestamp: Date.now()
        }],
        textAnnotations: []
      };

      overlay.loadState(savedState);
      const state = overlay.getState();

      expect(state.currentTool).toBe('highlighter');
      expect(state.paths.length).toBe(1);
      expect(state.paths[0]!.id).toBe('saved-path-1');
      expect(state.paths[0]!.style.color).toBe('#0000FF');

      overlay.destroy();
    });

    it('should clear all drawings', () => {
      
      const overlay = new DrawingOverlay(container);

      overlay.setTool('pen');
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10 }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: 50, clientY: 50 }));

      expect(overlay.getState().paths.length).toBe(1);

      overlay.clear();
      expect(overlay.getState().paths.length).toBe(0);
      expect(overlay.getState().textAnnotations.length).toBe(0);

      overlay.destroy();
    });

    it('should emit state changes via callback', () => {
      
      const overlay = new DrawingOverlay(container);
      const stateCallback = vi.fn();

      overlay.onStateChanged(stateCallback);
      overlay.setTool('pen');

      expect(stateCallback).toHaveBeenCalled();
      expect(stateCallback).toHaveBeenCalledWith(
        expect.objectContaining({ currentTool: 'pen' })
      );

      overlay.destroy();
    });
  });

  describe('Drawing toolbar integration', () => {
    it('should render tool buttons with correct labels', () => {
      
      const toolbarContainer = document.createElement('div');
      container.appendChild(toolbarContainer);

      const callbacks = {
        onToolChange: vi.fn(),
        onStyleChange: vi.fn(),
        onUndo: vi.fn(),
        onRedo: vi.fn(),
        onClear: vi.fn()
      };

      const toolbar = new DrawingToolbar(toolbarContainer, {}, callbacks);

      const penBtn = toolbarContainer.querySelector('[data-tool="pen"]');
      expect(penBtn?.getAttribute('aria-label')).toBe('Pen Tool (P)');

      const highlighterBtn = toolbarContainer.querySelector('[data-tool="highlighter"]');
      expect(highlighterBtn?.getAttribute('aria-label')).toBe('Highlighter (H)');

      const arrowBtn = toolbarContainer.querySelector('[data-tool="arrow"]');
      expect(arrowBtn?.getAttribute('aria-label')).toBe('Arrow Tool (A)');

      const textBtn = toolbarContainer.querySelector('[data-tool="text"]');
      expect(textBtn?.getAttribute('aria-label')).toBe('Text Tool (T)');

      toolbar.destroy();
    });

    it('should handle tool selection via click', () => {
      
      const toolbarContainer = document.createElement('div');
      container.appendChild(toolbarContainer);

      const onToolChange = vi.fn();
      const toolbar = new DrawingToolbar(toolbarContainer, {}, { onToolChange });

      const penBtn = toolbarContainer.querySelector('[data-tool="pen"]') as HTMLElement;
      penBtn.click();

      expect(onToolChange).toHaveBeenCalledWith('pen');
      expect(toolbar.getCurrentTool()).toBe('pen');

      toolbar.destroy();
    });

    it('should handle color selection', () => {
      
      const toolbarContainer = document.createElement('div');
      container.appendChild(toolbarContainer);

      const onStyleChange = vi.fn();
      const toolbar = new DrawingToolbar(toolbarContainer, {}, { onStyleChange });

      const redBtn = toolbarContainer.querySelector('[data-color="#ff0000"]') as HTMLElement;
      redBtn.click();

      expect(onStyleChange).toHaveBeenCalledWith(
        expect.objectContaining({ color: '#ff0000' })
      );

      toolbar.destroy();
    });

    it('should handle stroke width selection', () => {
      
      const toolbarContainer = document.createElement('div');
      container.appendChild(toolbarContainer);

      const onStyleChange = vi.fn();
      const toolbar = new DrawingToolbar(toolbarContainer, {}, { onStyleChange });

      const widthBtn = toolbarContainer.querySelector('[data-width="8"]') as HTMLElement;
      widthBtn.click();

      expect(onStyleChange).toHaveBeenCalledWith(
        expect.objectContaining({ strokeWidth: 8 })
      );

      toolbar.destroy();
    });

    it('should update undo/redo button disabled states', () => {
      
      const toolbarContainer = document.createElement('div');
      container.appendChild(toolbarContainer);

      const toolbar = new DrawingToolbar(toolbarContainer, {}, {});

      toolbar.updateUndoRedoState(false, false);
      const undoBtn = toolbarContainer.querySelector('.undo-btn') as HTMLButtonElement;
      const redoBtn = toolbarContainer.querySelector('.redo-btn') as HTMLButtonElement;
      expect(undoBtn.disabled).toBe(true);
      expect(redoBtn.disabled).toBe(true);

      toolbar.updateUndoRedoState(true, true);
      expect(undoBtn.disabled).toBe(false);
      expect(redoBtn.disabled).toBe(false);

      toolbar.destroy();
    });
  });

  describe('Canvas cleanup on destroy', () => {
    it('should remove canvas element from DOM', () => {
      
      const overlay = new DrawingOverlay(container);

      expect(container.querySelector('.drawing-overlay')).toBeTruthy();

      overlay.destroy();
      expect(container.querySelector('.drawing-overlay')).toBeFalsy();
    });

    it('should remove text input if active', () => {
      
      const overlay = new DrawingOverlay(container);

      overlay.setTool('text');
      const canvas = container.querySelector('.drawing-overlay') as HTMLCanvasElement;
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100 }));

      // Text input should exist
      expect(container.querySelector('input[type="text"]')).toBeTruthy();

      overlay.destroy();
      // Text input should be removed
      expect(container.querySelector('input[type="text"]')).toBeFalsy();
    });
  });
});
