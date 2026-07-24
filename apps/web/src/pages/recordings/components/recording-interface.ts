import { ScreenSelector } from './screen-selector.js';
import { RecordingControls } from './recording-controls.js';
import { CursorSettings } from './cursor-settings.js';
import { RecordingStateManager } from '../../../components/recording/recording-state-manager.js';
import { KeyboardShortcuts } from '../../../app/keyboard-shortcuts.js';
import { createRecordingStore, getRecordingStore, type RecordingState, type RecordingSession } from '../../../stores/recording-store.js';
import { logger } from '../../../app/client-logger.js';

/**
 * Main Recording Interface Component
 * Orchestrates the complete browser recording experience with all sub-components
 */
export class RecordingInterface {
  private container: HTMLElement;
  private screenSelector: ScreenSelector;
  private recordingControls: RecordingControls;
  private cursorSettings: CursorSettings;
  private recordingStateManager: RecordingStateManager;
  private keyboardShortcuts: KeyboardShortcuts;
  private drawingEnabled = false;
  private currentState: RecordingState = 'idle';

  constructor(options: {
    screenSelector: ScreenSelector;
    recordingControls: RecordingControls;
    cursorSettings: CursorSettings;
    keyboardShortcuts: KeyboardShortcuts;
  }) {
    this.screenSelector = options.screenSelector;
    this.recordingControls = options.recordingControls;
    this.cursorSettings = options.cursorSettings;
    this.keyboardShortcuts = options.keyboardShortcuts;
    
    this.container = document.createElement('div');
    this.setupContainer();
    this.buildInterface();
    this.initializeRecordingSystem();
  }

  private setupContainer(): void {
    this.container.className = 'recording-interface h-full flex flex-col';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Recording Interface');
    this.container.setAttribute('data-keyboard-context', 'recordings');
  }

  /**
   * Initialize the recording system
   */
  private async initializeRecordingSystem(): Promise<void> {
    try {
      // Initialize recording store
      createRecordingStore();
      
      // Initialize recording state manager
      this.recordingStateManager = new RecordingStateManager(
        this.keyboardShortcuts,
        {
          enableKeyboardShortcuts: true,
          enableSessionRecovery: true,
          enablePermissionGuidance: true,
          autoSaveInterval: 5
        },
        {
          onStateChange: (state, session) => this.handleStateChange(state, session),
          onPermissionDenied: (error, guidance) => this.handlePermissionDenied(error, guidance),
          onSessionRecovered: (session) => this.handleSessionRecovered(session),
          onRecordingComplete: (session) => this.handleRecordingComplete(session),
          onError: (error, session) => this.handleError(error, session)
        }
      );

      // Initialize the state manager
      const initialized = await this.recordingStateManager.initialize();
      if (!initialized) {
        throw new Error('Failed to initialize recording state manager');
      }

      // Set keyboard context
      this.keyboardShortcuts.setContext('recordings');

      // Setup control event handlers
      this.setupControlEventHandlers();

      logger.info('Recording interface initialized successfully');

    } catch (error) {
      logger.error('Recording interface initialization failed', { error });
      this.showError('Failed to initialize recording system. Please refresh the page.');
    }
  }

  /**
   * Setup control event handlers
   */
  private setupControlEventHandlers(): void {
    // Update recording controls with proper callbacks
    this.recordingControls = new RecordingControls({
      onRecord: () => this.handleRecordAction(),
      onPause: () => this.handlePauseAction(),
      onStop: () => this.handleStopAction(),
      onToggleDrawing: () => this.toggleDrawing()
    });

    // Update the interface with new controls
    const controlsContainer = this.container.querySelector('.recording-preview-panel .preview-content');
    if (controlsContainer) {
      controlsContainer.innerHTML = '';
      controlsContainer.appendChild(this.recordingControls.getElement());
    }
  }

  /**
   * Handle record action
   */
  private async handleRecordAction(): Promise<void> {
    if (this.currentState === 'paused') {
      this.recordingStateManager.resumeRecording();
    } else {
      // Get selected screen from screen selector if available
      const selectedSource = this.screenSelector.getSelectedSource();
      
      const metadata = {
        title: `Screen Recording ${new Date().toLocaleString()}`,
        description: 'Screen recording created with StreetStudio'
      };

      await this.recordingStateManager.startRecording(metadata);
    }
  }

