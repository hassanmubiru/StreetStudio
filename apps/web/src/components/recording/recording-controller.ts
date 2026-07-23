/**
 * Recording Controller with Drawing Integration
 * 
 * Manages screen recording sessions and integrates drawing/annotation tools.
 * Provides real-time synchronization of drawings with recording capture.
 * 
 * Requirements: 3.5 - Drawing and annotation tools with recording integration
 */

import { DrawingOverlay, DrawingState, DrawingTool } from '../drawing/drawing-overlay.js';
import { DrawingToolbar, ToolbarOptions } from '../drawing/drawing-toolbar.js';

export interface RecordingSession {
  id: string;
  isRecording: boolean;
  isPaused: boolean;
  startTime: number;
  duration: number;
  drawingData: DrawingState[];
}

export interface RecordingOptions {
  enableDrawing: boolean;
  toolbarOptions?: ToolbarOptions;
  persistDrawings: boolean;
  syncWithRecording: boolean;
}

export interface RecordingCallbacks {
  onRecordingStart?: (session: RecordingSession) => void;
  onRecordingStop?: (session: RecordingSession) => void;
  onRecordingPause?: (session: RecordingSession) => void;
  onRecordingResume?: (session: RecordingSession) => void;
  onDrawingUpdate?: (state: DrawingState) => void;
}

export class RecordingController {
  private container: HTMLElement;
  private drawingOverlay?: DrawingOverlay;
  private drawingToolbar?: DrawingToolbar;
  private currentSession?: RecordingSession;
  private options: Required<RecordingOptions>;
  private callbacks: RecordingCallbacks;
  
  // Recording state
  private mediaRecorder?: MediaRecorder;
  private recordedChunks: Blob[] = [];
  private drawingHistory: Array<{ timestamp: number; state: DrawingState }> = [];
  
  // Storage for session persistence
  private readonly STORAGE_KEY = 'streetstudio_drawing_sessions';

  private readonly defaultOptions: Required<RecordingOptions> = {
    enableDrawing: true,
    toolbarOptions: {
      position: 'floating',
      compact: true
    },
    persistDrawings: true,
    syncWithRecording: true
  };

  constructor(
    container: HTMLElement,
    options: RecordingOptions = {},
    callbacks: RecordingCallbacks = {}
  ) {
    this.container = container;
    this.options = { ...this.defaultOptions, ...options };
    this.callbacks = callbacks;

    this.setupRecordingInterface();
    if (this.options.enableDrawing) {
      this.setupDrawingSystem();
    }
  }

  private setupRecordingInterface(): void {
    // Create recording controls overlay
    const controlsOverlay = document.createElement('div');
    controlsOverlay.className = 'recording-controls absolute top-4 left-4 z-20';
    controlsOverlay.innerHTML = this.getControlsHTML();
    
    this.container.appendChild(controlsOverlay);
    this.setupRecordingEventListeners();
  }

  private setupDrawingSystem(): void {
    // Initialize drawing overlay
    this.drawingOverlay = new DrawingOverlay(this.container);
    
    // Initialize drawing toolbar
    this.drawingToolbar = new DrawingToolbar(
      this.container,
      this.options.toolbarOptions,
      {
        onToolChange: (tool) => this.handleToolChange(tool),
        onStyleChange: (style) => this.handleStyleChange(style),
        onUndo: () => this.handleUndo(),
        onRedo: () => this.handleRedo(),
        onClear: () => this.handleClear()
      }
    );

    // Setup drawing state synchronization
    this.drawingOverlay.onStateChanged((state) => {
      this.handleDrawingStateChange(state);
    });

    // Load persisted drawings if available
    if (this.options.persistDrawings) {
      this.loadPersistedDrawings();
    }
  }

