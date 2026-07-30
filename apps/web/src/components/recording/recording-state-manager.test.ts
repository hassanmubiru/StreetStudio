/**
 * Recording State Manager Tests
 * 
 * Tests for recording state management, keyboard shortcuts, and session recovery
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { RecordingStateManager, type RecordingEvents } from './recording-state-manager.js';
import { RecordingStore, getRecordingStore } from '../../stores/recording-store.js';
import { KeyboardShortcuts } from '../../app/keyboard-shortcuts.js';

// Mock dependencies.
// vi.mock is hoisted, so the mock object it references must be hoisted too.
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
}));

vi.mock('../../app/client-logger.js', () => ({
  logger: mockLogger
}));

vi.mock('../../stores/recording-store.js', () => ({
  getRecordingStore: vi.fn(),
  RecordingStore: vi.fn()
}));

describe('RecordingStateManager', () => {
  let stateManager: RecordingStateManager;
  let mockRecordingStore: any;
  let mockKeyboardShortcuts: any;
  let mockEvents: any;

  beforeEach(() => {
    // Mock RecordingStore
    mockRecordingStore = {
      initialize: vi.fn().mockResolvedValue(true),
      subscribe: vi.fn().mockReturnValue(vi.fn()),
      getState: vi.fn().mockReturnValue({
        currentSession: undefined,
        permissions: { screen: 'prompt', audio: 'prompt', hasRequestedBefore: false, deniedCount: 0 },
        preferences: { enableKeyboardShortcuts: true, autoSave: true, saveInterval: 5, quality: 'high', includeAudio: true, cursorHighlight: true },
        isInitialized: false,
        availableSources: [],
        savedSessions: []
      }),
      createSession: vi.fn().mockReturnValue('test-session-id'),
      updateSessionMetadata: vi.fn(),
      requestScreenPermission: vi.fn().mockResolvedValue({ success: true, stream: {} }),
      startRecording: vi.fn().mockResolvedValue(true),
      pauseRecording: vi.fn().mockReturnValue(true),
      resumeRecording: vi.fn().mockReturnValue(true),
      stopRecording: vi.fn().mockReturnValue(true),
      saveSession: vi.fn(),
      isRecording: vi.fn().mockReturnValue(false),
      isPaused: vi.fn().mockReturnValue(false),
      hasActiveSession: vi.fn().mockReturnValue(false),
      getFormattedDuration: vi.fn().mockReturnValue('00:00'),
      destroy: vi.fn()
    };

    vi.mocked(getRecordingStore).mockReturnValue(mockRecordingStore);

    // Mock KeyboardShortcuts
    mockKeyboardShortcuts = {
      register: vi.fn(),
      unregister: vi.fn(),
      setContext: vi.fn(),
      destroy: vi.fn()
    };

    // Mock events
    mockEvents = {
      onStateChange: vi.fn(),
      onPermissionDenied: vi.fn(),
      onSessionRecovered: vi.fn(),
      onRecordingComplete: vi.fn(),
      onError: vi.fn()
    };

    stateManager = new RecordingStateManager(mockKeyboardShortcuts, {}, mockEvents);
  });

  afterEach(() => {
    stateManager.destroy();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const result = await stateManager.initialize();

      expect(result).toBe(true);
      expect(mockRecordingStore.initialize).toHaveBeenCalled();
      expect(mockRecordingStore.subscribe).toHaveBeenCalled();
      expect(mockKeyboardShortcuts.register).toHaveBeenCalled();
      expect(mockKeyboardShortcuts.setContext).toHaveBeenCalledWith('recordings');
    });

    it('should handle initialization failure', async () => {
      mockRecordingStore.initialize.mockResolvedValue(false);

      const result = await stateManager.initialize();

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Recording state manager initialization failed',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });

    it('should initialize with custom options', async () => {
      const customStateManager = new RecordingStateManager(
        mockKeyboardShortcuts,
        {
          enableKeyboardShortcuts: false,
          enableSessionRecovery: false,
          enablePermissionGuidance: false,
          autoSaveInterval: 10
        },
        mockEvents
      );

      await customStateManager.initialize();

      // Should not register shortcuts when disabled
      expect(mockKeyboardShortcuts.register).not.toHaveBeenCalled();

      customStateManager.destroy();
    });
  });

  describe('recording controls', () => {
    beforeEach(async () => {
      await stateManager.initialize();
    });

    it('should start recording with metadata', async () => {
      const metadata = { title: 'Test Recording', description: 'Test' };

      const result = await stateManager.startRecording(metadata);

      expect(result).toBe(true);
      expect(mockRecordingStore.createSession).toHaveBeenCalledWith(metadata);
      expect(mockRecordingStore.requestScreenPermission).toHaveBeenCalled();
      expect(mockRecordingStore.startRecording).toHaveBeenCalled();
    });

    it('should handle permission denied during start', async () => {
      mockRecordingStore.requestScreenPermission.mockResolvedValue({
        success: false,
        error: 'Permission denied'
      });

      const result = await stateManager.startRecording();

      expect(result).toBe(false);
      expect(mockEvents.onPermissionDenied).toHaveBeenCalledWith(
        'Permission denied',
        expect.stringContaining('To enable screen recording')
      );
    });

    it('should handle recording start failure', async () => {
      mockRecordingStore.startRecording.mockResolvedValue(false);

      const result = await stateManager.startRecording();

      expect(result).toBe(false);
      expect(mockEvents.onError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to start recording')
      );
    });

    it('should pause recording', () => {
      const result = stateManager.pauseRecording();

      expect(result).toBe(true);
      expect(mockRecordingStore.pauseRecording).toHaveBeenCalled();
    });

    it('should resume recording', () => {
      const result = stateManager.resumeRecording();

      expect(result).toBe(true);
      expect(mockRecordingStore.resumeRecording).toHaveBeenCalled();
    });

    it('should stop recording', () => {
      mockRecordingStore.getState.mockReturnValue({
        currentSession: { id: 'test', state: 'stopped', recordedChunks: [new Blob()], totalPausedDuration: 0, duration: 1000, lastActivity: Date.now() }
      } as any);

      const result = stateManager.stopRecording();

      expect(result).toBe(true);
      expect(mockRecordingStore.stopRecording).toHaveBeenCalled();
      expect(mockEvents.onRecordingComplete).toHaveBeenCalled();
    });

    it('should handle operations when not initialized', async () => {
      const uninitializedManager = new RecordingStateManager(mockKeyboardShortcuts, {}, mockEvents);

      const startResult = await uninitializedManager.startRecording();
      const pauseResult = uninitializedManager.pauseRecording();
      const resumeResult = uninitializedManager.resumeRecording();
      const stopResult = uninitializedManager.stopRecording();

      expect(startResult).toBe(false);
      expect(pauseResult).toBe(false);
      expect(resumeResult).toBe(false);
      expect(stopResult).toBe(false);

      uninitializedManager.destroy();
    });
  });

  describe('toggle recording', () => {
    beforeEach(async () => {
      await stateManager.initialize();
    });

    it('should start recording when idle', async () => {
      mockRecordingStore.getState.mockReturnValue({
        currentSession: undefined
      } as any);

      const startSpy = vi.spyOn(stateManager, 'startRecording').mockResolvedValue(true);

      const result = stateManager.toggleRecording();

      expect(startSpy).toHaveBeenCalled();
    });

    it('should pause when recording', () => {
      mockRecordingStore.getState.mockReturnValue({
        currentSession: { state: 'recording' }
      } as any);

      const pauseSpy = vi.spyOn(stateManager, 'pauseRecording');

      stateManager.toggleRecording();

      expect(pauseSpy).toHaveBeenCalled();
    });

    it('should resume when paused', () => {
      mockRecordingStore.getState.mockReturnValue({
        currentSession: { state: 'paused' }
      } as any);

      const resumeSpy = vi.spyOn(stateManager, 'resumeRecording');

      stateManager.toggleRecording();

      expect(resumeSpy).toHaveBeenCalled();
    });
  });

  describe('keyboard shortcuts', () => {
    beforeEach(async () => {
      await stateManager.initialize();
    });

    it('should register keyboard shortcuts', () => {
      expect(mockKeyboardShortcuts.register).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            key: ' ',
            modifiers: ['ctrl'],
            context: 'recordings',
            description: 'Start, pause, or resume recording'
          }),
          expect.objectContaining({
            key: 'Escape',
            context: 'recordings',
            description: 'Stop recording'
          })
        ])
      );
    });

    it('should execute toggle recording on ctrl+space', () => {
      const shortcuts = mockKeyboardShortcuts.register.mock.calls[0][0];
      const toggleShortcut = shortcuts.find((s: any) => s.key === ' ' && s.modifiers?.includes('ctrl'));
      
      const toggleSpy = vi.spyOn(stateManager, 'toggleRecording');
      const mockEvent = { preventDefault: vi.fn() } as any;

      const result = toggleShortcut.handler(mockEvent);

      expect(toggleSpy).toHaveBeenCalled();
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should execute stop recording on escape when recording', () => {
      const shortcuts = mockKeyboardShortcuts.register.mock.calls[0][0];
      const escapeShortcut = shortcuts.find((s: any) => s.key === 'Escape');
      
      mockRecordingStore.isRecording.mockReturnValue(true);
      const stopSpy = vi.spyOn(stateManager, 'stopRecording');
      const mockEvent = { preventDefault: vi.fn() } as any;

      const result = escapeShortcut.handler(mockEvent);

      expect(stopSpy).toHaveBeenCalled();
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should not execute stop recording on escape when not recording', () => {
      const shortcuts = mockKeyboardShortcuts.register.mock.calls[0][0];
      const escapeShortcut = shortcuts.find((s: any) => s.key === 'Escape');
      
      mockRecordingStore.isRecording.mockReturnValue(false);
      mockRecordingStore.isPaused.mockReturnValue(false);
      const stopSpy = vi.spyOn(stateManager, 'stopRecording');
      const mockEvent = { preventDefault: vi.fn() } as any;

      const result = escapeShortcut.handler(mockEvent);

      expect(stopSpy).not.toHaveBeenCalled();
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe('state changes', () => {
    let mockStateChangeCallback: Mock;

    beforeEach(async () => {
      await stateManager.initialize();
      mockStateChangeCallback = mockRecordingStore.subscribe.mock.calls[0][0];
    });

    it('should handle error state change', () => {
      const errorSession = {
        id: 'test',
        state: 'error',
        error: 'Test error message'
      };

      mockStateChangeCallback({ currentSession: errorSession });

      expect(mockEvents.onStateChange).toHaveBeenCalledWith('error', errorSession);
      expect(mockEvents.onError).toHaveBeenCalledWith('Test error message', errorSession);
    });

    it('should handle stopped state change with recording', () => {
      const stoppedSession = {
        id: 'test',
        state: 'stopped',
        recordedChunks: [new Blob()]
      };

      mockStateChangeCallback({ currentSession: stoppedSession });

      expect(mockEvents.onStateChange).toHaveBeenCalledWith('stopped', stoppedSession);
      expect(mockEvents.onRecordingComplete).toHaveBeenCalledWith(stoppedSession);
    });
  });

  describe('session management', () => {
    beforeEach(async () => {
      await stateManager.initialize();
    });

    it('should save current session', () => {
      stateManager.saveSession();

      expect(mockRecordingStore.saveSession).toHaveBeenCalled();
    });

    it('should update session metadata', () => {
      const metadata = { title: 'Updated Title', projectId: 'project-123' };

      stateManager.updateMetadata(metadata);

      expect(mockRecordingStore.updateSessionMetadata).toHaveBeenCalledWith(metadata);
    });

    it('should get current state', () => {
      const mockSession = { id: 'test', state: 'recording' };
      mockRecordingStore.getState.mockReturnValue({ currentSession: mockSession } as any);

      const result = stateManager.getCurrentState();

      expect(result).toEqual({ state: 'recording', session: mockSession });
    });

    it('should get current state when no session', () => {
      mockRecordingStore.getState.mockReturnValue({ currentSession: undefined } as any);

      const result = stateManager.getCurrentState();

      expect(result).toEqual({ state: 'idle', session: undefined });
    });
  });

  describe('permission guidance', () => {
    beforeEach(async () => {
      // Enable permission guidance
      const guidedStateManager = new RecordingStateManager(
        mockKeyboardShortcuts,
        { enablePermissionGuidance: true },
        mockEvents
      );
      await guidedStateManager.initialize();
      stateManager.destroy();
      stateManager = guidedStateManager;
    });

    it('should provide specific guidance for permission denied', async () => {
      const mockCreateElement = vi.spyOn(document, 'createElement').mockReturnValue({
        className: '',
        setAttribute: vi.fn(),
        innerHTML: ''
      } as any);
      const mockAppendChild = vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any);

      // Simulate permission denied
      mockRecordingStore.requestScreenPermission.mockResolvedValue({
        success: false,
        error: 'Screen recording permission was denied. Please allow screen sharing to continue.'
      });

      // startRecording is async; await it so onPermissionDenied has fired.
      await stateManager.startRecording();

      expect(mockEvents.onPermissionDenied).toHaveBeenCalledWith(
        expect.stringContaining('denied'),
        expect.stringContaining('To enable screen recording')
      );

      mockCreateElement.mockRestore();
      mockAppendChild.mockRestore();
    });

    it('should provide guidance for unsupported browser', async () => {
      mockRecordingStore.requestScreenPermission.mockResolvedValue({
        success: false,
        error: 'Screen recording is not supported in this browser.'
      });

      await stateManager.startRecording();

      expect(mockEvents.onPermissionDenied).toHaveBeenCalledWith(
        expect.stringContaining('not supported'),
        expect.stringContaining('modern browser')
      );
    });
  });

  describe('session recovery', () => {
    it('should detect and handle interrupted session', async () => {
      const interruptedSession = {
        id: 'interrupted-session',
        state: 'stopped',
        error: 'Session was interrupted. Recording may have been lost.'
      };

      mockRecordingStore.getState.mockReturnValue({
        currentSession: interruptedSession
      } as any);

      const recoveryStateManager = new RecordingStateManager(
        mockKeyboardShortcuts,
        { enableSessionRecovery: true },
        mockEvents
      );

      await recoveryStateManager.initialize();

      expect(mockEvents.onSessionRecovered).toHaveBeenCalledWith(interruptedSession);

      recoveryStateManager.destroy();
    });
  });

  describe('cleanup', () => {
    it('should clean up resources on destroy', async () => {
      const unsubscribe = vi.fn();
      mockRecordingStore.subscribe.mockReturnValue(unsubscribe);

      await stateManager.initialize();
      stateManager.destroy();

      expect(unsubscribe).toHaveBeenCalled();
      expect(mockKeyboardShortcuts.unregister).toHaveBeenCalled();
    });
  });

  describe('state queries', () => {
    beforeEach(async () => {
      await stateManager.initialize();
    });

    it('should return correct recording status', () => {
      mockRecordingStore.isRecording.mockReturnValue(true);
      mockRecordingStore.isPaused.mockReturnValue(false);

      expect(stateManager.isRecording()).toBe(true);
      expect(stateManager.isPaused()).toBe(false);
    });

    it('should return formatted duration', () => {
      mockRecordingStore.getFormattedDuration.mockReturnValue('01:23');

      const duration = stateManager.getFormattedDuration();

      expect(duration).toBe('01:23');
      expect(mockRecordingStore.getFormattedDuration).toHaveBeenCalled();
    });
  });
});
