/**
 * Upload Manager Component
 * 
 * UI component for managing chunked file uploads with progress tracking,
 * resume capability, and queue management.
 */

import { uploadManager, type UploadOptions, type UploadProgress, type UploadResult } from '../../services/upload.js';
import { getUploadStore } from '../../stores/upload-store.js';
import { logger } from '../../app/client-logger.js';

export interface UploadManagerConfig {
  allowMultiple?: boolean;
  maxFileSize?: number;
  acceptedTypes?: string[];
  autoStart?: boolean;
  showProgress?: boolean;
  showQueue?: boolean;
  enableResume?: boolean;
  chunkSize?: number;
  maxConcurrent?: number;
}

export class UploadManagerComponent {
  private container: HTMLElement;
  private config: Required<UploadManagerConfig>;
  private uploadStore = getUploadStore();
  private fileInput: HTMLInputElement;
  private dropzone: HTMLElement;
  private progressContainer: HTMLElement;
  private queueContainer: HTMLElement;
  private activeUploads = new Map<string, UploadTracker>();

  private readonly DEFAULT_CONFIG: Required<UploadManagerConfig> = {
    allowMultiple: true,
    maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
    acceptedTypes: ['video/*', 'image/*'],
    autoStart: true,
    showProgress: true,
    showQueue: true,
    enableResume: true,
    chunkSize: 5 * 1024 * 1024, // 5MB
    maxConcurrent: 3
  };

  constructor(container: HTMLElement, config: UploadManagerConfig = {}) {
    this.container = container;
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    
    this.initialize();
  }

  private initialize(): void {
    this.createUI();
    this.setupEventListeners();
    this.loadResumeableUploads();
    
    // Configure the upload manager
    uploadManager.configure({
      maxConcurrentUploads: this.config.maxConcurrent,
      defaultChunkSize: this.config.chunkSize
    });
  }

  private createUI(): void {
    this.container.innerHTML = `
      <div class="upload-manager">
        <div class="upload-controls">
          <input type="file" 
                 id="file-input" 
                 ${this.config.allowMultiple ? 'multiple' : ''}
                 accept="${this.config.acceptedTypes.join(',')}"
                 style="display: none;">
          
          <div class="dropzone" id="dropzone">
            <div class="dropzone-content">
              <div class="dropzone-icon">📁</div>
              <div class="dropzone-text">
                <p class="primary">Drop files here or <button type="button" class="link-button" id="browse-button">browse</button></p>
                <p class="secondary">
                  ${this.config.allowMultiple ? 'Multiple files supported' : 'Single file only'} • 
                  Max ${this.formatFileSize(this.config.maxFileSize)} • 
                  ${this.config.acceptedTypes.join(', ')}
                </p>
              </div>
            </div>
          </div>
        </div>

        ${this.config.showProgress ? `
        <div class="progress-section" id="progress-container">
          <h3>Upload Progress</h3>
          <div class="upload-list" id="upload-list"></div>
        </div>
        ` : ''}

        ${this.config.showQueue ? `
        <div class="queue-section" id="queue-container">
          <div class="queue-header">
            <h3>Upload Queue</h3>
            <div class="queue-controls">
              <span class="queue-status" id="queue-status"></span>
              <button type="button" class="btn-secondary" id="clear-completed">Clear Completed</button>
              <button type="button" class="btn-secondary" id="pause-all">Pause All</button>
            </div>
          </div>
          <div class="queue-list" id="queue-list"></div>
        </div>
        ` : ''}

        ${this.config.enableResume ? `
        <div class="resume-section" id="resume-container">
          <h3>Resumeable Uploads</h3>
          <div class="resume-list" id="resume-list"></div>
        </div>
        ` : ''}
      </div>
    `;

    // Get element references
    this.fileInput = this.container.querySelector('#file-input') as HTMLInputElement;
    this.dropzone = this.container.querySelector('#dropzone') as HTMLElement;
    this.progressContainer = this.container.querySelector('#progress-container') as HTMLElement;
    this.queueContainer = this.container.querySelector('#queue-container') as HTMLElement;
  }