  /**
   * Handle pause action
   */
  private handlePauseAction(): void {
    this.recordingStateManager.pauseRecording();
  }

  /**
   * Handle stop action
   */
  private handleStopAction(): void {
    this.recordingStateManager.stopRecording();
  }

  /**
   * Handle recording state changes
   */
  private handleStateChange(state: RecordingState, session?: RecordingSession): void {
    this.currentState = state;
    
    // Update UI based on state
    this.updateRecordingUI(state, session);
    
    // Update controls state
    this.updateControlsState(state);
    
    // Handle state-specific logic
    switch (state) {
      case 'recording':
        this.recordingControls.setFloatingMode(true);
        this.startDurationDisplay(session);
        break;
        
      case 'paused':
        this.showPausedIndicator();
        break;
        
      case 'stopped':
        this.recordingControls.setFloatingMode(false);
        this.showCompletedState(session);
        break;
        
      case 'error':
        this.recordingControls.setFloatingMode(false);
        if (session?.error) {
          this.showError(session.error);
        }
        break;
    }
  }

  /**
   * Handle permission denied
   */
  private handlePermissionDenied(error: string, guidance: string): void {
    this.showPermissionHelp(error, guidance);
  }

  /**
   * Handle session recovered
   */
  private handleSessionRecovered(session: RecordingSession): void {
    this.showSessionRecoveryNotification(session);
  }

  /**
   * Handle recording complete
   */
  private handleRecordingComplete(session: RecordingSession): void {
    this.showRecordingComplete(session);
  }

  /**
   * Handle errors
   */
  private handleError(error: string, session?: RecordingSession): void {
    this.showError(error);
    logger.error('Recording error', { error, sessionId: session?.id });
  }

  /**
   * Update recording UI based on state
   */
  private updateRecordingUI(state: RecordingState, session?: RecordingSession): void {
    const statusIndicator = this.container.querySelector('.recording-status-indicator');
    const timeElement = this.container.querySelector('#recording-time');
    
    if (statusIndicator) {
      if (state === 'recording' || state === 'paused') {
        statusIndicator.classList.remove('hidden');
      } else {
        statusIndicator.classList.add('hidden');
      }
    }

    if (timeElement && session) {
      const formattedDuration = this.recordingStateManager.getFormattedDuration();
      timeElement.textContent = formattedDuration;
    }
  }

  /**
   * Update controls state
   */
  private updateControlsState(state: RecordingState): void {
    switch (state) {
      case 'idle':
      case 'stopped':
        this.recordingControls.setRecordingState('stopped');
        this.recordingControls.setEnabled(true);
        break;
        
      case 'recording':
        this.recordingControls.setRecordingState('recording');
        this.recordingControls.setEnabled(true);
        break;
        
      case 'paused':
        this.recordingControls.setRecordingState('paused');
        this.recordingControls.setEnabled(true);
        break;
        
      case 'requesting-permission':
      case 'permission-granted':
        this.recordingControls.setEnabled(false);
        break;
        
      case 'error':
        this.recordingControls.setRecordingState('stopped');
        this.recordingControls.setEnabled(true);
        break;
    }
  }

  /**
   * Start duration display updates
   */
  private startDurationDisplay(session?: RecordingSession): void {
    const updateDuration = () => {
      if (this.recordingStateManager.isRecording()) {
        const formattedTime = this.recordingStateManager.getFormattedDuration();
        this.recordingControls.updateElapsedTime(formattedTime);
        requestAnimationFrame(updateDuration);
      }
    };
    
    requestAnimationFrame(updateDuration);
  }

  /**
   * Show paused indicator
   */
  private showPausedIndicator(): void {
    const notification = this.createNotification(
      'Recording Paused',
      'Your screen recording is paused. Click Resume to continue.',
      'warning'
    );
    this.showNotification(notification);
  }

  /**
   * Show completed state
   */
  private showCompletedState(session?: RecordingSession): void {
    if (session && session.recordedChunks.length > 0) {
      const notification = this.createNotification(
        'Recording Complete',
        `Recording saved with ${session.recordedChunks.length} segments. Duration: ${this.recordingStateManager.getFormattedDuration()}`,
        'success'
      );
      this.showNotification(notification);
    }
  }

