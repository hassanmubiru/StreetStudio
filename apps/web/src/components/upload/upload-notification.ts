/**
 * Upload Notification Service
 * 
 * Handles background upload notifications using the browser Notification API.
 * Provides user feedback when uploads complete or fail while the tab is
 * not in focus, enabling background uploading workflows.
 * 
 * Requirements: 3.7, 3.8
 */

import { logger } from '../../app/client-logger.js';
import type { UploadItem } from '../../stores/upload-store.js';

export interface NotificationOptions {
  /** Whether to request notification permission on initialization */
  requestPermissionOnInit: boolean;
  /** Whether to show notifications when the tab is visible */
  showWhenVisible: boolean;
  /** Auto-dismiss notification after this many milliseconds (0 = no auto-dismiss) */
  autoDismissMs: number;
  /** Whether to group multiple notifications */
  groupNotifications: boolean;
  /** Maximum number of individual notifications before grouping */
  maxIndividualNotifications: number;
}

export class UploadNotificationService {
  private config: Required<NotificationOptions>;
  private permission: NotificationPermission = 'default';
  private activeNotifications: Map<string, Notification> = new Map();
  private pendingCompletions: UploadItem[] = [];
  private pendingFailures: UploadItem[] = [];
  private groupTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly DEFAULT_CONFIG: Required<NotificationOptions> = {
    requestPermissionOnInit: false,
    showWhenVisible: false,
    autoDismissMs: 5000,
    groupNotifications: true,
    maxIndividualNotifications: 3
  };

  constructor(config: Partial<NotificationOptions> = {}) {
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    this.initialize();
  }

  private initialize(): void {
    if (!this.isNotificationSupported()) {
      logger.info('Browser notifications not supported');
      return;
    }

    this.permission = Notification.permission;

    if (this.config.requestPermissionOnInit && this.permission === 'default') {
      this.requestPermission();
    }
  }

  /**
   * Check if the browser supports notifications
   */
  public isNotificationSupported(): boolean {
    return 'Notification' in window;
  }

  /**
   * Request notification permission from the user
   */
  public async requestPermission(): Promise<NotificationPermission> {
    if (!this.isNotificationSupported()) {
      return 'denied';
    }

    try {
      this.permission = await Notification.requestPermission();
      logger.info('Notification permission result', { permission: this.permission });
      return this.permission;
    } catch (error) {
      logger.warn('Failed to request notification permission', { error });
      return 'denied';
    }
  }

  /**
   * Get current notification permission status
   */
  public getPermission(): NotificationPermission {
    return this.permission;
  }

  /**
   * Check if we can show notifications
   */
  public canShowNotifications(): boolean {
    return this.isNotificationSupported() && this.permission === 'granted';
  }

  /**
   * Notify that uploads have completed successfully
   */
  public notifyUploadComplete(uploads: UploadItem[]): void {
    if (!this.shouldShowNotification()) return;

    if (this.config.groupNotifications) {
      this.pendingCompletions.push(...uploads);
      this.scheduleGroupNotification();
    } else {
      for (const upload of uploads) {
        this.showNotification(
          'Upload Complete',
          `"${this.truncateFileName(upload.file.name)}" uploaded successfully.`,
          'success',
          upload.id
        );
      }
    }
  }

  /**
   * Notify that uploads have failed
   */
  public notifyUploadFailed(uploads: UploadItem[]): void {
    if (!this.shouldShowNotification()) return;

    if (this.config.groupNotifications) {
      this.pendingFailures.push(...uploads);
      this.scheduleGroupNotification();
    } else {
      for (const upload of uploads) {
        this.showNotification(
          'Upload Failed',
          `"${this.truncateFileName(upload.file.name)}" failed to upload. ${upload.error || ''}`,
          'error',
          upload.id
        );
      }
    }
  }