  private setupEventListeners(): void {
    // File input change
    this.fileInput.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement;
      if (target.files) {
        this.handleFiles(Array.from(target.files));
      }
    });

    // Browse button
    const browseButton = this.container.querySelector('#browse-button');
    browseButton?.addEventListener('click', () => {
      this.fileInput.click();
    });

    // Dropzone events
    this.dropzone.addEventListener('dragover', (event) => {
      event.preventDefault();
      this.dropzone.classList.add('dragover');
    });

    this.dropzone.addEventListener('dragleave', () => {
      this.dropzone.classList.remove('dragover');
    });

    this.dropzone.addEventListener('drop', (event) => {
      event.preventDefault();
      this.dropzone.classList.remove('dragover');
      
      const files = Array.from(event.dataTransfer?.files || []);
      this.handleFiles(files);
    });

    // Queue controls
    const clearCompletedBtn = this.container.querySelector('#clear-completed');
    clearCompletedBtn?.addEventListener('click', () => {
      this.uploadStore.clearCompleted();
      this.updateQueueDisplay();
    });

    const pauseAllBtn = this.container.querySelector('#pause-all');
    pauseAllBtn?.addEventListener('click', () => {
      this.uploadStore.pauseAllActiveUploads();
    });

    // Subscribe to upload store changes
    this.uploadStore.subscribe((state) => {
      this.updateQueueStatus();
      this.updateQueueDisplay();
    });
  }

  private async handleFiles(files: File[]): Promise<void> {
    // Validate files
    const validFiles = files.filter(file => this.validateFile(file));
    
    if (validFiles.length === 0) {
      return;
    }

    // Check if any files can be resumed
    const resumeableFiles: Array<{ file: File; canResume: boolean }> = validFiles.map(file => ({
      file,
      canResume: uploadManager.canResumeUpload(file)
    }));

    const filesToResume = resumeableFiles.filter(item => item.canResume);
    const newFiles = resumeableFiles.filter(item => !item.canResume);

    // Handle resumeable files
    for (const { file } of filesToResume) {
      await this.resumeUpload(file);
    }

    // Handle new files
    for (const { file } of newFiles) {
      if (this.config.autoStart) {
        await this.startUpload(file);
      } else {
        this.queueUpload(file);
      }
    }
  }

  private validateFile(file: File): boolean {
    // Check file size
    if (file.size > this.config.maxFileSize) {
      this.showError(`File "${file.name}" is too large. Maximum size is ${this.formatFileSize(this.config.maxFileSize)}`);
      return false;
    }

    // Check file type
    const isValidType = this.config.acceptedTypes.some(type => {
      if (type.endsWith('/*')) {
        return file.type.startsWith(type.slice(0, -2));
      }
      return file.type === type;
    });

    if (!isValidType) {
      this.showError(`File "${file.name}" type is not supported. Accepted types: ${this.config.acceptedTypes.join(', ')}`);
      return false;
    }

    return true;
  }

  private async startUpload(file: File): Promise<void> {
    try {
      const uploadId = crypto.randomUUID();
      const tracker = new UploadTracker(uploadId, file);
      this.activeUploads.set(uploadId, tracker);

      this.updateProgressDisplay(tracker);

      const options: UploadOptions = {
        chunkSize: this.config.chunkSize,
        enableResume: this.config.enableResume,
        onProgress: (progress) => {
          tracker.updateProgress(progress);
          this.updateProgressDisplay(tracker);
        },
        onChunkComplete: (chunkIndex, totalChunks) => {
          tracker.updateChunkProgress(chunkIndex, totalChunks);
          this.updateProgressDisplay(tracker);
        },
        onResume: (resumedChunks) => {
          tracker.markAsResumed(resumedChunks);
          this.updateProgressDisplay(tracker);
        },
        onError: (error) => {
          tracker.setError(error.message);
          this.updateProgressDisplay(tracker);
        }
      };

      const result = await uploadManager.uploadFile(file, options);
      
      tracker.setCompleted(result);
      this.updateProgressDisplay(tracker);
      this.onUploadComplete?.(result);

    } catch (error) {
      const tracker = this.activeUploads.get(uploadId!);
      if (tracker) {
        tracker.setError((error as Error).message);
        this.updateProgressDisplay(tracker);
      }
      
      logger.error('Upload failed:', error);
      this.showError(`Upload failed: ${(error as Error).message}`);
    }
  }

  private async resumeUpload(file: File): Promise<void> {
    const resumeInfo = uploadManager.getResumeInfo(file);
    if (!resumeInfo) {
      await this.startUpload(file);
      return;
    }

    logger.info(`Resuming upload: ${file.name}`, {
      completedChunks: resumeInfo.completedChunks.length,
      totalChunks: resumeInfo.chunks.length
    });

    await this.startUpload(file);
  }

  private queueUpload(file: File): void {
    // Add to upload store queue
    this.uploadStore.addUpload(file);
  }

  private updateProgressDisplay(tracker: UploadTracker): void {
    if (!this.config.showProgress) return;

    const uploadList = this.container.querySelector('#upload-list');
    if (!uploadList) return;

    let progressElement = uploadList.querySelector(`[data-upload-id="${tracker.id}"]`) as HTMLElement;
    
    if (!progressElement) {
      progressElement = document.createElement('div');
      progressElement.className = 'upload-item';
      progressElement.setAttribute('data-upload-id', tracker.id);
      uploadList.appendChild(progressElement);
    }

    const progress = tracker.progress;
    const status = tracker.status;
    
    progressElement.innerHTML = `
      <div class="upload-info">
        <div class="file-name">${tracker.fileName}</div>
        <div class="file-size">${this.formatFileSize(tracker.fileSize)}</div>
        ${tracker.resumedChunks > 0 ? `<div class="resume-info">Resumed (${tracker.resumedChunks} chunks)</div>` : ''}
      </div>
      
      <div class="upload-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress.percentage}%"></div>
        </div>
        <div class="progress-stats">
          <span class="percentage">${progress.percentage.toFixed(1)}%</span>
          <span class="speed">${this.formatSpeed(progress.speed)}</span>
          <span class="time-remaining">${this.formatTime(progress.timeRemaining)}</span>
        </div>
      </div>

      <div class="upload-status ${status.toLowerCase()}">${status}</div>

      ${status === 'error' ? `<div class="error-message">${tracker.errorMessage}</div>` : ''}
      
      <div class="upload-controls">
        ${status === 'uploading' ? `<button type="button" class="btn-small" onclick="this.cancelUpload('${tracker.id}')">Cancel</button>` : ''}
        ${status === 'error' ? `<button type="button" class="btn-small" onclick="this.retryUpload('${tracker.id}')">Retry</button>` : ''}
        ${status === 'completed' || status === 'error' ? `<button type="button" class="btn-small" onclick="this.removeUpload('${tracker.id}')">Remove</button>` : ''}
      </div>
    `;
  }

  private updateQueueStatus(): void {
    if (!this.config.showQueue) return;

    const statusElement = this.container.querySelector('#queue-status');
    if (!statusElement) return;

    const queueStatus = uploadManager.getQueueStatus();
    statusElement.textContent = `${queueStatus.active}/${queueStatus.maxConcurrent} active`;
  }

  private updateQueueDisplay(): void {
    if (!this.config.showQueue) return;

    const queueList = this.container.querySelector('#queue-list');
    if (!queueList) return;

    const uploads = this.uploadStore.getState().uploads;
    
    queueList.innerHTML = uploads.map(upload => `
      <div class="queue-item ${upload.status}" data-upload-id="${upload.id}">
        <div class="queue-info">
          <div class="file-name">${upload.file.name}</div>
          <div class="file-size">${this.formatFileSize(upload.file.size)}</div>
        </div>
        
        <div class="queue-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${upload.progress}%"></div>
          </div>
          <span class="percentage">${upload.progress.toFixed(1)}%</span>
        </div>

        <div class="queue-status">${upload.status}</div>
        
        <div class="queue-controls">
          ${upload.status === 'uploading' ? `<button type="button" onclick="uploadStore.pauseUpload('${upload.id}')">Pause</button>` : ''}
          ${upload.status === 'paused' ? `<button type="button" onclick="uploadStore.resumeUpload('${upload.id}')">Resume</button>` : ''}
          ${upload.status === 'failed' ? `<button type="button" onclick="uploadStore.retryUpload('${upload.id}')">Retry</button>` : ''}
          <button type="button" onclick="uploadStore.removeUpload('${upload.id}')">Remove</button>
        </div>
      </div>
    `).join('');
  }

  private loadResumeableUploads(): void {
    if (!this.config.enableResume) return;

    const resumeList = this.container.querySelector('#resume-list');
    if (!resumeList) return;

    const resumeableUploads = uploadManager.getResumeableUploads();
    
    if (resumeableUploads.length === 0) {
      resumeList.innerHTML = '<p class="empty-state">No resumeable uploads found</p>';
      return;
    }

    resumeList.innerHTML = resumeableUploads.map(upload => `
      <div class="resume-item" data-resume-key="${upload.resumeKey}">
        <div class="resume-info">
          <div class="file-name">${upload.fileName}</div>
          <div class="file-size">${this.formatFileSize(upload.fileSize)}</div>
          <div class="resume-progress">${upload.completedChunks}/${upload.totalChunks} chunks completed</div>
        </div>
        
        <div class="resume-controls">
          <button type="button" class="btn-primary" onclick="this.resumeFromKey('${upload.resumeKey}')">Resume</button>
          <button type="button" class="btn-secondary" onclick="this.clearResume('${upload.resumeKey}')">Clear</button>
        </div>
      </div>
    `).join('');
  }

  private showError(message: string): void {
    // Create or update error display
    let errorContainer = this.container.querySelector('.error-container') as HTMLElement;
    
    if (!errorContainer) {
      errorContainer = document.createElement('div');
      errorContainer.className = 'error-container';
      this.container.insertBefore(errorContainer, this.container.firstChild);
    }

    errorContainer.innerHTML = `
      <div class="error-message">
        <span class="error-icon">⚠️</span>
        <span class="error-text">${message}</span>
        <button type="button" class="error-close" onclick="this.parentElement.remove()">×</button>
      </div>
    `;

    // Auto-remove after 5 seconds
    setTimeout(() => {
      errorContainer.remove();
    }, 5000);
  }

  // Utility methods
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  private formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond === 0) return '0 B/s';
    return `${this.formatFileSize(bytesPerSecond)}/s`;
  }

  private formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds === 0) return '--';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  // Public API
  public onUploadComplete?: (result: UploadResult) => void;
  
  public startAllQueued(): void {
    this.uploadStore.resumeQueuedUploads();
  }

  public pauseAll(): void {
    this.uploadStore.pauseAllActiveUploads();
  }

  public clearCompleted(): void {
    this.uploadStore.clearCompleted();
  }

  public destroy(): void {
    this.activeUploads.clear();
    uploadManager.cancelAllUploads();
  }
}