  /**
   * Show permission help
   */
  private showPermissionHelp(error: string, guidance: string): void {
    const helpElement = document.createElement('div');
    helpElement.className = 'permission-help bg-blue-50 border border-blue-200 rounded-lg p-6 mx-6 my-4';
    
    helpElement.innerHTML = `
      <div class="flex">
        <div class="flex-shrink-0">
          <svg class="h-6 w-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <div class="ml-3">
          <h3 class="text-lg font-medium text-blue-900">
            Screen Recording Permission Needed
          </h3>
          <div class="mt-2 text-sm text-blue-700">
            <p>${error}</p>
            <div class="mt-3 whitespace-pre-line">${guidance}</div>
          </div>
          <div class="mt-4">
            <button 
              type="button"
              class="bg-blue-100 hover:bg-blue-200 text-blue-800 px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              onclick="this.closest('.permission-help').remove()"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    `;

    // Insert after header
    const header = this.container.querySelector('.recording-header');
    if (header && header.nextSibling) {
      header.parentNode?.insertBefore(helpElement, header.nextSibling);
    }
  }

  /**
   * Show session recovery notification
   */
  private showSessionRecoveryNotification(session: RecordingSession): void {
    const notification = this.createNotification(
      'Session Recovered',
      `Found an interrupted recording session from ${new Date(session.lastActivity).toLocaleString()}. The recording data may have been lost.`,
      'warning'
    );
    this.showNotification(notification);
  }

  /**
   * Show recording complete notification
   */
  private showRecordingComplete(session: RecordingSession): void {
    const duration = this.recordingStateManager.getFormattedDuration();
    const notification = this.createNotification(
      'Recording Complete!',
      `Screen recording finished successfully. Duration: ${duration}. The recording has been saved to your library.`,
      'success'
    );
    this.showNotification(notification);
  }

  /**
   * Show error message
   */
  private showError(error: string): void {
    const notification = this.createNotification(
      'Recording Error',
      error,
      'error'
    );
    this.showNotification(notification);
  }

  /**
   * Create notification element
   */
  private createNotification(title: string, message: string, type: 'success' | 'warning' | 'error' | 'info'): HTMLElement {
    const colorClasses = {
      success: 'bg-green-50 border-green-200 text-green-800',
      warning: 'bg-yellow-50 border-yellow-200 text-yellow-800', 
      error: 'bg-red-50 border-red-200 text-red-800',
      info: 'bg-blue-50 border-blue-200 text-blue-800'
    };

    const iconSvgs = {
      success: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>',
      warning: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z"></path>',
      error: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>',
      info: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>'
    };

    const notification = document.createElement('div');
    notification.className = `notification border rounded-lg p-4 mb-4 ${colorClasses[type]}`;
    notification.setAttribute('role', 'alert');
    
    notification.innerHTML = `
      <div class="flex">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            ${iconSvgs[type]}
          </svg>
        </div>
        <div class="ml-3">
          <h3 class="text-sm font-medium">${title}</h3>
          <div class="mt-1 text-sm">${message}</div>
        </div>
        <div class="ml-auto pl-3">
          <button 
            type="button"
            class="inline-flex rounded-md p-1.5 hover:bg-opacity-20 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2"
            onclick="this.closest('.notification').remove()"
            aria-label="Close notification"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      </div>
    `;

    return notification;
  }

