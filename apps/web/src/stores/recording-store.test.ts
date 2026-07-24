/**
 * Recording Store Tests
 * 
 * Unit tests for recording state management, session persistence, and control interactions
 */

import { RecordingStore, type RecordingState, type RecordingSession } from './recording-store.js';

// Mock dependencies
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

jest.mock('../app/client-logger.js', () => ({
  logger: mockLogger
}));

jest.mock('../utils/format-time.js', () => ({
  formatTime: jest.fn().mockReturnValue('00:00')
}));

// Mock MediaRecorder and related APIs
global.MediaRecorder = jest.fn().mockImplementation(() => ({
  start: jest.fn(),
  stop: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  addEventListener: jest.fn(),
  state: 'inactive',
  mimeType: 'video/webm',
  ondataavailable: null,
  onstop: null,
  onerror: null
})) as any;

global.navigator.mediaDevices = {
  enumerateDevices: jest.fn().mockResolvedValue([
    { deviceId: 'screen1', kind: 'videoinput', label: 'Screen 1' },
    { deviceId: 'screen2', kind: 'videoinput', label: 'Screen 2' }
  ]),
  getDisplayMedia: jest.fn().mockResolvedValue({
    getVideoTracks: () => [{
      addEventListener: jest.fn(),
      stop: jest.fn()
    }],
    getTracks: () => [{
      stop: jest.fn()
    }]
  })
} as any;

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
global.localStorage = localStorageMock as any;

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
global.sessionStorage = sessionStorageMock as any;