  private getControlsHTML(): string {
    return `
      <div class="recording-panel bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 flex items-center space-x-3">
        <button
          type="button"
          class="record-btn p-2 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors"
          title="Start Recording"
          aria-label="Start screen recording"
        >
          <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8"/>
          </svg>
        </button>
        
        <button
          type="button"
          class="pause-btn p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors hidden"
          title="Pause Recording"
          aria-label="Pause recording"
        >
          <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6" />
          </svg>
        </button>
        
        <button
          type="button"
          class="stop-btn p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors hidden"
          title="Stop Recording"
          aria-label="Stop recording"
        >
          <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
          </svg>
        </button>
        
        <div class="recording-status flex items-center space-x-2 text-sm">
          <div class="status-indicator w-3 h-3 rounded-full bg-gray-300 hidden"></div>
          <span class="status-text text-gray-600 dark:text-gray-400">Ready</span>
          <span class="duration text-gray-500 dark:text-gray-500 font-mono hidden">00:00</span>
        </div>
        
        ${this.options.enableDrawing ? `
          <div class="drawing-toggle border-l border-gray-200 dark:border-gray-700 pl-3 ml-3">
            <button
              type="button"
              class="toggle-drawing-btn p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
              title="Toggle Drawing Tools"
              aria-label="Show or hide drawing tools"
            >
              <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  private setupRecordingEventListeners(): void {
    this.container.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest('button');
      
      if (!button) return;

      if (button.classList.contains('record-btn')) {
        this.startRecording();
      } else if (button.classList.contains('pause-btn')) {
        this.pauseRecording();
      } else if (button.classList.contains('stop-btn')) {
        this.stopRecording();
      } else if (button.classList.contains('toggle-drawing-btn')) {
        this.toggleDrawingTools();
      }
    });

