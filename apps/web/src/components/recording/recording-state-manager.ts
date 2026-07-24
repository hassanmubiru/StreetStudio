/**
 * Recording State Manager
 * 
 * Orchestrates recording state transitions, keyboard shortcuts, and session persistence.
 * Integrates with RecordingStore and provides high-level recording management.
 * 
 * Requirements: 3.3, 3.6, 3.10
 */

import { getRecordingStore, type RecordingStore, type RecordingSession, type RecordingState } from '../../stores/recording-store.js';
import { KeyboardShortcuts, type KeyboardShortcut } from '../../app/keyboard-shortcuts.js';
import { logger } from '../../app/client-logger.js';

export interface RecordingStateManagerOptions {
  enableKeyboardShortcuts?: boolean;
  enableSessionRecovery?: boolean;
  enablePermissionGuidance?: boolean;
  autoSaveInterval?: number; // minutes
}

export interface RecordingEvents {
  onStateChange?: (state: RecordingState, session?: RecordingSession) => void;
  onPermissionDenied?: (error: string, guidance: string) => void;
  onSessionRecovered?: (session: RecordingSession) => void;
  onRecordingComplete?: (session: RecordingSession) => void;
  onError?: (error: string, session?: RecordingSession) => void;
}

export class RecordingStateManager {
  private recordingStore: RecordingStore;
  private keyboardShortcuts: KeyboardShortcuts;
  private options: Required<RecordingStateManagerOptions>;
  private events: RecordingEvents;
  
  private isInitialized = false;
  private unsubscribeFromStore?: () => void;
  private autoSaveTimer?: number;
  private permissionGuidanceShown = false;

  private readonly DEFAULT_OPTIONS: Required<RecordingStateManagerOptions> = {
    enableKeyboardShortcuts: true,
    enableSessionRecovery: true,
    enablePermissionGuidance: true,
    autoSaveInterval: 5 // 5 minutes
  };

  constructor(
    keyboardShortcuts: KeyboardShortcuts,
    options: RecordingStateManagerOptions = {},
    events: RecordingEvents = {}
  ) {
    this.keyboardShortcuts = keyboardShortcuts;
    this.options = { ...this.DEFAULT_OPTIONS, ...options };
    this.events = events;
    this.recordingStore = getRecordingStore();
  }

  /**
   * Initialize the recording state manager
   */
  public async initialize(): Promise<boolean> {
    try {
      // Initialize recording store
      const storeInitialized = await this.recordingStore.initialize();
      if (!storeInitialized) {
        throw new Error('Failed to initialize recording store');
      }

      // Subscribe to store changes
      this.unsubscribeFromStore = this.recordingStore.subscribe((state) => {
        this.handleStoreStateChange(state);
      });

      // Setup keyboard shortcuts if enabled
      if (this.options.enableKeyboardShortcuts) {
        this.setupKeyboardShortcuts();
      }

      // Check for session recovery
      if (this.options.enableSessionRecovery) {
        this.checkForSessionRecovery();
      }

      // Setup auto-save if enabled
      this.setupAutoSave();

      this.isInitialized = true;

      logger.info('Recording state manager initialized', {
        options: this.options
      });

      return true;

    } catch (error) {
      logger.error('Recording state manager initialization failed', { error });
      return false;
    }
  }

  /**
   * Request permission and start recording
   */
  public async startRecording(metadata?: RecordingSession['metadata']): Promise<boolean> {
    if (!this.isInitialized) {
      logger.warn('Recording state manager not initialized');
      return false;
    }

    try {
      // Create session if needed
      if (!this.recordingStore.hasActiveSession()) {
        this.recordingStore.createSession(metadata);
      } else if (metadata) {
        this.recordingStore.updateSessionMetadata(metadata);
      }

      // Request screen permission
      const permissionResult = await this.recordingStore.requestScreenPermission();
      
      if (!permissionResult.success) {
        this.handlePermissionDenied(permissionResult.error || 'Permission denied');
        return false;
      }

      // Start recording with the stream
      const success = await this.recordingStore.startRecording(permissionResult.stream!);
      
      if (success) {
        logger.info('Recording started successfully');
        return true;
      } else {
        throw new Error('Failed to start recording');
      }

    } catch (error) {
      const errorMessage = `Failed to start recording: ${(error as Error).message}`;
      this.events.onError?.(errorMessage);
      logger.error('Start recording failed', { error });
      return false;
    }
  }

  /**
   * Pause current recording
   */
  public pauseRecording(): boolean {
    if (!this.isInitialized) {
      logger.warn('Recording state manager not initialized');
      return false;
    }

    const success = this.recordingStore.pauseRecording();
    
    if (success) {
      logger.info('Recording paused');
    } else {
      logger.warn('Failed to pause recording');
    }
    
    return success;
  }

  /**
   * Resume paused recording
   */
  public resumeRecording(): boolean {
    if (!this.isInitialized) {
      logger.warn('Recording state manager not initialized');
      return false;
    }

    const success = this.recordingStore.resumeRecording();
    
    if (success) {
      logger.info('Recording resumed');
    } else {
      logger.warn('Failed to resume recording');
    }
    
    return success;
  }

