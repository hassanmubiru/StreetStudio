/**
 * Quick Actions Component
 * 
 * Provides quick action buttons for starting recordings, creating projects,
 * uploading videos, and searching content.
 */

export class QuickActions {
  private element: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.render();
    this.setupEventListeners();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  private render(): void {
    this.element.innerHTML = `
      <div>
        <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Quick Actions
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button 
            id="start-recording" 
            class="group bg-blue-600 hover:bg-blue-700 focus:bg-blue-700 text-white p-4 rounded-lg text-left transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            aria-label="Start a new screen recording"
          >
            <div class="flex items-center">
              <div class="p-2 bg-blue-500 group-hover:bg-blue-600 rounded-md mr-3 transition-colors">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                </svg>
              </div>
              <div>
                <div class="font-medium">Start Recording</div>
                <div class="text-blue-100 text-sm opacity-90">Capture your screen</div>
              </div>
            </div>
          </button>
          
          <button 
            id="new-project" 
            class="group bg-green-600 hover:bg-green-700 focus:bg-green-700 text-white p-4 rounded-lg text-left transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            aria-label="Create a new project"
          >
            <div class="flex items-center">
              <div class="p-2 bg-green-500 group-hover:bg-green-600 rounded-md mr-3 transition-colors">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                </svg>
              </div>
              <div>
                <div class="font-medium">New Project</div>
                <div class="text-green-100 text-sm opacity-90">Organize your videos</div>
              </div>
            </div>
          </button>
          
          <button 
            id="upload-video" 
            class="group bg-purple-600 hover:bg-purple-700 focus:bg-purple-700 text-white p-4 rounded-lg text-left transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            aria-label="Upload a video file"
          >
            <div class="flex items-center">
              <div class="p-2 bg-purple-500 group-hover:bg-purple-600 rounded-md mr-3 transition-colors">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                </svg>
              </div>
              <div>
                <div class="font-medium">Upload Video</div>
                <div class="text-purple-100 text-sm opacity-90">Add existing files</div>
              </div>
            </div>
          </button>
          
          <button 
            id="search-videos" 
            class="group bg-gray-600 hover:bg-gray-700 focus:bg-gray-700 text-white p-4 rounded-lg text-left transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            aria-label="Search videos and projects"
          >
            <div class="flex items-center">
              <div class="p-2 bg-gray-500 group-hover:bg-gray-600 rounded-md mr-3 transition-colors">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
              </div>
              <div>
                <div class="font-medium">Search</div>
                <div class="text-gray-100 text-sm opacity-90">Find your content</div>
              </div>
            </div>
          </button>
        </div>
      </div>
    `;
  }
  private setupEventListeners(): void {
    // Start Recording
    const startRecordingBtn = this.element.querySelector('#start-recording');
    if (startRecordingBtn) {
      startRecordingBtn.addEventListener('click', () => {
        this.handleStartRecording();
      });
    }

    // New Project
    const newProjectBtn = this.element.querySelector('#new-project');
    if (newProjectBtn) {
      newProjectBtn.addEventListener('click', () => {
        this.handleNewProject();
      });
    }

    // Upload Video
    const uploadVideoBtn = this.element.querySelector('#upload-video');
    if (uploadVideoBtn) {
      uploadVideoBtn.addEventListener('click', () => {
        this.handleUploadVideo();
      });
    }

    // Search Videos
    const searchVideosBtn = this.element.querySelector('#search-videos');
    if (searchVideosBtn) {
      searchVideosBtn.addEventListener('click', () => {
        this.handleSearchVideos();
      });
    }
  }

  private handleStartRecording(): void {
    // Navigate to recording interface
    window.location.href = '/recordings/new';
  }

  private handleNewProject(): void {
    // Navigate to project creation
    window.location.href = '/projects/new';
  }

  private handleUploadVideo(): void {
    // Trigger file upload dialog or navigate to upload page
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'video/*';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    
    fileInput.addEventListener('change', (event) => {
      const files = (event.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        this.handleFileUpload(Array.from(files));
      }
    });
    
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
  }

  private handleSearchVideos(): void {
    // Navigate to search page or open search modal
    window.location.href = '/search';
  }

  private handleFileUpload(files: File[]): void {
    // Emit event for upload handling
    document.dispatchEvent(new CustomEvent('dashboard:file-upload', {
      detail: { files }
    }));
    
    // Show upload notification
    this.showNotification('Upload started', `Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`);
  }

  private showNotification(title: string, message: string): void {
    // Create a simple notification (in a real app, use the notification system)
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-blue-600 text-white px-4 py-3 rounded-lg shadow-lg z-50 transition-opacity';
    notification.innerHTML = `
      <div class="font-medium">${title}</div>
      <div class="text-sm opacity-90">${message}</div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  }
}