    // Keyboard shortcuts for recording
    document.addEventListener('keydown', (event) => {
      // Only handle shortcuts when recording interface is active
      if (!this.container.querySelector('.recording-controls')) return;

      if (event.key === ' ' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        if (this.currentSession?.isRecording) {
          if (this.currentSession.isPaused) {
            this.resumeRecording();
          } else {
            this.pauseRecording();
          }
        } else {
          this.startRecording();
        }
      } else if (event.key === 'Escape' && this.currentSession?.isRecording) {
        event.preventDefault();
        this.stopRecording();
      }
    });
  }

  public async startRecording(): Promise<void> {
    try {
      // Request screen capture
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      // Initialize media recorder
      this.mediaRecorder = new MediaRecorder(stream);
      this.recordedChunks = [];
      this.drawingHistory = [];

      // Create new session
      this.currentSession = {
        id: this.generateSessionId(),
        isRecording: true,
        isPaused: false,
        startTime: Date.now(),
        duration: 0,
        drawingData: []
      };

      // Setup recording event handlers
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.handleRecordingComplete();
      };

      // Start recording
      this.mediaRecorder.start(100); // Collect data every 100ms

      // Update UI
      this.updateRecordingUI('recording');
      this.startDurationTimer();

      // Enable drawing tools during recording
      if (this.options.enableDrawing && this.drawingOverlay) {
        this.drawingOverlay.setTool('pen'); // Default to pen tool
      }

      // Notify callback
      this.callbacks.onRecordingStart?.(this.currentSession);

    } catch (error) {
      console.error('Failed to start recording:', error);
      this.handleRecordingError(error as Error);
    }
  }

  public pauseRecording(): void {
    if (!this.currentSession?.isRecording || this.currentSession.isPaused) return;

    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
    }

    this.currentSession.isPaused = true;
    this.updateRecordingUI('paused');
    this.callbacks.onRecordingPause?.(this.currentSession);
  }

  public resumeRecording(): void {
    if (!this.currentSession?.isRecording || !this.currentSession.isPaused) return;

    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
    }

    this.currentSession.isPaused = false;
    this.updateRecordingUI('recording');
    this.callbacks.onRecordingResume?.(this.currentSession);
  }

  public stopRecording(): void {
    if (!this.currentSession?.isRecording) return;

    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      
      // Stop all tracks
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }

    this.currentSession.isRecording = false;
    this.currentSession.isPaused = false;
    
    // Save final drawing state
    if (this.drawingOverlay && this.options.syncWithRecording) {
      this.currentSession.drawingData = this.drawingHistory.map(item => item.state);
    }

    this.updateRecordingUI('stopped');
    
    // Disable drawing tools
    if (this.drawingOverlay) {
      this.drawingOverlay.setTool('none');
    }

    this.callbacks.onRecordingStop?.(this.currentSession);
  }

  private handleRecordingComplete(): void {
    if (!this.currentSession) return;

    // Create final recording blob
    const recordingBlob = new Blob(this.recordedChunks, { type: 'video/webm' });
    
    // Create download link (temporary solution - in production this would upload to server)
    const downloadUrl = URL.createObjectURL(recordingBlob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `recording-${this.currentSession.id}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Cleanup
    URL.revokeObjectURL(downloadUrl);
    
    // Persist session data
    if (this.options.persistDrawings) {
      this.persistSession(this.currentSession);
    }
  }

  private handleRecordingError(error: Error): void {
    console.error('Recording error:', error);
    this.updateRecordingUI('error');
    
    // Show user-friendly error message
    this.showError('Failed to start recording. Please check your browser permissions.');
  }

  private updateRecordingUI(state: 'ready' | 'recording' | 'paused' | 'stopped' | 'error'): void {
    const recordBtn = this.container.querySelector('.record-btn');
    const pauseBtn = this.container.querySelector('.pause-btn');
    const stopBtn = this.container.querySelector('.stop-btn');
    const statusIndicator = this.container.querySelector('.status-indicator');
    const statusText = this.container.querySelector('.status-text');
    const duration = this.container.querySelector('.duration');

    // Reset all states
    recordBtn?.classList.remove('hidden');
    pauseBtn?.classList.add('hidden');
    stopBtn?.classList.add('hidden');
    statusIndicator?.classList.add('hidden');
    duration?.classList.add('hidden');

    switch (state) {
      case 'ready':
        statusText!.textContent = 'Ready';
        break;
        
      case 'recording':
        recordBtn?.classList.add('hidden');
        pauseBtn?.classList.remove('hidden');
        stopBtn?.classList.remove('hidden');
        statusIndicator?.classList.remove('hidden');
        statusIndicator?.classList.add('bg-red-500', 'animate-pulse');
        statusText!.textContent = 'Recording';
        duration?.classList.remove('hidden');
        break;
        
      case 'paused':
        pauseBtn?.classList.add('hidden');
        recordBtn?.classList.remove('hidden');
        statusIndicator?.classList.remove('animate-pulse');
        statusIndicator?.classList.add('bg-yellow-500');
        statusText!.textContent = 'Paused';
        break;
        
      case 'stopped':
        statusIndicator?.classList.remove('bg-red-500', 'bg-yellow-500', 'animate-pulse');
        statusText!.textContent = 'Completed';
        break;
        
      case 'error':
        statusIndicator?.classList.remove('bg-red-500', 'animate-pulse');
        statusIndicator?.classList.add('bg-red-600');
        statusText!.textContent = 'Error';
        break;
    }
  }

  private startDurationTimer(): void {
    const updateDuration = () => {
      if (this.currentSession?.isRecording && !this.currentSession.isPaused) {
        this.currentSession.duration = Date.now() - this.currentSession.startTime;
        const durationElement = this.container.querySelector('.duration');
        if (durationElement) {
          durationElement.textContent = this.formatDuration(this.currentSession.duration);
        }
        requestAnimationFrame(updateDuration);
      }
    };
    
    requestAnimationFrame(updateDuration);
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  // Drawing integration methods
  private handleToolChange(tool: DrawingTool): void {
    if (this.drawingOverlay) {
      this.drawingOverlay.setTool(tool);
    }
  }

  private handleStyleChange(style: any): void {
    if (this.drawingOverlay) {
      this.drawingOverlay.setStyle(style);
    }
  }

  private handleUndo(): void {
    if (this.drawingOverlay) {
      const success = this.drawingOverlay.undo();
      this.updateUndoRedoState();
    }
  }

  private handleRedo(): void {
    if (this.drawingOverlay) {
      const success = this.drawingOverlay.redo();
      this.updateUndoRedoState();
    }
  }

  private handleClear(): void {
    if (this.drawingOverlay) {
      this.drawingOverlay.clear();
      this.updateUndoRedoState();
    }
  }

  private handleDrawingStateChange(state: DrawingState): void {
    // Sync drawing state with recording timeline
    if (this.options.syncWithRecording && this.currentSession?.isRecording) {
      this.drawingHistory.push({
        timestamp: Date.now() - this.currentSession.startTime,
        state: { ...state }
      });
    }

    this.updateUndoRedoState();
    this.callbacks.onDrawingUpdate?.(state);
  }

  private updateUndoRedoState(): void {
    if (this.drawingToolbar && this.drawingOverlay) {
      const state = this.drawingOverlay.getState();
      const canUndo = state.paths.length > 0 || state.textAnnotations.length > 0;
      const canRedo = state.redoStack.length > 0;
      this.drawingToolbar.updateUndoRedoState(canUndo, canRedo);
    }
  }

  private toggleDrawingTools(): void {
    // Toggle visibility of drawing toolbar
    const toolbar = this.container.querySelector('.drawing-toolbar') as HTMLElement;
    if (toolbar) {
      toolbar.style.display = toolbar.style.display === 'none' ? '' : 'none';
    }
  }

  private persistSession(session: RecordingSession): void {
    try {
      const sessions = this.getPersistedSessions();
      sessions.push(session);
      
      // Keep only last 10 sessions
      const recentSessions = sessions.slice(-10);
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(recentSessions));
    } catch (error) {
      console.error('Failed to persist session:', error);
    }
  }

  private loadPersistedDrawings(): void {
    try {
      const sessions = this.getPersistedSessions();
      const lastSession = sessions[sessions.length - 1];
      
      if (lastSession?.drawingData.length > 0 && this.drawingOverlay) {
        // Load the last drawing state from the most recent session
        const lastDrawingState = lastSession.drawingData[lastSession.drawingData.length - 1];
        this.drawingOverlay.loadState(lastDrawingState);
      }
    } catch (error) {
      console.error('Failed to load persisted drawings:', error);
    }
  }

  private getPersistedSessions(): RecordingSession[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to load persisted sessions:', error);
      return [];
    }
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private showError(message: string): void {
    // Create temporary error notification
    const error = document.createElement('div');
    error.className = 'fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50';
    error.textContent = message;
    
    document.body.appendChild(error);
    
    setTimeout(() => {
      error.remove();
    }, 5000);
  }

  // Public API methods
  public getCurrentSession(): RecordingSession | undefined {
    return this.currentSession;
  }

  public getDrawingState(): DrawingState | undefined {
    return this.drawingOverlay?.getState();
  }

  public setDrawingEnabled(enabled: boolean): void {
    if (this.drawingOverlay && this.drawingToolbar) {
      const toolbar = this.container.querySelector('.drawing-toolbar') as HTMLElement;
      if (toolbar) {
        toolbar.style.display = enabled ? '' : 'none';
      }
      
      if (!enabled) {
        this.drawingOverlay.setTool('none');
      }
    }
  }

  public destroy(): void {
    // Stop any active recording
    if (this.currentSession?.isRecording) {
      this.stopRecording();
    }

    // Cleanup drawing components
    this.drawingOverlay?.destroy();
    this.drawingToolbar?.destroy();

    // Remove recording controls
    this.container.querySelector('.recording-controls')?.remove();
  }
}