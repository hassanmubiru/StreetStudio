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