/**
 * Upload tracker for individual file uploads
 */
class UploadTracker {
  public readonly id: string;
  public readonly fileName: string;
  public readonly fileSize: number;
  public progress: UploadProgress = {
    loaded: 0,
    total: 0,
    percentage: 0,
    speed: 0,
    timeRemaining: 0
  };
  public status: 'queued' | 'uploading' | 'completed' | 'error' | 'cancelled' = 'queued';
  public errorMessage?: string;
  public result?: UploadResult;
  public resumedChunks = 0;

  constructor(id: string, file: File) {
    this.id = id;
    this.fileName = file.name;
    this.fileSize = file.size;
    this.progress.total = file.size;
    this.status = 'uploading';
  }

  public updateProgress(progress: UploadProgress): void {
    this.progress = progress;
  }

  public updateChunkProgress(chunkIndex: number, totalChunks: number): void {
    // Additional chunk-specific progress handling if needed
  }

  public markAsResumed(resumedChunks: number): void {
    this.resumedChunks = resumedChunks;
  }

  public setCompleted(result: UploadResult): void {
    this.status = 'completed';
    this.result = result;
    this.progress.percentage = 100;
  }

  public setError(message: string): void {
    this.status = 'error';
    this.errorMessage = message;
  }

  public setCancelled(): void {
    this.status = 'cancelled';
  }
}

