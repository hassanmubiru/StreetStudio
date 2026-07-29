/**
 * Upload Progress Interface
 * 
 * Comprehensive upload progress visualization with individual file progress,
 * batch progress, upload speed calculation, estimated completion time,
 * background uploading support, and error handling with clear user messaging.
 * 
 * Requirements: 3.7, 3.8, 3.9
 */

import { getUploadStore, type UploadState, type UploadItem } from '../../stores/upload-store.js';
import { logger } from '../../app/client-logger.js';
import { UploadNotificationService } from './upload-notification.js';

export interface UploadProgressConfig {
  /** Whether to show individual file progress bars */
  showIndividualProgress: boolean;
  /** Whether to show batch/overall progress */
  showBatchProgress: boolean;
  /** Whether to show upload speed */
  showSpeed: boolean;
  /** Whether to show estimated completion time */
  showETA: boolean;
  /** Whether to enable background uploading with notifications */
  enableBackgroundUpload: boolean;
  /** Whether to auto-minimize when all uploads complete */
  autoMinimizeOnComplete: boolean;
  /** Maximum number of individual items to display */
  maxVisibleItems: number;
  /** Position for the floating progress panel */
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

export interface SpeedMetrics {
  /** Current speed in bytes per second */
  currentSpeed: number;
  /** Average speed across all active uploads in bytes per second */
  averageSpeed: number;
  /** Estimated time remaining in seconds for all uploads */
  estimatedTimeRemaining: number;
  /** Total bytes uploaded so far */
  totalBytesUploaded: number;
  /** Total bytes to upload across all files */
  totalBytes: number;
}

export interface UploadErrorInfo {
  uploadId: string;
  fileName: string;
  errorType: 'network' | 'server' | 'validation' | 'quota' | 'unknown';
  message: string;
  retryable: boolean;
  suggestion: string;
}

export class UploadProgressInterface {
  private container: HTMLElement;
  private config: Required<UploadProgressConfig>;
  private uploadStore = getUploadStore();
  private notificationService: UploadNotificationService;
  private unsubscribe?: () => void;
  private isMinimized = false;
  private isVisible = false;
  private speedHistory: number[] = [];
  private lastUpdateTime = 0;
  private lastBytesUploaded = 0;
  private animationFrameId?: number;
  private previousCompletedCount = 0;
  private previousFailedCount = 0;

  private readonly DEFAULT_CONFIG: Required<UploadProgressConfig> = {
    showIndividualProgress: true,
    showBatchProgress: true,
    showSpeed: true,
    showETA: true,
    enableBackgroundUpload: true,
    autoMinimizeOnComplete: true,
    maxVisibleItems: 5,
    position: 'bottom-right'
  };

  constructor(container: HTMLElement, config: Partial<UploadProgressConfig> = {}) {
    this.container = container;
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    this.notificationService = new UploadNotificationService();

    this.initialize();
  }

  private initialize(): void {
    this.render();
    this.setupStoreSubscription();
    this.startSpeedTracking();

    logger.info('Upload progress interface initialized', {
      position: this.config.position,
      backgroundUpload: this.config.enableBackgroundUpload
    });
  }

  private setupStoreSubscription(): void {
    this.unsubscribe = this.uploadStore.subscribe((state) => {
      this.handleStateUpdate(state);
    });
  }

  private handleStateUpdate(state: UploadState): void {
    const hasUploads = state.uploads.length > 0;

    // Show panel when uploads start
    if (hasUploads && !this.isVisible) {
      this.show();
    }

    // Detect newly completed uploads for background notifications
    if (this.config.enableBackgroundUpload) {
      this.checkForCompletionNotifications(state);
    }

    // Auto-minimize when all complete
    if (this.config.autoMinimizeOnComplete && !state.isUploading && hasUploads) {
      const allDone = state.uploads.every(
        u => u.status === 'completed' || u.status === 'failed' || u.status === 'cancelled'
      );
      if (allDone) {
        setTimeout(() => this.minimize(), 2000);
      }
    }

    this.updateDisplay(state);
  }

  private checkForCompletionNotifications(state: UploadState): void {
    const currentCompleted = state.completedUploads;
    const currentFailed = state.failedUploads;

    // Notify on new completions
    if (currentCompleted > this.previousCompletedCount) {
      const newlyCompleted = state.uploads.filter(
        u => u.status === 'completed'
      );
      if (newlyCompleted.length > 0 && document.visibilityState === 'hidden') {
        this.notificationService.notifyUploadComplete(newlyCompleted);
      }
    }

    // Notify on new failures
    if (currentFailed > this.previousFailedCount) {
      const newlyFailed = state.uploads.filter(u => u.status === 'failed');
      if (newlyFailed.length > 0) {
        this.notificationService.notifyUploadFailed(newlyFailed);
      }
    }

    this.previousCompletedCount = currentCompleted;
    this.previousFailedCount = currentFailed;
  }