describe('RecordingStore', () => {
  let store: RecordingStore;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    sessionStorageMock.getItem.mockReturnValue(null);
    store = new RecordingStore();
  });

  afterEach(() => {
    store.destroy();
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const state = store.getState();
      
      expect(state.isInitialized).toBe(false);
      expect(state.currentSession).toBeUndefined();
      expect(state.savedSessions).toEqual([]);
      expect(state.permissions.screen).toBe('prompt');
      expect(state.preferences.enableKeyboardShortcuts).toBe(true);
    });

    it('should initialize successfully', async () => {
      const result = await store.initialize();
      
      expect(result).toBe(true);
      expect(store.getState().isInitialized).toBe(true);
      expect(navigator.mediaDevices.enumerateDevices).toHaveBeenCalled();
    });

    it('should handle initialization failure', async () => {
      (navigator.mediaDevices.enumerateDevices as jest.Mock).mockRejectedValue(new Error('No devices'));
      
      const result = await store.initialize();
      
      expect(result).toBe(false);
      expect(store.getState().isInitialized).toBe(false);
    });

    it('should load persisted state from localStorage', () => {
      const persistedState = {
        permissions: { screen: 'granted', audio: 'granted', hasRequestedBefore: true, deniedCount: 0 },
        preferences: { enableKeyboardShortcuts: false, quality: 'low' }
      };
      localStorageMock.getItem.mockReturnValue(JSON.stringify(persistedState));

      const newStore = new RecordingStore();
      const state = newStore.getState();

      expect(state.permissions.screen).toBe('granted');
      expect(state.preferences.enableKeyboardShortcuts).toBe(false);
      
      newStore.destroy();
    });
  });

  describe('session management', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should create a new recording session', () => {
      const metadata = { title: 'Test Recording', description: 'Test description' };
      const sessionId = store.createSession(metadata);

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');

      const state = store.getState();
      expect(state.currentSession).toBeDefined();
      expect(state.currentSession?.id).toBe(sessionId);
      expect(state.currentSession?.metadata).toEqual(metadata);
      expect(state.currentSession?.state).toBe('idle');
    });

    it('should update session metadata', () => {
      store.createSession({ title: 'Initial Title' });
      
      store.updateSessionMetadata({ description: 'Added description', projectId: 'project-123' });

      const state = store.getState();
      expect(state.currentSession?.metadata).toEqual({
        title: 'Initial Title',
        description: 'Added description',
        projectId: 'project-123'
      });
    });

    it('should save session to history', () => {
      const sessionId = store.createSession({ title: 'Test Recording' });
      
      store.saveSession();

      const state = store.getState();
      expect(state.currentSession).toBeUndefined();
      expect(state.savedSessions).toHaveLength(1);
      expect(state.savedSessions[0].id).toBe(sessionId);
    });
  });

  describe('permission handling', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should request screen permission successfully', async () => {
      const mockStream = { getTracks: () => [] };
      (navigator.mediaDevices.getDisplayMedia as jest.Mock).mockResolvedValue(mockStream);

      const result = await store.requestScreenPermission();

      expect(result.success).toBe(true);
      expect(result.stream).toBe(mockStream);
      expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({
        video: {
          mediaSource: 'screen',
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: true
      });

      const state = store.getState();
      expect(state.permissions.screen).toBe('granted');
    });

    it('should handle permission denied', async () => {
      const permissionError = new Error('Permission denied');
      permissionError.name = 'NotAllowedError';
      (navigator.mediaDevices.getDisplayMedia as jest.Mock).mockRejectedValue(permissionError);

      const result = await store.requestScreenPermission();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Screen recording permission was denied');

      const state = store.getState();
      expect(state.permissions.screen).toBe('denied');
      expect(state.permissions.deniedCount).toBe(1);
    });

    it('should handle unsupported browser', async () => {
      const unsupportedError = new Error('Not supported');
      unsupportedError.name = 'NotSupportedError';
      (navigator.mediaDevices.getDisplayMedia as jest.Mock).mockRejectedValue(unsupportedError);

      const result = await store.requestScreenPermission();

      expect(result.success).toBe(false);
      expect(result.error).toContain('not supported');
    });
  });

  describe('recording controls', () => {
    let mockStream: any;
    let mockMediaRecorder: any;

    beforeEach(async () => {
      await store.initialize();
      
      mockStream = {
        getTracks: jest.fn().mockReturnValue([{ stop: jest.fn() }]),
        getVideoTracks: jest.fn().mockReturnValue([{ 
          addEventListener: jest.fn(),
          stop: jest.fn()
        }])
      };

      mockMediaRecorder = {
        start: jest.fn(),
        stop: jest.fn(),
        pause: jest.fn(),
        resume: jest.fn(),
        state: 'inactive',
        mimeType: 'video/webm',
        ondataavailable: null,
        onstop: null,
        onerror: null
      };

      (global.MediaRecorder as jest.Mock).mockReturnValue(mockMediaRecorder);
    });

    it('should start recording successfully', async () => {
      store.createSession();
      
      const result = await store.startRecording(mockStream);

      expect(result).toBe(true);
      expect(mockMediaRecorder.start).toHaveBeenCalledWith(1000);

      const state = store.getState();
      expect(state.currentSession?.state).toBe('recording');
      expect(state.currentSession?.stream).toBe(mockStream);
    });

    it('should pause recording', async () => {
      store.createSession();
      await store.startRecording(mockStream);
      mockMediaRecorder.state = 'recording';

      const result = store.pauseRecording();

      expect(result).toBe(true);
      expect(mockMediaRecorder.pause).toHaveBeenCalled();

      const state = store.getState();
      expect(state.currentSession?.state).toBe('paused');
    });

    it('should resume recording', async () => {
      store.createSession();
      await store.startRecording(mockStream);
      store.pauseRecording();
      mockMediaRecorder.state = 'paused';

      const result = store.resumeRecording();

      expect(result).toBe(true);
      expect(mockMediaRecorder.resume).toHaveBeenCalled();

      const state = store.getState();
      expect(state.currentSession?.state).toBe('recording');
    });

    it('should stop recording', async () => {
      store.createSession();
      await store.startRecording(mockStream);
      mockMediaRecorder.state = 'recording';

      const result = store.stopRecording();

      expect(result).toBe(true);
      expect(mockMediaRecorder.stop).toHaveBeenCalled();

      const state = store.getState();
      expect(state.currentSession?.state).toBe('stopped');
    });

    it('should not pause when not recording', () => {
      store.createSession();
      
      const result = store.pauseRecording();

      expect(result).toBe(false);
      expect(mockMediaRecorder.pause).not.toHaveBeenCalled();
    });

    it('should not resume when not paused', async () => {
      store.createSession();
      await store.startRecording(mockStream);

      const result = store.resumeRecording();

      expect(result).toBe(false);
      expect(mockMediaRecorder.resume).not.toHaveBeenCalled();
    });
  });

  describe('state queries', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should correctly report recording state', async () => {
      expect(store.isRecording()).toBe(false);
      expect(store.isPaused()).toBe(false);
      expect(store.hasActiveSession()).toBe(false);

      const mockStream = { getTracks: () => [], getVideoTracks: () => [{ addEventListener: () => {}, stop: () => {} }] };
      store.createSession();
      await store.startRecording(mockStream);

      expect(store.isRecording()).toBe(true);
      expect(store.isPaused()).toBe(false);
      expect(store.hasActiveSession()).toBe(true);

      store.pauseRecording();

      expect(store.isRecording()).toBe(false);
      expect(store.isPaused()).toBe(true);
      expect(store.hasActiveSession()).toBe(true);
    });

    it('should format duration correctly', () => {
      const mockFormatTime = require('../utils/format-time.js').formatTime;
      mockFormatTime.mockReturnValue('02:30');

      store.createSession();
      const formatted = store.getFormattedDuration();

      expect(formatted).toBe('02:30');
    });
  });

  describe('preferences', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should update preferences', () => {
      const newPreferences = {
        enableKeyboardShortcuts: false,
        quality: 'low' as const,
        includeAudio: false
      };

      store.updatePreferences(newPreferences);

      const state = store.getState();
      expect(state.preferences.enableKeyboardShortcuts).toBe(false);
      expect(state.preferences.quality).toBe('low');
      expect(state.preferences.includeAudio).toBe(false);
    });
  });

  describe('session persistence', () => {
    it('should persist state to localStorage', () => {
      store.updatePreferences({ quality: 'high' });
      
      // Trigger persistence by destroying the store
      store.destroy();

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'streetstudio_recording_state',
        expect.stringContaining('"quality":"high"')
      );
    });

    it('should recover interrupted session from sessionStorage', () => {
      const interruptedSession = {
        id: 'test-session',
        state: 'recording',
        startTime: Date.now(),
        duration: 1000,
        recordedChunks: [],
        totalPausedDuration: 0,
        lastActivity: Date.now()
      };

      sessionStorageMock.getItem.mockReturnValue(JSON.stringify(interruptedSession));

      const newStore = new RecordingStore();
      const state = newStore.getState();

      expect(state.currentSession).toBeDefined();
      expect(state.currentSession?.id).toBe('test-session');
      expect(state.currentSession?.state).toBe('stopped');
      expect(state.currentSession?.error).toContain('interrupted');

      newStore.destroy();
    });

    it('should clear session history', () => {
      store.createSession();
      store.saveSession();

      expect(store.getState().savedSessions).toHaveLength(1);

      store.clearSessionHistory();

      expect(store.getState().savedSessions).toHaveLength(0);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('streetstudio_recording_sessions');
    });
  });

  describe('subscription and events', () => {
    let listener: jest.Mock;

    beforeEach(async () => {
      await store.initialize();
      listener = jest.fn();
    });

    it('should notify listeners on state changes', () => {
      const unsubscribe = store.subscribe(listener);

      // Should be called immediately with current state
      expect(listener).toHaveBeenCalledTimes(1);

      store.createSession();

      // Should be called again after state change
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({
          currentSession: expect.objectContaining({
            state: 'idle'
          })
        })
      );

      unsubscribe();
    });

    it('should handle listener errors gracefully', () => {
      const errorListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });

      store.subscribe(errorListener);
      store.createSession();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Recording store listener error',
        expect.objectContaining({ error: expect.any(String) })
      );
    });
  });

  describe('cleanup', () => {
    it('should clean up resources on destroy', async () => {
      await store.initialize();
      const mockStream = { getTracks: () => [{ stop: jest.fn() }], getVideoTracks: () => [{ addEventListener: () => {}, stop: () => {} }] };
      
      store.createSession();
      await store.startRecording(mockStream);

      store.destroy();

      expect(mockLogger.info).toHaveBeenCalledWith('Recording store destroyed');
    });
  });
});