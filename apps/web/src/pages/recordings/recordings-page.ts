import { RecordingController } from '../../components/recording/recording-controller.js';
import { formatTime } from '../../utils/format-time.js';

/**
 * Browser Recording Interface Page
 * Implements comprehensive recording functionality with screen selection,
 * floating controls, real-time indicators, and cursor highlighting options.
 */
export class RecordingsPage {
  private container: HTMLElement;
  private recorder: Recorder | null = null;
  private recordingInterface: RecordingInterface;
  private screenSelector: ScreenSelector;
  private recordingControls: RecordingControls;
  private cursorSettings: CursorSettings;
  private isRecording = false;
  private recordingStartTime: number = 0;
  private recordingTimer: number | null = null;
  private mediaStream: MediaStream | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.setupContainer();
    this.initializeComponents();
    this.setupEventListeners();
  }

  private setupContainer(): void {
    this.container.className = 'recording-page h-full flex flex-col bg-gray-50 dark:bg-gray-900';
    this.container.setAttribute('data-main-content', '');
    this.container.setAttribute('role', 'main');
    this.container.setAttribute('aria-label', 'Recording Interface');
  }

  private initializeComponents(): void {
    // Initialize recording interface components
    this.screenSelector = new ScreenSelector({
      onSourceSelected: this.handleSourceSelected.bind(this)
    });

    this.recordingControls = new RecordingControls({
      onRecord: this.handleStartRecording.bind(this),
      onPause: this.handlePauseRecording.bind(this),
      onStop: this.handleStopRecording.bind(this),
      onToggleDrawing: this.handleToggleDrawing.bind(this)
    });

    this.cursorSettings = new CursorSettings({
      onSettingsChanged: this.handleCursorSettingsChanged.bind(this)
    });

    this.recordingInterface = new RecordingInterface({
      screenSelector: this.screenSelector,
      recordingControls: this.recordingControls,
      cursorSettings: this.cursorSettings
    });
  }

  private setupEventListeners(): void {
    // Global keyboard shortcuts for recording
    document.addEventListener('keydown', this.handleKeyboardShortcuts.bind(this));
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
  }

  private handleKeyboardShortcuts(event: KeyboardEvent): void {
    // Only handle shortcuts when recording interface is active
    if (!this.container.contains(document.activeElement)) return;

    switch (event.key) {
      case ' ':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          if (this.isRecording) {
            this.handlePauseRecording();
          } else {
            this.handleStartRecording();
          }
        }
        break;
      case 'Escape':
        event.preventDefault();
        if (this.isRecording) {
          this.handleStopRecording();
        }
        break;
    }
  }

  private async handleSourceSelected(source: { id: string; name: string; thumbnail?: string }): Promise<void> {
    try {
      // Request screen capture permission and get media stream
      this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          mediaSource: 'screen',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: true
      });

      // Enable recording controls
      this.recordingControls.setEnabled(true);
      this.showStatusMessage('Screen capture ready. Click record to start.', 'success');
      
    } catch (error) {
      console.error('Screen capture permission denied:', error);
      this.showStatusMessage('Screen capture permission denied. Please allow access to continue.', 'error');
      this.recordingControls.setEnabled(false);
    }
  }

  private async handleStartRecording(): Promise<void> {
    if (!this.mediaStream) {
      this.showStatusMessage('Please select a screen source first.', 'warning');
      return;
    }

    try {
      // Initialize recorder if not already created
      if (!this.recorder) {
        this.recorder = new Recorder({
          // Recorder configuration
        });
      }

      // Start recording session
      await this.recorder.startRecording(this.mediaStream);
      
      this.isRecording = true;
      this.recordingStartTime = Date.now();
      this.startRecordingTimer();
      
      // Update UI state
      this.recordingControls.setRecordingState('recording');
      this.showFloatingControls(true);
      this.showStatusMessage('Recording started', 'success');
      
      // Apply cursor highlighting if enabled
      this.applyCursorHighlighting();
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.showStatusMessage('Failed to start recording. Please try again.', 'error');
    }
  }

  private handlePauseRecording(): void {
    if (!this.isRecording || !this.recorder) return;

    try {
      this.recorder.pauseRecording();
      this.isRecording = false;
      this.stopRecordingTimer();
      
      this.recordingControls.setRecordingState('paused');
      this.showStatusMessage('Recording paused', 'info');
      
    } catch (error) {
      console.error('Failed to pause recording:', error);
      this.showStatusMessage('Failed to pause recording.', 'error');
    }
  }

  private async handleStopRecording(): Promise<void> {
    if (!this.recorder) return;

    try {
      const recording = await this.recorder.stopRecording();
      
      this.isRecording = false;
      this.stopRecordingTimer();
      this.showFloatingControls(false);
      this.removeCursorHighlighting();
      
      // Clean up media stream
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }
      
      this.recordingControls.setRecordingState('stopped');
      this.recordingControls.setEnabled(false);
      
      this.showStatusMessage('Recording completed successfully', 'success');
      
      // Handle upload or save
      this.handleRecordingCompleted(recording);
      
    } catch (error) {
      console.error('Failed to stop recording:', error);
      this.showStatusMessage('Failed to stop recording. Data may be lost.', 'error');
    }
  }

  private handleToggleDrawing(): void {
    // Toggle drawing tools overlay
    if (this.recordingInterface.isDrawingEnabled()) {
      this.recordingInterface.disableDrawing();
    } else {
      this.recordingInterface.enableDrawing();
    }
  }

  private handleCursorSettingsChanged(settings: any): void {
    if (this.isRecording) {
      this.applyCursorHighlighting();
    }
  }

  private startRecordingTimer(): void {
    this.recordingTimer = window.setInterval(() => {
      const elapsedTime = Date.now() - this.recordingStartTime;
      this.recordingControls.updateElapsedTime(formatTime(elapsedTime));
    }, 1000);
  }

  private stopRecordingTimer(): void {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
  }

  private showFloatingControls(show: boolean): void {
    this.recordingControls.setFloatingMode(show);
  }

  private applyCursorHighlighting(): void {
    const settings = this.cursorSettings.getSettings();
    if (settings.enabled) {
      // Apply cursor highlighting based on settings
      document.body.style.cursor = `url('data:image/svg+xml;base64,${this.generateCursorSVG(settings)}'), auto`;
    }
  }

  private removeCursorHighlighting(): void {
    document.body.style.cursor = '';
  }

  private generateCursorSVG(settings: any): string {
    // Generate SVG for custom cursor based on settings
    const svg = `
      <svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="8" fill="${settings.color}" opacity="${settings.opacity}" />
        <circle cx="16" cy="16" r="12" fill="none" stroke="${settings.color}" stroke-width="2" opacity="0.6" />
      </svg>
    `;
    return btoa(svg);
  }

  private showStatusMessage(message: string, type: 'success' | 'error' | 'warning' | 'info'): void {
    // Show temporary status message
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${this.getToastStyles(type)}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 5000);
  }

  private getToastStyles(type: string): string {
    const styles = {
      success: 'bg-green-500 text-white',
      error: 'bg-red-500 text-white',
      warning: 'bg-yellow-500 text-black',
      info: 'bg-blue-500 text-white'
    };
    return styles[type] || styles.info;
  }

  private async handleRecordingCompleted(recording: any): Promise<void> {
    // Handle the completed recording (upload, save, etc.)
    console.log('Recording completed:', recording);
    
    // Reset interface to initial state
    this.screenSelector.reset();
  }

  private handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.isRecording) {
      event.preventDefault();
      event.returnValue = 'Recording is in progress. Are you sure you want to leave?';
    }
  }

  public getElement(): HTMLElement {
    // Clear and rebuild container content
    this.container.innerHTML = '';
    
    // Add main recording interface
    this.container.appendChild(this.recordingInterface.getElement());
    
    return this.container;
  }

  public destroy(): void {
    // Clean up resources
    if (this.isRecording) {
      this.handleStopRecording();
    }
    
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
    }
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    
    document.removeEventListener('keydown', this.handleKeyboardShortcuts.bind(this));
    window.removeEventListener('beforeunload', this.handleBeforeUnload.bind(this));
  }
}