  /**
   * Show notification in the interface
   */
  private showNotification(notification: HTMLElement): void {
    const container = this.container.querySelector('.recording-main');
    if (container) {
      // Insert at the top of main content
      container.insertBefore(notification, container.firstChild);
      
      // Auto-remove after 10 seconds
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 10000);
    }
  }

  private buildInterface(): void {
    // Header section
    const header = this.createHeader();
    this.container.appendChild(header);

    // Main content area
    const mainContent = this.createMainContent();
    this.container.appendChild(mainContent);

    // Settings panel (collapsible)
    const settingsPanel = this.createSettingsPanel();
    this.container.appendChild(settingsPanel);
  }

  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'recording-header bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4';
    
    header.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            Screen Recording
          </h1>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Select a screen source and configure your recording preferences
          </p>
        </div>
        <div class="flex items-center space-x-3">
          <button 
            id="settings-toggle" 
            class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md"
            aria-label="Toggle settings panel"
            title="Settings"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
            </svg>
          </button>
          <div class="recording-status-indicator hidden">
            <div class="flex items-center space-x-2 px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-full text-sm">
              <div class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              <span class="font-medium">REC</span>
              <span id="recording-time" class="font-mono">00:00</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Setup settings toggle
    const settingsToggle = header.querySelector('#settings-toggle');
    settingsToggle?.addEventListener('click', this.toggleSettingsPanel.bind(this));

    return header;
  }

  private createMainContent(): HTMLElement {
    const mainContent = document.createElement('div');
    mainContent.className = 'recording-main flex-1 flex';

    // Left panel - Screen selection
    const leftPanel = document.createElement('div');
    leftPanel.className = 'screen-selection-panel flex-1 p-6 bg-gray-50 dark:bg-gray-900';
    leftPanel.appendChild(this.screenSelector.getElement());

    // Right panel - Preview (when available)
    const rightPanel = document.createElement('div');
    rightPanel.className = 'recording-preview-panel w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700';
    rightPanel.appendChild(this.createPreviewPanel());

    mainContent.appendChild(leftPanel);
    mainContent.appendChild(rightPanel);

    return mainContent;
  }

  private createPreviewPanel(): HTMLElement {
    const previewPanel = document.createElement('div');
    previewPanel.className = 'h-full flex flex-col';
    
    previewPanel.innerHTML = `
      <div class="preview-header p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Preview</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Selected screen will appear here
        </p>
      </div>
      <div class="preview-content flex-1 p-4 flex items-center justify-center">
        <div class="preview-placeholder text-center">
          <div class="w-16 h-16 mx-auto bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center mb-3">
            <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
            </svg>
          </div>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            No screen selected
          </p>
        </div>
      </div>
    `;

    return previewPanel;
  }

  private createSettingsPanel(): HTMLElement {
    const settingsPanel = document.createElement('div');
    settingsPanel.className = 'settings-panel bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 hidden';
    settingsPanel.id = 'settings-panel';

    const settingsContent = document.createElement('div');
    settingsContent.className = 'p-6';
    
    // Add cursor settings component
    const cursorSection = document.createElement('div');
    cursorSection.className = 'mb-6';
    cursorSection.innerHTML = `
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Cursor & Highlighting
      </h3>
    `;
    cursorSection.appendChild(this.cursorSettings.getElement());

    settingsContent.appendChild(cursorSection);

    // Add recording quality settings
    const qualitySection = document.createElement('div');
    qualitySection.className = 'mb-6';
    qualitySection.innerHTML = `
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Recording Quality
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Resolution
          </label>
          <select class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            <option value="1920x1080">1920×1080 (Full HD)</option>
            <option value="1366x768">1366×768 (HD)</option>
            <option value="1280x720">1280×720 (HD)</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Frame Rate
          </label>
          <select class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            <option value="30">30 FPS</option>
            <option value="60">60 FPS</option>
            <option value="24">24 FPS</option>
          </select>
        </div>
      </div>
    `;

    settingsContent.appendChild(qualitySection);
    settingsPanel.appendChild(settingsContent);

    return settingsPanel;
  }

  private toggleSettingsPanel(): void {
    const settingsPanel = document.getElementById('settings-panel');
    if (settingsPanel) {
      settingsPanel.classList.toggle('hidden');
    }
  }

  public isDrawingEnabled(): boolean {
    return this.drawingEnabled;
  }

  public enableDrawing(): void {
    this.drawingEnabled = true;
    // Add drawing overlay implementation here
  }

  public disableDrawing(): void {
    this.drawingEnabled = false;
    // Remove drawing overlay implementation here
  }

  /**
   * Toggle drawing tools
   */
  private toggleDrawing(): void {
    if (this.drawingEnabled) {
      this.disableDrawing();
    } else {
      this.enableDrawing();
    }
  }

  public updateRecordingStatus(isRecording: boolean, elapsedTime?: string): void {
    // This method is now handled by the state manager
    // Update the UI through the state change handler
  }

  public showPreview(stream: MediaStream): void {
    const previewContent = this.container.querySelector('.preview-content');
    if (previewContent) {
      // Clear placeholder
      previewContent.innerHTML = '';
      
      // Create video element for preview
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      video.className = 'w-full h-full object-contain bg-black rounded-lg';
      video.setAttribute('aria-label', 'Screen capture preview');
      
      previewContent.appendChild(video);
    }
  }

  public getElement(): HTMLElement {
    return this.container;
  }
}