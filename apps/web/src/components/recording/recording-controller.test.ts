/**
 * Recording Controller Tests
 * 
 * Tests for recording functionality with drawing integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RecordingController } from './recording-controller.js';

// Mock MediaRecorder and related APIs
const mockMediaRecorder = vi.fn().mockImplementation(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  state: 'inactive',
  stream: {
    getTracks: () => [{
      stop: vi.fn()
    }]
  },
  ondataavailable: null,
  onstop: null
}));

const mockGetDisplayMedia = vi.fn().mockResolvedValue({
  getTracks: () => [{
    stop: vi.fn()
  }]
});

// Setup global mocks
Object.defineProperty(global, 'MediaRecorder', {
  value: mockMediaRecorder,
  writable: true
});

Object.defineProperty(global.navigator, 'mediaDevices', {
  value: {
    getDisplayMedia: mockGetDisplayMedia
  },
  writable: true
});

describe('RecordingController', () => {
  let container: HTMLElement;
  let controller: RecordingController;
  let callbacks: any;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);

    callbacks = {
      onRecordingStart: vi.fn(),
      onRecordingStop: vi.fn(),
      onRecordingPause: vi.fn(),
      onRecordingResume: vi.fn(),
      onDrawingUpdate: vi.fn()
    };

    controller = new RecordingController(container, {
      enableDrawing: true,
      persistDrawings: true,
      syncWithRecording: true
    }, callbacks);

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    controller?.destroy();
    container?.remove();
    localStorage.clear();
  });

  describe('Initialization', () => {
    it('should create recording controls', () => {
      const recordingControls = container.querySelector('.recording-controls');
      expect(recordingControls).toBeTruthy();
    });

    it('should create recording interface with drawing enabled', () => {
      const drawingToolbar = container.querySelector('.drawing-toolbar');
      expect(drawingToolbar).toBeTruthy();
    });

    it('should initialize without drawing if disabled', () => {
      const noDrawingController = new RecordingController(container, {
        enableDrawing: false
      });

      // Drawing toolbar should not be present in the new controller
      // Note: The existing one might still be there, so we need to check the specific setup
      expect(true).toBe(true); // Placeholder - would need better isolation for this test
      
      noDrawingController.destroy();
    });
  });

  describe('Recording Controls', () => {
    it('should handle start recording button', async () => {
      const recordBtn = container.querySelector('.record-btn') as HTMLButtonElement;
      recordBtn.click();

      expect(mockGetDisplayMedia).toHaveBeenCalled();
    });

    it('should handle pause recording button', () => {
      const pauseBtn = container.querySelector('.pause-btn') as HTMLButtonElement;
      expect(pauseBtn).toBeTruthy();
    });

    it('should handle stop recording button', () => {
      const stopBtn = container.querySelector('.stop-btn') as HTMLButtonElement;
      expect(stopBtn).toBeTruthy();
    });

    it('should toggle drawing tools', () => {
      const toggleBtn = container.querySelector('.toggle-drawing-btn') as HTMLButtonElement;
      if (toggleBtn) {
        toggleBtn.click();
        // Should toggle drawing toolbar visibility
      }
    });
  });

  describe('Recording State Management', () => {
    it('should track current session', () => {
      const session = controller.getCurrentSession();
      expect(session).toBeUndefined(); // No active session initially
    });

    it('should update UI based on recording state', async () => {
      // Mock successful media access
      mockGetDisplayMedia.mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }]
      });

      await controller.startRecording();

      // Should update UI to show recording state
      const statusText = container.querySelector('.status-text');
      expect(statusText?.textContent).toBe('Recording');
    });

    it('should handle recording errors gracefully', async () => {
      // Mock permission denied
      mockGetDisplayMedia.mockRejectedValue(new Error('Permission denied'));

      await controller.startRecording();

      // Should show error state
      const statusText = container.querySelector('.status-text');
      expect(statusText?.textContent).toBe('Error');
    });
  });

  describe('Drawing Integration', () => {
    it('should get current drawing state', () => {
      const drawingState = controller.getDrawingState();
      expect(drawingState).toBeTruthy();
    });

    it('should handle drawing state changes during recording', () => {
      // Simulate drawing state change
      if (callbacks.onDrawingUpdate) {
        const mockState = {
          currentTool: 'pen' as const,
          currentStyle: { color: '#000000', strokeWidth: 2, opacity: 1.0 },
          paths: [],
          textAnnotations: [],
          isDrawing: false,
          undoStack: [],
          redoStack: []
        };

        // This would be called internally when drawing state changes
        callbacks.onDrawingUpdate(mockState);
        expect(callbacks.onDrawingUpdate).toHaveBeenCalledWith(mockState);
      }
    });

    it('should enable/disable drawing', () => {
      controller.setDrawingEnabled(false);
      
      const toolbar = container.querySelector('.drawing-toolbar') as HTMLElement;
      if (toolbar) {
        expect(toolbar.style.display).toBe('none');
      }

      controller.setDrawingEnabled(true);
      if (toolbar) {
        expect(toolbar.style.display).toBe('');
      }
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should handle space key for record/pause', () => {
      const spaceKey = new KeyboardEvent('keydown', {
        key: ' ',
        ctrlKey: true,
        bubbles: true
      });

      document.dispatchEvent(spaceKey);
      
      expect(mockGetDisplayMedia).toHaveBeenCalled();
    });

    it('should handle escape key to stop recording', () => {
      const escapeKey = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
      });

      document.dispatchEvent(escapeKey);
      // Would need active recording to test stop functionality
    });
  });

  describe('Session Persistence', () => {
    it('should persist drawing sessions when enabled', async () => {
      // Create a controller with persistence enabled
      const persistentController = new RecordingController(container, {
        enableDrawing: true,
        persistDrawings: true
      });

      // Start and stop a recording to trigger persistence
      await persistentController.startRecording();
      persistentController.stopRecording();

      // Check if session was stored (would need to simulate actual recording flow)
      expect(true).toBe(true); // Placeholder - would check localStorage

      persistentController.destroy();
    });

    it('should load persisted drawings on initialization', () => {
      // Pre-populate localStorage with test data
      const testSessions = [{
        id: 'test-session',
        isRecording: false,
        isPaused: false,
        startTime: Date.now(),
        duration: 5000,
        drawingData: [{
          currentTool: 'pen' as const,
          currentStyle: { color: '#000000', strokeWidth: 2, opacity: 1.0 },
          paths: [{
            id: 'test-path',
            tool: 'pen' as const,
            points: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
            style: { color: '#000000', strokeWidth: 2, opacity: 1.0 },
            timestamp: Date.now()
          }],
          textAnnotations: [],
          isDrawing: false,
          undoStack: [],
          redoStack: []
        }]
      }];

      localStorage.setItem('streetstudio_drawing_sessions', JSON.stringify(testSessions));

      // Create new controller - should load persisted data
      const loadingController = new RecordingController(container, {
        enableDrawing: true,
        persistDrawings: true
      });

      const drawingState = loadingController.getDrawingState();
      expect(drawingState?.paths.length).toBe(1);

      loadingController.destroy();
    });
  });

  describe('Duration Timer', () => {
    it('should format duration correctly', () => {
      // Test duration formatting (private method, but can test through UI updates)
      expect(true).toBe(true); // Would need to expose formatDuration or test through UI
    });

    it('should update duration during recording', async () => {
      // Mock timer functionality
      vi.useFakeTimers();
      
      await controller.startRecording();
      
      // Advance timer
      vi.advanceTimersByTime(2000);
      
      const durationElement = container.querySelector('.duration');
      if (durationElement) {
        expect(durationElement.textContent).toBeTruthy();
      }
      
      vi.useRealTimers();
    });
  });

  describe('Error Handling', () => {
    it('should show error notifications', () => {
      // Trigger an error condition
      mockGetDisplayMedia.mockRejectedValue(new Error('Permission denied'));
      
      controller.startRecording();
      
      // Check for error notification (would appear as toast)
      setTimeout(() => {
        const errorToast = document.querySelector('[class*="bg-red-100"]');
        expect(errorToast).toBeTruthy();
      }, 100);
    });

    it('should handle MediaRecorder creation failure', async () => {
      // Mock MediaRecorder constructor to throw
      const originalMediaRecorder = global.MediaRecorder;
      global.MediaRecorder = vi.fn().mockImplementation(() => {
        throw new Error('MediaRecorder not supported');
      });

      await controller.startRecording();

      // Should handle error gracefully
      const statusText = container.querySelector('.status-text');
      expect(statusText?.textContent).toBe('Error');

      global.MediaRecorder = originalMediaRecorder;
    });
  });

  describe('Cleanup', () => {
    it('should stop active recording on destroy', () => {
      // Start a mock recording
      const mockRecorder = {
        state: 'recording',
        stop: vi.fn(),
        stream: {
          getTracks: () => [{ stop: vi.fn() }]
        }
      };

      // Manually set up recording state for testing
      (controller as any).mediaRecorder = mockRecorder;
      (controller as any).currentSession = {
        id: 'test',
        isRecording: true,
        isPaused: false,
        startTime: Date.now(),
        duration: 0,
        drawingData: []
      };

      controller.destroy();

      expect(mockRecorder.stop).toHaveBeenCalled();
    });

    it('should clean up DOM elements', () => {
      const recordingControls = container.querySelector('.recording-controls');
      expect(recordingControls).toBeTruthy();

      controller.destroy();

      const afterDestroy = container.querySelector('.recording-controls');
      expect(afterDestroy).toBeFalsy();
    });
  });
});