  /**
   * Stop current recording
   */
  public stopRecording(): boolean {
    if (!this.isInitialized) {
      logger.warn('Recording state manager not initialized');
      return false;
    }

    const success = this.recordingStore.stopRecording();
    
    if (success) {
      logger.info('Recording stopped');
      
      // Trigger completion event
      const session = this.recordingStore.getState().currentSession;
      if (session) {
        this.events.onRecordingComplete?.(session);
      }
    } else {
      logger.warn('Failed to stop recording');
    }
    
    return success;
  }

  /**
   * Toggle recording state (start/pause/resume based on current state)
   */
  public toggleRecording(): boolean {
    const state = this.recordingStore.getState();
    const session = state.currentSession;

    if (!session) {
      // No session - start recording
      return this.startRecording().then(success => success);
    }

    switch (session.state) {
      case 'idle':
      case 'stopped':
        return this.startRecording().then(success => success);
      
      case 'recording':
        return this.pauseRecording();
      
      case 'paused':
        return this.resumeRecording();
      
      default:
        logger.warn('Cannot toggle recording in current state', { state: session.state });
        return false;
    }
  }

  /**
   * Save current session
   */
  public saveSession(): void {
    if (!this.isInitialized) {
      logger.warn('Recording state manager not initialized');
      return;
    }

    this.recordingStore.saveSession();
    logger.info('Session saved');
  }

  /**
   * Update session metadata
   */
  public updateMetadata(metadata: Partial<RecordingSession['metadata']>): void {
    if (!this.isInitialized) {
      logger.warn('Recording state manager not initialized');
      return;
    }

    this.recordingStore.updateSessionMetadata(metadata);
    logger.debug('Session metadata updated', { metadata });
  }

  /**
   * Get current recording state
   */
  public getCurrentState(): { state: RecordingState; session?: RecordingSession } {
    const storeState = this.recordingStore.getState();
    return {
      state: storeState.currentSession?.state || 'idle',
      session: storeState.currentSession
    };
  }

  /**
   * Get formatted duration of current recording
   */
  public getFormattedDuration(): string {
    return this.recordingStore.getFormattedDuration();
  }

  /**
   * Check if recording is active
   */
  public isRecording(): boolean {
    return this.recordingStore.isRecording();
  }

  /**
   * Check if recording is paused
   */
  public isPaused(): boolean {
    return this.recordingStore.isPaused();
  }

  /**
   * Destroy the manager and clean up resources
   */
  public destroy(): void {
    // Unsubscribe from store
    if (this.unsubscribeFromStore) {
      this.unsubscribeFromStore();
    }

    // Clear auto-save timer
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    // Remove keyboard shortcuts
    if (this.options.enableKeyboardShortcuts) {
      this.removeKeyboardShortcuts();
    }

    this.isInitialized = false;
    logger.info('Recording state manager destroyed');
  }

  /**
   * Setup keyboard shortcuts for recording control
   */
  private setupKeyboardShortcuts(): void {
    const shortcuts: KeyboardShortcut[] = [
      {
        key: ' ',
        modifiers: ['ctrl'],
        context: 'recordings',
        description: 'Start, pause, or resume recording',
        handler: (event) => {
          event.preventDefault();
          this.toggleRecording();
          return true;
        },
        priority: 100
      },
      {
        key: ' ',
        modifiers: ['cmd'],
        context: 'recordings',
        description: 'Start, pause, or resume recording (Mac)',
        handler: (event) => {
          event.preventDefault();
          this.toggleRecording();
          return true;
        },
        priority: 100
      },
      {
        key: 'Escape',
        context: 'recordings',
        description: 'Stop recording',
        handler: (event) => {
          if (this.isRecording() || this.isPaused()) {
            event.preventDefault();
            this.stopRecording();
            return true;
          }
          return false;
        },
        priority: 90
      },
      {
        key: 'r',
        modifiers: ['ctrl', 'shift'],
        context: 'recordings',
        description: 'Start new recording',
        handler: (event) => {
          event.preventDefault();
          this.startRecording();
          return true;
        },
        priority: 80
      },
      {
        key: 'r',
        modifiers: ['cmd', 'shift'],
        context: 'recordings',
        description: 'Start new recording (Mac)',
        handler: (event) => {
          event.preventDefault();
          this.startRecording();
          return true;
        },
        priority: 80
      },
      {
        key: 'p',
        modifiers: ['ctrl'],
        context: 'recordings',
        description: 'Pause/resume recording',
        handler: (event) => {
          if (this.isRecording()) {
            event.preventDefault();
            this.pauseRecording();
            return true;
          } else if (this.isPaused()) {
            event.preventDefault();
            this.resumeRecording();
            return true;
          }
          return false;
        },
        priority: 70
      },
      {
        key: 's',
        modifiers: ['ctrl'],
        context: 'recordings',
        description: 'Save recording session',
        handler: (event) => {
          const session = this.getCurrentState().session;
          if (session && session.state === 'stopped') {
            event.preventDefault();
            this.saveSession();
            return true;
          }
          return false;
        },
        priority: 60
      }
    ];

    this.keyboardShortcuts.register(shortcuts);
    
    logger.debug('Recording keyboard shortcuts registered', { 
      shortcutCount: shortcuts.length 
    });
  }

