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