  /**
   * Calculate current upload speed metrics across all active uploads
   */
  public calculateSpeedMetrics(state: UploadState): SpeedMetrics {
    const activeUploads = state.uploads.filter(u => u.status === 'uploading');
    const now = Date.now();

    // Calculate total bytes uploaded and total size
    let totalBytesUploaded = 0;
    let totalBytes = 0;

    for (const upload of state.uploads) {
      const fileSize = upload.file.size;
      totalBytes += fileSize;
      totalBytesUploaded += (upload.progress / 100) * fileSize;
    }

    // Calculate current speed from active uploads
    const currentSpeed = activeUploads.reduce((sum, u) => sum + u.speed, 0);

    // Track speed history for smoothing (keep last 10 samples)
    if (currentSpeed > 0) {
      this.speedHistory.push(currentSpeed);
      if (this.speedHistory.length > 10) {
        this.speedHistory.shift();
      }
    }

    // Calculate average speed (smoothed)
    const averageSpeed = this.speedHistory.length > 0
      ? this.speedHistory.reduce((sum, s) => sum + s, 0) / this.speedHistory.length
      : 0;

    // Calculate ETA based on average speed
    const remainingBytes = totalBytes - totalBytesUploaded;
    const estimatedTimeRemaining = averageSpeed > 0
      ? remainingBytes / averageSpeed
      : 0;

    this.lastUpdateTime = now;
    this.lastBytesUploaded = totalBytesUploaded;

    return {
      currentSpeed,
      averageSpeed,
      estimatedTimeRemaining,
      totalBytesUploaded,
      totalBytes
    };
  }

  /**
   * Parse upload errors into user-friendly error information
   */
  public parseUploadError(upload: UploadItem): UploadErrorInfo {
    const errorMessage = upload.error || 'An unknown error occurred';
    let errorType: UploadErrorInfo['errorType'] = 'unknown';
    let suggestion = 'Please try again later.';
    let retryable = true;

    if (errorMessage.includes('network') || errorMessage.includes('Network') || errorMessage.includes('connection')) {
      errorType = 'network';
      suggestion = 'Check your internet connection and try again.';
    } else if (errorMessage.includes('server') || errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
      errorType = 'server';
      suggestion = 'The server is temporarily unavailable. Please try again in a few moments.';
    } else if (errorMessage.includes('too large') || errorMessage.includes('validation') || errorMessage.includes('type')) {
      errorType = 'validation';
      suggestion = 'Please check the file meets the upload requirements.';
      retryable = false;
    } else if (errorMessage.includes('quota') || errorMessage.includes('storage') || errorMessage.includes('limit')) {
      errorType = 'quota';
      suggestion = 'Storage quota exceeded. Please free up space or upgrade your plan.';
      retryable = false;
    }

    return {
      uploadId: upload.id,
      fileName: upload.file.name,
      errorType,
      message: errorMessage,
      retryable,
      suggestion
    };
  }

  private startSpeedTracking(): void {
    const trackSpeed = () => {
      if (this.isVisible) {
        const state = this.uploadStore.getState();
        if (state.isUploading) {
          this.updateSpeedDisplay(state);
        }
      }
      this.animationFrameId = requestAnimationFrame(trackSpeed);
    };
    this.animationFrameId = requestAnimationFrame(trackSpeed);
  }

  private updateSpeedDisplay(state: UploadState): void {
    const metrics = this.calculateSpeedMetrics(state);
    const speedEl = this.container.querySelector('.batch-speed') as HTMLElement;
    const etaEl = this.container.querySelector('.batch-eta') as HTMLElement;

    if (speedEl && this.config.showSpeed) {
      speedEl.textContent = this.formatSpeed(metrics.averageSpeed);
    }
    if (etaEl && this.config.showETA) {
      etaEl.textContent = metrics.estimatedTimeRemaining > 0
        ? this.formatTimeRemaining(metrics.estimatedTimeRemaining)
        : 'Calculating...';
    }
  }

  private render(): void {
    const panel = document.createElement('div');
    panel.className = `upload-progress-panel ${this.config.position}`;
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Upload progress');
    panel.style.display = 'none';

    panel.innerHTML = this.buildPanelHTML();
    this.container.appendChild(panel);
    this.setupEventListeners();
  }

  private buildPanelHTML(): string {
    return `
      <div class="upload-progress-header">
        <div class="header-left">
          <span class="upload-icon" aria-hidden="true">⬆️</span>
          <span class="header-title">Uploads</span>
          <span class="upload-count" aria-live="polite"></span>
        </div>
        <div class="header-right">
          <button type="button" class="btn-minimize" aria-label="Minimize upload panel" title="Minimize">─</button>
          <button type="button" class="btn-close" aria-label="Close upload panel" title="Close">✕</button>
        </div>
      </div>

      <div class="upload-progress-body">
        ${this.config.showBatchProgress ? `
        <div class="batch-progress-section">
          <div class="batch-progress-bar">
            <div class="batch-progress-fill" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
          </div>
          <div class="batch-stats">
            <span class="batch-percentage">0%</span>
            ${this.config.showSpeed ? '<span class="batch-speed">--</span>' : ''}
            ${this.config.showETA ? '<span class="batch-eta">--</span>' : ''}
          </div>
        </div>
        ` : ''}

        <div class="upload-items-list" role="list" aria-label="Individual upload progress"></div>

        <div class="upload-errors-section" style="display: none;" role="alert" aria-live="assertive"></div>
      </div>

      <div class="upload-progress-footer">
        <button type="button" class="btn-footer btn-pause-all">Pause All</button>
        <button type="button" class="btn-footer btn-clear-done">Clear Completed</button>
      </div>
    `;
  }
