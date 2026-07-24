/**
 * Recording Store
 * 
 * Manages recording state, session persistence, and control interactions
 * Provides reactive state management for browser recording interface
 * 
 * Requirements: 3.3, 3.6, 3.10
 */

import { logger } from '../app/client-logger.js';
import { formatTime } from '../utils/format-time.js';

export type RecordingState = 'idle' | 'requesting-permission' | 'permission-granted' | 'recording' | 'paused' | 'stopped' | 'error';

export interface RecordingSession {
  id: string;
  state: RecordingState;
  startTime?: number;
  pausedTime?: number;
  totalPausedDuration: number;
  duration: number;
  stream?: MediaStream;
  mediaRecorder?: MediaRecorder;
  recordedChunks: Blob[];
  metadata?: {
    title?: string;
    description?: string;
    projectId?: string;
    folderId?: string;
  };
  error?: string;
  lastActivity: number;
}

export interface RecordingPermissions {
  screen: PermissionState;
  audio: PermissionState;
  camera?: PermissionState;
  hasRequestedBefore: boolean;
  deniedCount: number;
  lastDenied?: number;
}

export interface RecordingPreferences {
  enableKeyboardShortcuts: boolean;
  autoSave: boolean;
  saveInterval: number; // minutes
  quality: 'low' | 'medium' | 'high';
  includeAudio: boolean;
  cursorHighlight: boolean;
}

export interface RecordingStoreState {
  currentSession?: RecordingSession;
  permissions: RecordingPermissions;
  preferences: RecordingPreferences;
  isInitialized: boolean;
  availableSources: MediaDeviceInfo[];
  savedSessions: RecordingSession[];
}

export class RecordingStore {
  private state: RecordingStoreState;
  private listeners: Set<(state: RecordingStoreState) => void> = new Set();
  private persistenceTimer?: number;
  private durationTimer?: number;
  
  private readonly STORAGE_KEY = 'streetstudio_recording_state';
  private readonly SESSION_STORAGE_KEY = 'streetstudio_recording_sessions';
  private readonly MAX_SAVED_SESSIONS = 10;
  private readonly SAVE_INTERVAL = 30000; // 30 seconds

  constructor() {
    this.state = this.getInitialState();
    this.loadPersistedState();
    this.setupPersistence();
    this.setupPermissionMonitoring();
  }

  /**
   * Get initial state
   */
  private getInitialState(): RecordingStoreState {
    return {
      permissions: {
        screen: 'prompt',
        audio: 'prompt',
        hasRequestedBefore: false,
        deniedCount: 0
      },
      preferences: {
        enableKeyboardShortcuts: true,
        autoSave: true,
        saveInterval: 5, // 5 minutes
        quality: 'high',
        includeAudio: true,
        cursorHighlight: true
      },
      isInitialized: false,
      availableSources: [],
      savedSessions: []
    };
  }