  /**
   * Remove keyboard shortcuts
   */
  private removeKeyboardShortcuts(): void {
    // Remove recording-specific shortcuts
    this.keyboardShortcuts.unregister(' ', ['ctrl'], 'recordings');
    this.keyboardShortcuts.unregister(' ', ['cmd'], 'recordings');
    this.keyboardShortcuts.unregister('Escape', undefined, 'recordings');
    this.keyboardShortcuts.unregister('r', ['ctrl', 'shift'], 'recordings');
    this.keyboardShortcuts.unregister('r', ['cmd', 'shift'], 'recordings');
    this.keyboardShortcuts.unregister('p', ['ctrl'], 'recordings');
    this.keyboardShortcuts.unregister('s', ['ctrl'], 'recordings');

    logger.debug('Recording keyboard shortcuts removed');
  }

  /**
   * Handle store state changes
   */
  private handleStoreStateChange(storeState: any): void {
    const session = storeState.currentSession;
    const state = session?.state || 'idle';

    // Emit state change event
    this.events.onStateChange?.(state, session);

    // Handle specific state changes
    switch (state) {
      case 'error':
        if (session?.error) {
          this.events.onError?.(session.error, session);
        }
        break;

      case 'stopped':
        if (session && session.recordedChunks.length > 0) {
          this.events.onRecordingComplete?.(session);
        }
        break;
    }
  }

  /**
   * Handle permission denied scenarios
   */
  private handlePermissionDenied(error: string): void {
    const guidance = this.getPermissionGuidance(error);
    
    this.events.onPermissionDenied?.(error, guidance);
    
    // Show guidance if enabled and not shown recently
    if (this.options.enablePermissionGuidance && !this.permissionGuidanceShown) {
      this.showPermissionGuidance(error, guidance);
      this.permissionGuidanceShown = true;
      
      // Reset flag after 5 minutes
      setTimeout(() => {
        this.permissionGuidanceShown = false;
      }, 5 * 60 * 1000);
    }
    
    logger.warn('Recording permission denied', { error, guidance });
  }

  /**
   * Get user guidance for permission issues
   */
  private getPermissionGuidance(error: string): string {
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

  /**
   * Show permission guidance UI
   */
  private showPermissionGuidance(error: string, guidance: string): void {
    // Create guidance modal/toast
    const guidanceElement = document.createElement('div');
    guidanceElement.className = 'fixed top-4 right-4 z-50 max-w-md bg-yellow-50 border border-yellow-200 rounded-lg p-4 shadow-lg';
    guidanceElement.setAttribute('role', 'alert');
    guidanceElement.setAttribute('aria-labelledby', 'permission-guidance-title');
    
    guidanceElement.innerHTML = `
      <div class="flex">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
        </div>
        <div class="ml-3 flex-1">
          <h3 id="permission-guidance-title" class="text-sm font-medium text-yellow-800">
            Screen Recording Permission Required
          </h3>
          <div class="mt-2 text-sm text-yellow-700">
            <p class="whitespace-pre-line">${guidance}</p>
          </div>
          <div class="mt-3">
            <button 
              type="button"
              class="text-sm bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-3 py-1 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2"
              onclick="this.closest('[role=alert]').remove()"
            >
              Got it
            </button>
          </div>
        </div>
        <div class="flex-shrink-0 ml-4">
          <button 
            type="button"
            class="text-yellow-400 hover:text-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 rounded-md"
            onclick="this.closest('[role=alert]').remove()"
            aria-label="Close"
          >
            <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(guidanceElement);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (guidanceElement.parentNode) {
        guidanceElement.remove();
      }
    }, 10000);
  }

  /**
   * Check for interrupted session recovery
   */
  private checkForSessionRecovery(): void {
    const state = this.recordingStore.getState();
    
    if (state.currentSession && state.currentSession.error?.includes('interrupted')) {
      this.events.onSessionRecovered?.(state.currentSession);
      
      logger.info('Session recovery detected', {
        sessionId: state.currentSession.id
      });
    }
  }

  /**
   * Setup auto-save functionality
   */
  private setupAutoSave(): void {
    if (this.options.autoSaveInterval > 0) {
      this.autoSaveTimer = window.setInterval(() => {
        const session = this.recordingStore.getState().currentSession;
        
        if (session && session.state === 'stopped' && session.recordedChunks.length > 0) {
          this.recordingStore.saveSession();
          logger.debug('Auto-saved recording session', { sessionId: session.id });
        }
      }, this.options.autoSaveInterval * 60 * 1000); // Convert minutes to milliseconds
    }
  }
}