  /**
   * Notify that all uploads in a batch are complete
   */
  public notifyBatchComplete(totalCount: number, failedCount: number): void {
    if (!this.shouldShowNotification()) return;

    const successCount = totalCount - failedCount;
    let body: string;

    if (failedCount === 0) {
      body = `All ${totalCount} file${totalCount !== 1 ? 's' : ''} uploaded successfully.`;
    } else {
      body = `${successCount} file${successCount !== 1 ? 's' : ''} uploaded, ${failedCount} failed.`;
    }

    this.showNotification(
      'Uploads Complete',
      body,
      failedCount > 0 ? 'warning' : 'success',
      'batch-complete'
    );
  }

  private shouldShowNotification(): boolean {
    if (!this.canShowNotifications()) return false;
    if (!this.config.showWhenVisible && document.visibilityState === 'visible') return false;
    return true;
  }

  private scheduleGroupNotification(): void {
    if (this.groupTimer) {
      clearTimeout(this.groupTimer);
    }

    // Batch notifications within a 1-second window
    this.groupTimer = setTimeout(() => {
      this.flushGroupedNotifications();
    }, 1000);
  }

  private flushGroupedNotifications(): void {
    const completions = [...this.pendingCompletions];
    const failures = [...this.pendingFailures];
    this.pendingCompletions = [];
    this.pendingFailures = [];

    // Show individual notifications if under the threshold
    if (completions.length <= this.config.maxIndividualNotifications) {
      for (const upload of completions) {
        this.showNotification(
          'Upload Complete',
          `"${this.truncateFileName(upload.file.name)}" uploaded successfully.`,
          'success',
          upload.id
        );
      }
    } else if (completions.length > 0) {
      this.showNotification(
        'Uploads Complete',
        `${completions.length} files uploaded successfully.`,
        'success',
        'group-complete'
      );
    }

    if (failures.length <= this.config.maxIndividualNotifications) {
      for (const upload of failures) {
        this.showNotification(
          'Upload Failed',
          `"${this.truncateFileName(upload.file.name)}" failed. ${upload.error || ''}`,
          'error',
          upload.id
        );
      }
    } else if (failures.length > 0) {
      this.showNotification(
        'Uploads Failed',
        `${failures.length} files failed to upload.`,
        'error',
        'group-failed'
      );
    }
  }

  private showNotification(
    title: string,
    body: string,
    type: 'success' | 'error' | 'warning' | 'info',
    id: string
  ): void {
    try {
      // Dismiss any existing notification with same id
      const existing = this.activeNotifications.get(id);
      if (existing) {
        existing.close();
      }

      const iconMap: Record<string, string> = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
      };

      const notification = new Notification(title, {
        body,
        icon: iconMap[type],
        tag: `streetstudio-upload-${id}`,
        silent: type === 'info'
      });

      this.activeNotifications.set(id, notification);

      notification.onclick = () => {
        window.focus();
        notification.close();
        this.activeNotifications.delete(id);
      };

      notification.onclose = () => {
        this.activeNotifications.delete(id);
      };

      // Auto-dismiss
      if (this.config.autoDismissMs > 0) {
        setTimeout(() => {
          notification.close();
          this.activeNotifications.delete(id);
        }, this.config.autoDismissMs);
      }
    } catch (error) {
      logger.warn('Failed to show notification', { error, title, body });
    }
  }

  private truncateFileName(name: string, maxLength = 40): string {
    if (name.length <= maxLength) return name;
    const ext = name.lastIndexOf('.');
    if (ext > 0) {
      const extension = name.slice(ext);
      const baseName = name.slice(0, ext);
      const available = maxLength - extension.length - 3;
      return baseName.slice(0, available) + '...' + extension;
    }
    return name.slice(0, maxLength - 3) + '...';
  }

  /**
   * Dismiss all active notifications
   */
  public dismissAll(): void {
    this.activeNotifications.forEach(notification => notification.close());
    this.activeNotifications.clear();
  }

  /**
   * Destroy the notification service and clean up
   */
  public destroy(): void {
    this.dismissAll();
    if (this.groupTimer) {
      clearTimeout(this.groupTimer);
      this.groupTimer = null;
    }
    this.pendingCompletions = [];
    this.pendingFailures = [];
  }
}