  /**
   * Load persisted state from storage
   */
  private loadPersistedState(): void {
    try {
      // Load preferences and permissions
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.state = {
          ...this.state,
          permissions: { ...this.state.permissions, ...parsed.permissions },
          preferences: { ...this.state.preferences, ...parsed.preferences }
        };
      }

      // Load saved sessions
      const sessionsStored = localStorage.getItem(this.SESSION_STORAGE_KEY);
      if (sessionsStored) {
        const sessions = JSON.parse(sessionsStored);
        this.state.savedSessions = sessions.slice(-this.MAX_SAVED_SESSIONS);
      }

      // Check for interrupted session in sessionStorage
      const interruptedSession = sessionStorage.getItem('streetstudio_current_session');
      if (interruptedSession) {
        const session = JSON.parse(interruptedSession);
        if (session.state === 'recording' || session.state === 'paused') {
          // Mark as interrupted for recovery
          session.state = 'stopped';
          session.error = 'Session was interrupted. Recording may have been lost.';
          this.state.currentSession = session;
          
          logger.info('Recovered interrupted recording session', { sessionId: session.id });
        }
        sessionStorage.removeItem('streetstudio_current_session');
      }

    } catch (error) {
      logger.warn('Failed to load recording state from storage', { error });
    }
  }

  /**
   * Setup state persistence
   */
  private setupPersistence(): void {
    // Auto-save every 30 seconds
    this.persistenceTimer = window.setInterval(() => {
      this.persistState();
    }, this.SAVE_INTERVAL);

    // Save on page unload
    window.addEventListener('beforeunload', () => {
      this.persistState();
      this.saveCurrentSessionToSessionStorage();
    });

    // Save on visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.persistState();
        this.saveCurrentSessionToSessionStorage();
      }
    });
  }

  /**
   * Setup permission monitoring
   */
  private setupPermissionMonitoring(): void {
    // Monitor permissions API if supported
    if ('permissions' in navigator) {
      this.checkPermissionStatus('camera').then(state => {
        this.updateState({
          permissions: { ...this.state.permissions, camera: state }
        });
      });
    }
  }

  /**
   * Check permission status
   */
  private async checkPermissionStatus(name: string): Promise<PermissionState> {
    try {
      if ('permissions' in navigator) {
        const result = await navigator.permissions.query({ name: name as PermissionName });
        return result.state;
      }
    } catch (error) {
      logger.debug('Permission check failed', { permission: name, error });
    }
    return 'prompt';
  }

  /**
   * Persist state to storage
   */
  private persistState(): void {
    try {
      const stateToPersist = {
        permissions: this.state.permissions,
        preferences: this.state.preferences,
        timestamp: Date.now()
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(stateToPersist));

      // Persist saved sessions
      if (this.state.savedSessions.length > 0) {
        const sessionsToSave = this.state.savedSessions.slice(-this.MAX_SAVED_SESSIONS);
        localStorage.setItem(this.SESSION_STORAGE_KEY, JSON.stringify(sessionsToSave));
      }

    } catch (error) {
      logger.warn('Failed to persist recording state', { error });
    }
  }

  /**
   * Save current session to sessionStorage for recovery
   */
  private saveCurrentSessionToSessionStorage(): void {
    if (this.state.currentSession) {
      try {
        // Don't save MediaStream/MediaRecorder objects
        const sessionToSave = {
          ...this.state.currentSession,
          stream: undefined,
          mediaRecorder: undefined,
          recordedChunks: [] // Don't persist chunks in session storage
        };
        sessionStorage.setItem('streetstudio_current_session', JSON.stringify(sessionToSave));
      } catch (error) {
        logger.warn('Failed to save current session', { error });
      }
    }
  }

  /**
   * Update store state
   */
  private updateState(updates: Partial<RecordingStoreState>): void {
    const previousState = { ...this.state };
    this.state = { ...this.state, ...updates };

    // Log significant state changes
    const currentSession = this.state.currentSession;
    const previousSession = previousState.currentSession;
    
    if (currentSession?.state !== previousSession?.state) {
      logger.info('Recording state changed', {
        sessionId: currentSession?.id,
        previousState: previousSession?.state,
        newState: currentSession?.state
      });
    }

    this.notifyListeners();
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getState());
      } catch (error) {
        logger.error('Recording store listener error', { error });
      }
    });
  }

  /**
   * Get current state
   */
  public getState(): RecordingStoreState {
    return { ...this.state };
  }

  /**
   * Subscribe to state changes
   */
  public subscribe(listener: (state: RecordingStoreState) => void): () => void {
    this.listeners.add(listener);
    
    // Send current state immediately
    listener(this.getState());
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Initialize recording system
   */
  public async initialize(): Promise<boolean> {
    try {
      // Enumerate available media sources
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      this.updateState({ 
        availableSources: devices,
        isInitialized: true 
      });

      logger.info('Recording store initialized', { 
        deviceCount: devices.length,
        hasInterruptedSession: !!this.state.currentSession
      });

      return true;
    } catch (error) {
      logger.error('Recording store initialization failed', { error });
      this.updateState({ 
        isInitialized: false 
      });
      return false;
    }
  }

  /**
   * Request screen capture permission
   */
  public async requestScreenPermission(): Promise<{ success: boolean; stream?: MediaStream; error?: string }> {
    try {
      this.updatePermissionAttempt();
      this.updateSessionState('requesting-permission');

      const constraints: DisplayMediaStreamConstraints = {
        video: {
          mediaSource: 'screen',
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: this.state.preferences.includeAudio
      };

      const stream = await navigator.mediaDevices.getDisplayMedia(constraints);

      this.updateState({
        permissions: { 
          ...this.state.permissions, 
          screen: 'granted',
          hasRequestedBefore: true 
        }
      });

      return { success: true, stream };

    } catch (error: any) {
      const errorMessage = this.getPermissionErrorMessage(error);
      
      this.updateState({
        permissions: { 
          ...this.state.permissions, 
          screen: 'denied',
          hasRequestedBefore: true,
          deniedCount: this.state.permissions.deniedCount + 1,
          lastDenied: Date.now()
        }
      });

      this.updateSessionState('error', errorMessage);

      logger.warn('Screen permission denied', { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Create new recording session
   */
  public createSession(metadata?: RecordingSession['metadata']): string {
    const sessionId = this.generateSessionId();
    const session: RecordingSession = {
      id: sessionId,
      state: 'idle',
      totalPausedDuration: 0,
      duration: 0,
      recordedChunks: [],
      metadata,
      lastActivity: Date.now()
    };

    this.updateState({ currentSession: session });
    
    logger.info('Created new recording session', { 
      sessionId, 
      hasMetadata: !!metadata 
    });

    return sessionId;
  }

  /**
   * Start recording
   */
  public async startRecording(stream: MediaStream): Promise<boolean> {
    if (!this.state.currentSession) {
      this.createSession();
    }

    const session = this.state.currentSession!;

    try {
      // Setup MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: this.getPreferredMimeType()
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.addRecordingChunk(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        this.handleRecordingComplete();
      };

      mediaRecorder.onerror = (event) => {
        this.handleRecordingError(event.error);
      };

      // Track when stream ends (user stops sharing)
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        this.stopRecording();
      });

      // Start recording
      mediaRecorder.start(1000); // Collect data every second

      const updatedSession: RecordingSession = {
        ...session,
        state: 'recording',
        startTime: Date.now(),
        stream,
        mediaRecorder,
        lastActivity: Date.now()
      };

      this.updateState({ currentSession: updatedSession });
      this.startDurationTimer();

      logger.info('Recording started', { 
        sessionId: session.id,
        mimeType: mediaRecorder.mimeType 
      });

      return true;

    } catch (error) {
      const errorMessage = `Failed to start recording: ${(error as Error).message}`;
      this.updateSessionState('error', errorMessage);
      
      logger.error('Recording start failed', { 
        sessionId: session.id, 
        error 
      });

      return false;
    }
  }

  /**
   * Pause recording
   */
  public pauseRecording(): boolean {
    const session = this.state.currentSession;
    if (!session || session.state !== 'recording') {
      return false;
    }

    try {
      if (session.mediaRecorder && session.mediaRecorder.state === 'recording') {
        session.mediaRecorder.pause();
      }

      const updatedSession: RecordingSession = {
        ...session,
        state: 'paused',
        pausedTime: Date.now(),
        lastActivity: Date.now()
      };

      this.updateState({ currentSession: updatedSession });
      this.stopDurationTimer();

      logger.info('Recording paused', { sessionId: session.id });
      return true;

    } catch (error) {
      logger.error('Recording pause failed', { 
        sessionId: session.id, 
        error 
      });
      return false;
    }
  }

  /**
   * Resume recording
   */
  public resumeRecording(): boolean {
    const session = this.state.currentSession;
    if (!session || session.state !== 'paused') {
      return false;
    }

    try {
      if (session.mediaRecorder && session.mediaRecorder.state === 'paused') {
        session.mediaRecorder.resume();
      }

      // Calculate paused duration
      const pausedDuration = session.pausedTime ? Date.now() - session.pausedTime : 0;
      
      const updatedSession: RecordingSession = {
        ...session,
        state: 'recording',
        totalPausedDuration: session.totalPausedDuration + pausedDuration,
        pausedTime: undefined,
        lastActivity: Date.now()
      };

      this.updateState({ currentSession: updatedSession });
      this.startDurationTimer();

      logger.info('Recording resumed', { 
        sessionId: session.id,
        pausedDuration 
      });
      return true;

    } catch (error) {
      logger.error('Recording resume failed', { 
        sessionId: session.id, 
        error 
      });
      return false;
    }
  }

  /**
   * Stop recording
   */
  public stopRecording(): boolean {
    const session = this.state.currentSession;
    if (!session || (session.state !== 'recording' && session.state !== 'paused')) {
      return false;
    }

    try {
      // Stop media recorder
      if (session.mediaRecorder) {
        if (session.mediaRecorder.state !== 'inactive') {
          session.mediaRecorder.stop();
        }
      }

      // Stop all tracks
      if (session.stream) {
        session.stream.getTracks().forEach(track => track.stop());
      }

      this.stopDurationTimer();

      const updatedSession: RecordingSession = {
        ...session,
        state: 'stopped',
        lastActivity: Date.now()
      };

      this.updateState({ currentSession: updatedSession });

      logger.info('Recording stopped', { 
        sessionId: session.id,
        duration: session.duration,
        chunkCount: session.recordedChunks.length
      });

      return true;

    } catch (error) {
      logger.error('Recording stop failed', { 
        sessionId: session.id, 
        error 
      });
      return false;
    }
  }

  /**
   * Save session to history
   */
  public saveSession(): void {
    const session = this.state.currentSession;
    if (!session) return;

    // Add to saved sessions
    const savedSessions = [...this.state.savedSessions, { ...session }];
    
    // Keep only the most recent sessions
    const recentSessions = savedSessions.slice(-this.MAX_SAVED_SESSIONS);

    this.updateState({ 
      savedSessions: recentSessions,
      currentSession: undefined 
    });

    // Clear session storage
    sessionStorage.removeItem('streetstudio_current_session');

    logger.info('Session saved to history', { 
      sessionId: session.id,
      totalSessions: recentSessions.length 
    });
  }

  /**
   * Update session metadata
   */
  public updateSessionMetadata(metadata: Partial<RecordingSession['metadata']>): void {
    const session = this.state.currentSession;
    if (!session) return;

    const updatedSession: RecordingSession = {
      ...session,
      metadata: { ...session.metadata, ...metadata },
      lastActivity: Date.now()
    };

    this.updateState({ currentSession: updatedSession });
  }

  /**
   * Update preferences
   */
  public updatePreferences(preferences: Partial<RecordingPreferences>): void {
    this.updateState({
      preferences: { ...this.state.preferences, ...preferences }
    });

    logger.info('Recording preferences updated', { preferences });
  }

  /**
   * Clear session history
   */
  public clearSessionHistory(): void {
    this.updateState({ savedSessions: [] });
    localStorage.removeItem(this.SESSION_STORAGE_KEY);
    
    logger.info('Session history cleared');
  }

  /**
   * Get formatted duration for current session
   */
  public getFormattedDuration(): string {
    const session = this.state.currentSession;
    if (!session) return '00:00';

    return formatTime(session.duration);
  }

  /**
   * Check if recording is active
   */
  public isRecording(): boolean {
    return this.state.currentSession?.state === 'recording';
  }

  /**
   * Check if recording is paused
   */
  public isPaused(): boolean {
    return this.state.currentSession?.state === 'paused';
  }

  /**
   * Check if session exists
   */
  public hasActiveSession(): boolean {
    return !!this.state.currentSession;
  }

  /**
   * Destroy store and clean up
   */
  public destroy(): void {
    // Stop any active recording
    if (this.isRecording() || this.isPaused()) {
      this.stopRecording();
    }

    // Clear timers
    if (this.persistenceTimer) {
      clearInterval(this.persistenceTimer);
    }
    this.stopDurationTimer();

    // Persist final state
    this.persistState();

    // Clear listeners
    this.listeners.clear();

    logger.info('Recording store destroyed');
  }

  // Private helper methods

  private generateSessionId(): string {
    return `recording_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private updatePermissionAttempt(): void {
    this.updateState({
      permissions: {
        ...this.state.permissions,
        hasRequestedBefore: true
      }
    });
  }

  private updateSessionState(state: RecordingState, error?: string): void {
    const session = this.state.currentSession;
    if (!session) return;

    const updatedSession: RecordingSession = {
      ...session,
      state,
      error,
      lastActivity: Date.now()
    };

    this.updateState({ currentSession: updatedSession });
  }

  private getPermissionErrorMessage(error: any): string {
    if (error?.name === 'NotAllowedError') {
      return 'Screen recording permission was denied. Please allow screen sharing to continue.';
    } else if (error?.name === 'NotFoundError') {
      return 'No screen sources available for recording.';
    } else if (error?.name === 'NotSupportedError') {
      return 'Screen recording is not supported in this browser.';
    } else if (error?.name === 'AbortError') {
      return 'Screen recording was cancelled.';
    }
    return error?.message || 'Failed to access screen recording.';
  }

  private getPreferredMimeType(): string {
    const types = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return '';
  }

  private addRecordingChunk(chunk: Blob): void {
    const session = this.state.currentSession;
    if (!session) return;

    const updatedSession: RecordingSession = {
      ...session,
      recordedChunks: [...session.recordedChunks, chunk],
      lastActivity: Date.now()
    };

    this.updateState({ currentSession: updatedSession });
  }

  private handleRecordingComplete(): void {
    const session = this.state.currentSession;
    if (!session) return;

    logger.info('Recording completed', {
      sessionId: session.id,
      duration: session.duration,
      chunks: session.recordedChunks.length
    });

    // Auto-save if enabled
    if (this.state.preferences.autoSave) {
      this.saveSession();
    }
  }

  private handleRecordingError(error: any): void {
    const errorMessage = `Recording error: ${error?.message || 'Unknown error'}`;
    this.updateSessionState('error', errorMessage);
    
    logger.error('Recording error occurred', { error });
  }

  private startDurationTimer(): void {
    this.stopDurationTimer(); // Clear any existing timer
    
    this.durationTimer = window.setInterval(() => {
      const session = this.state.currentSession;
      if (!session || session.state !== 'recording') {
        this.stopDurationTimer();
        return;
      }

      if (session.startTime) {
        const elapsed = Date.now() - session.startTime - session.totalPausedDuration;
        const updatedSession: RecordingSession = {
          ...session,
          duration: elapsed
        };

        this.updateState({ currentSession: updatedSession });
      }
    }, 1000);
  }

  private stopDurationTimer(): void {
    if (this.durationTimer) {
      clearInterval(this.durationTimer);
      this.durationTimer = undefined;
    }
  }
}

// Export singleton instance
let recordingStoreInstance: RecordingStore | null = null;

export function createRecordingStore(): RecordingStore {
  if (recordingStoreInstance) {
    recordingStoreInstance.destroy();
  }
  
  recordingStoreInstance = new RecordingStore();
  return recordingStoreInstance;
}

export function getRecordingStore(): RecordingStore {
  if (!recordingStoreInstance) {
    throw new Error('Recording store not initialized. Call createRecordingStore first.');
  }
  
  return recordingStoreInstance;
}

// Convenience functions
export function useRecordingState(): RecordingStoreState {
  return getRecordingStore().getState();
}

export function subscribeToRecording(callback: (state: RecordingStoreState) => void): () => void {
  return getRecordingStore().subscribe(callback);
}

export function isCurrentlyRecording(): boolean {
  return getRecordingStore().isRecording();
}

export function getCurrentSession(): RecordingSession | undefined {
  return getRecordingStore().getState().currentSession;
}