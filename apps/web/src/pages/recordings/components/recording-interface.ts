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
  }) {
    this.screenSelector = options.screenSelector;
    this.recordingControls = options.recordingControls;
    this.cursorSettings = options.cursorSettings;
    this.container = document.createElement('div');
    this.setupContainer();
    this.buildInterface();
  }

  private setupContainer(): void {
    this.container.className = 'recording-interface h-full flex flex-col';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Recording Interface');
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

  public updateRecordingStatus(isRecording: boolean, elapsedTime?: string): void {
    const statusIndicator = this.container.querySelector('.recording-status-indicator');
    const timeElement = this.container.querySelector('#recording-time');
    
    if (statusIndicator) {
      if (isRecording) {
        statusIndicator.classList.remove('hidden');
      } else {
        statusIndicator.classList.add('hidden');
      }
    }

    if (timeElement && elapsedTime) {
      timeElement.textContent = elapsedTime;
    }
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