// CSS styles for the upload manager
export const UPLOAD_MANAGER_STYLES = `
.upload-manager {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  max-width: 800px;
  margin: 0 auto;
}

.upload-controls {
  margin-bottom: 2rem;
}

.dropzone {
  border: 2px dashed #cbd5e0;
  border-radius: 8px;
  padding: 3rem 2rem;
  text-align: center;
  background-color: #f7fafc;
  transition: all 0.2s ease;
  cursor: pointer;
}

.dropzone:hover,
.dropzone.dragover {
  border-color: #4299e1;
  background-color: #ebf8ff;
}

.dropzone-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.dropzone-text .primary {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #2d3748;
}

.dropzone-text .secondary {
  font-size: 0.9rem;
  color: #718096;
}

.link-button {
  background: none;
  border: none;
  color: #4299e1;
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
}

.link-button:hover {
  color: #3182ce;
}

.progress-section,
.queue-section,
.resume-section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: white;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.queue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.queue-controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.queue-status {
  font-size: 0.9rem;
  color: #718096;
  margin-right: 1rem;
}

.upload-item,
.queue-item,
.resume-item {
  padding: 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  margin-bottom: 0.5rem;
  background: #f7fafc;
}

.upload-info,
.queue-info,
.resume-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.file-name {
  font-weight: 600;
  color: #2d3748;
}

.file-size {
  font-size: 0.9rem;
  color: #718096;
}

.resume-info {
  font-size: 0.8rem;
  color: #38a169;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background-color: #e2e8f0;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.progress-fill {
  height: 100%;
  background-color: #4299e1;
  transition: width 0.3s ease;
}

.progress-stats {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: #718096;
}

.upload-status,
.queue-status {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
}

.upload-status.uploading,
.queue-item.uploading .queue-status {
  background-color: #bee3f8;
  color: #2b6cb0;
}

.upload-status.completed,
.queue-item.completed .queue-status {
  background-color: #c6f6d5;
  color: #22543d;
}

.upload-status.error,
.queue-item.failed .queue-status {
  background-color: #fed7d7;
  color: #c53030;
}

.error-container {
  margin-bottom: 1rem;
}

.error-message {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  background-color: #fed7d7;
  border: 1px solid #feb2b2;
  border-radius: 6px;
  color: #c53030;
}

.error-icon {
  margin-right: 0.5rem;
}

.error-close {
  background: none;
  border: none;
  font-size: 1.2rem;
  color: #c53030;
  cursor: pointer;
  margin-left: auto;
}

.btn-primary,
.btn-secondary,
.btn-small {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  border: 1px solid;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
}

.btn-primary {
  background-color: #4299e1;
  border-color: #4299e1;
  color: white;
}

.btn-primary:hover {
  background-color: #3182ce;
}

.btn-secondary {
  background-color: white;
  border-color: #cbd5e0;
  color: #4a5568;
}

.btn-secondary:hover {
  background-color: #f7fafc;
}

.btn-small {
  padding: 0.25rem 0.5rem;
  font-size: 0.8rem;
}

.empty-state {
  text-align: center;
  color: #718096;
  font-style: italic;
}
`;