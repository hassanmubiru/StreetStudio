import { RecordingController } from '../../components/recording/recording-controller.js';
import { formatDuration } from '../../utils/format-time.js';

// Create a format function for elapsed time from milliseconds
function formatTime(milliseconds: number): string {
  return formatDuration(Math.floor(milliseconds / 1000));
}

/**
 * Recordings Page Component
 * 
 * Main interface for managing recordings with integrated drawing and annotation tools.
 * Provides recording creation, management, and drawing capabilities.
 * 
 * Requirements: 3.5 - Drawing and annotation tools
 */
export class RecordingsPage {
  private container: HTMLElement;
  private recordingController?: RecordingController;

  constructor() {
    this.container = document.createElement('div');
    this.setupContainer();
    this.render();
    this.setupEventListeners();
  }

  private setupContainer(): void {
    this.container.className = 'recordings-page h-full flex flex-col';
    this.container.setAttribute('data-main-content', '');
    this.container.setAttribute('role', 'main');
    this.container.setAttribute('aria-label', 'Recording Interface');
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="recordings-header bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Recordings</h1>
            <p class="text-gray-600 dark:text-gray-400 mt-1">Capture and annotate your screen recordings</p>
          </div>
          <div class="flex items-center space-x-3">
            <button
              type="button"
              class="start-recording-btn px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium flex items-center space-x-2 transition-colors"
            >
              <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8"/>
              </svg>
              <span>Start Recording</span>
            </button>
            <button
              type="button"
              class="view-library-btn px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              View Library
            </button>
          </div>
        </div>
      </div>

      <div class="recordings-content flex-1 flex">
        <!-- Recording Interface -->
        <div class="recording-interface flex-1 relative bg-gray-100 dark:bg-gray-900 hidden">
          <div class="recording-workspace relative w-full h-full">
            <!-- Recording controls and drawing tools will be injected here -->
            <div class="recording-preview-area w-full h-full flex items-center justify-center">
              <div class="preview-placeholder text-center text-gray-500 dark:text-gray-400">
                <svg class="w-24 h-24 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p class="text-lg font-medium">Ready to Record</p>
                <p class="text-sm mt-1">Select your screen and start recording with annotation tools</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Library View -->
        <div class="recordings-library flex-1 p-6">
          <div class="library-content">
            <div class="library-header flex items-center justify-between mb-6">
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Recent Recordings</h2>
              <div class="flex items-center space-x-2">
                <button class="view-grid-btn p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
                  <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button class="view-list-btn p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
                  <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </button>
              </div>
            </div>

            <div class="recordings-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              ${this.getEmptyStateHTML()}
            </div>
          </div>
        </div>
      </div>

      <!-- Drawing Tools Help -->
      <div class="drawing-help-modal hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Drawing Tools</h3>
            <button class="close-help-btn text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <svg class="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <div class="flex items-center space-x-3">
              <kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">P</kbd>
              <span>Pen tool - Draw freehand lines</span>
            </div>
            <div class="flex items-center space-x-3">
              <kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">H</kbd>
              <span>Highlighter - Semi-transparent highlighting</span>
            </div>
            <div class="flex items-center space-x-3">
              <kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">A</kbd>
              <span>Arrow tool - Draw directional arrows</span>
            </div>
            <div class="flex items-center space-x-3">
              <kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">T</kbd>
              <span>Text tool - Add text annotations</span>
            </div>
            <div class="flex items-center space-x-3">
              <kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Esc</kbd>
              <span>Clear tool selection</span>
            </div>
            <div class="flex items-center space-x-3">
              <kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Ctrl+Z</kbd>
              <span>Undo last drawing action</span>
            </div>
            <div class="flex items-center space-x-3">
              <kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Ctrl+Y</kbd>
              <span>Redo last undone action</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private getEmptyStateHTML(): string {
    return `
      <div class="empty-state col-span-full text-center py-12">
        <svg class="w-24 h-24 mx-auto mb-4 text-gray-300 dark:text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No recordings yet</h3>
        <p class="text-gray-500 dark:text-gray-400 mb-6">Start your first recording to begin capturing and annotating your screen</p>
        <button class="start-first-recording-btn px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium flex items-center space-x-2 mx-auto transition-colors">
          <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8"/>
          </svg>
          <span>Start Your First Recording</span>
        </button>
      </div>
    `;
  }

  private setupEventListeners(): void {
    // Start recording buttons
    this.container.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest('button');
      
      if (!button) return;

      if (button.classList.contains('start-recording-btn') || 
          button.classList.contains('start-first-recording-btn')) {
        this.startRecording();
      } else if (button.classList.contains('view-library-btn')) {
        this.showLibrary();
      } else if (button.classList.contains('close-help-btn')) {
        this.hideHelpModal();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (event) => {
      if (event.key === 'F1' && this.recordingController) {
        event.preventDefault();
        this.showHelpModal();
      }
    });
  }

  private async startRecording(): Promise<void> {
    try {
      // Show recording interface
      const libraryView = this.container.querySelector('.recordings-library');
      const recordingInterface = this.container.querySelector('.recording-interface');
      
      libraryView?.classList.add('hidden');
      recordingInterface?.classList.remove('hidden');

      // Initialize recording controller if not exists
      const workspace = this.container.querySelector('.recording-workspace') as HTMLElement;
      if (workspace && !this.recordingController) {
        this.recordingController = new RecordingController(
          workspace,
          {
            enableDrawing: true,
            toolbarOptions: {
              position: 'floating',
              compact: true
            },
            persistDrawings: true,
            syncWithRecording: true
          },
          {
            onRecordingStart: (session) => {
              console.log('Recording started:', session.id);
            },
            onRecordingStop: (session) => {
              console.log('Recording stopped:', session.id);
              // Return to library view
              this.showLibrary();
            },
            onDrawingUpdate: (state) => {
              console.log('Drawing state updated:', state);
            }
          }
        );
      }

      // Start the recording
      await this.recordingController?.startRecording();

    } catch (error) {
      console.error('Failed to start recording:', error);
      this.showError('Failed to start recording. Please check your browser permissions.');
      this.showLibrary();
    }
  }

  private showLibrary(): void {
    const libraryView = this.container.querySelector('.recordings-library');
    const recordingInterface = this.container.querySelector('.recording-interface');
    
    libraryView?.classList.remove('hidden');
    recordingInterface?.classList.add('hidden');
  }

  private showHelpModal(): void {
    const modal = this.container.querySelector('.drawing-help-modal');
    modal?.classList.remove('hidden');
  }

  private hideHelpModal(): void {
    const modal = this.container.querySelector('.drawing-help-modal');
    modal?.classList.add('hidden');
  }

  private showError(message: string): void {
    // Create temporary error notification
    const error = document.createElement('div');
    error.className = 'fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50';
    error.innerHTML = `
      <div class="flex items-center">
        <svg class="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>${message}</span>
      </div>
    `;
    
    document.body.appendChild(error);
    
    setTimeout(() => {
      error.remove();
    }, 5000);
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public destroy(): void {
    this.recordingController?.destroy();
  }
}
}