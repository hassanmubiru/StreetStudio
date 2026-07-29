/**
 * Notification Delivery and Tracking
 *
 * Handles mention notification delivery, tracking read/unread state,
 * and coordinating between the comment system mentions and the notification store.
 * Provides utilities for creating mention notifications and tracking their delivery.
 *
 * Requirements: 5.7, 7.6
 */

import type { Uuid, IsoTimestamp } from '@streetstudio/shared';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Types of notifications supported by the system. */
export type NotificationType =
  | 'mention'
  | 'comment_reply'
  | 'reaction'
  | 'video_shared'
  | 'project_invite'
  | 'system';

/** Priority levels for notification delivery. */
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

/** Delivery channel for notifications. */
export type DeliveryChannel = 'in_app' | 'email' | 'push' | 'slack';

/** Represents a notification to be delivered. */
export interface NotificationPayload {
  id: Uuid;
  recipientId: Uuid;
  senderId: Uuid;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  resourceId?: Uuid;
  resourceType?: string;
  metadata?: Record<string, unknown>;
  createdAt: IsoTimestamp;
}

/** Tracks delivery state for a notification. */
export interface DeliveryRecord {
  notificationId: Uuid;
  channel: DeliveryChannel;
  status: 'pending' | 'delivered' | 'failed' | 'skipped';
  deliveredAt?: IsoTimestamp;
  error?: string;
}

/** Result of attempting to deliver a notification. */
export interface DeliveryResult {
  notificationId: Uuid;
  channels: DeliveryRecord[];
  success: boolean;
}

/** Mention context for creating mention notifications. */
export interface MentionContext {
  commentId: Uuid;
  videoId: Uuid;
  mentionedMemberId: Uuid;
  mentionerName: string;
  commentBody: string;
  timestampSeconds?: number;
}

/** Callbacks for notification delivery actions. */
export interface NotificationDeliveryCallbacks {
  onDeliver?: (payload: NotificationPayload) => Promise<DeliveryResult>;
  onMarkRead?: (notificationId: Uuid) => Promise<boolean>;
  onMarkAllRead?: () => Promise<boolean>;
  onDelete?: (notificationId: Uuid) => Promise<boolean>;
}

// --------------------------------------------------------------------------
// Utility Functions
// --------------------------------------------------------------------------

/**
 * Creates a notification payload for a mention event.
 */
export function createMentionNotification(context: MentionContext): NotificationPayload {
  const truncatedBody =
    context.commentBody.length > 100
      ? context.commentBody.substring(0, 97) + '...'
      : context.commentBody;

  return {
    id: generateId(),
    recipientId: context.mentionedMemberId,
    senderId: context.mentionedMemberId, // overridden by caller with actual sender
    type: 'mention',
    priority: 'normal',
    title: `${context.mentionerName} mentioned you`,
    message: truncatedBody,
    resourceId: context.videoId,
    resourceType: 'video',
    metadata: {
      commentId: context.commentId,
      videoId: context.videoId,
      timestampSeconds: context.timestampSeconds,
    },
    createdAt: new Date().toISOString() as IsoTimestamp,
  };
}

/**
 * Creates a notification payload for a comment reply event.
 */
export function createReplyNotification(
  recipientId: Uuid,
  replierName: string,
  commentBody: string,
  videoId: Uuid,
  commentId: Uuid
): NotificationPayload {
  const truncatedBody =
    commentBody.length > 100 ? commentBody.substring(0, 97) + '...' : commentBody;

  return {
    id: generateId(),
    recipientId,
    senderId: recipientId, // overridden by caller
    type: 'comment_reply',
    priority: 'normal',
    title: `${replierName} replied to your comment`,
    message: truncatedBody,
    resourceId: videoId,
    resourceType: 'video',
    metadata: { commentId, videoId },
    createdAt: new Date().toISOString() as IsoTimestamp,
  };
}

/**
 * Determines the delivery channels for a notification based on its priority
 * and the recipient's preferences.
 */
export function determineDeliveryChannels(
  priority: NotificationPriority,
  enabledChannels: DeliveryChannel[]
): DeliveryChannel[] {
  // Always deliver in-app
  const channels: DeliveryChannel[] = ['in_app'];

  switch (priority) {
    case 'urgent':
      // Urgent: all enabled channels
      for (const ch of enabledChannels) {
        if (!channels.includes(ch)) channels.push(ch);
      }
      break;
    case 'high':
      // High: in-app + push + email if enabled
      if (enabledChannels.includes('push')) channels.push('push');
      if (enabledChannels.includes('email')) channels.push('email');
      break;
    case 'normal':
      // Normal: in-app + push if enabled
      if (enabledChannels.includes('push')) channels.push('push');
      break;
    case 'low':
      // Low: in-app only
      break;
  }

  return channels;
}

/**
 * Formats a notification for display, producing a human-readable summary.
 */
export function formatNotificationMessage(payload: NotificationPayload): string {
  switch (payload.type) {
    case 'mention':
      return `${payload.title}: "${payload.message}"`;
    case 'comment_reply':
      return `${payload.title}: "${payload.message}"`;
    case 'reaction':
      return payload.title;
    case 'video_shared':
      return payload.title;
    case 'project_invite':
      return payload.title;
    case 'system':
      return payload.message;
    default:
      return payload.message;
  }
}

/**
 * Simple UUID-like ID generator for client-side use.
 */
function generateId(): Uuid {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// --------------------------------------------------------------------------
// NotificationDeliveryService Class
// --------------------------------------------------------------------------

/**
 * NotificationDeliveryService coordinates the delivery of notifications
 * through various channels and tracks their delivery status.
 */
export class NotificationDeliveryService {
  private callbacks: NotificationDeliveryCallbacks;
  private deliveryHistory: Map<Uuid, DeliveryResult> = new Map();
  private pendingDeliveries: NotificationPayload[] = [];
  private isProcessing = false;
  private maxRetries = 3;
  private retryDelayMs = 1000;

  constructor(callbacks: NotificationDeliveryCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Queue a notification for delivery.
   */
  public async deliver(payload: NotificationPayload): Promise<DeliveryResult> {
    if (this.callbacks.onDeliver) {
      try {
        const result = await this.callbacks.onDeliver(payload);
        this.deliveryHistory.set(payload.id, result);
        return result;
      } catch (error) {
        const failedResult: DeliveryResult = {
          notificationId: payload.id,
          channels: [
            {
              notificationId: payload.id,
              channel: 'in_app',
              status: 'failed',
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          ],
          success: false,
        };
        this.deliveryHistory.set(payload.id, failedResult);
        return failedResult;
      }
    }

    // Default: mark as delivered in-app
    const result: DeliveryResult = {
      notificationId: payload.id,
      channels: [
        {
          notificationId: payload.id,
          channel: 'in_app',
          status: 'delivered',
          deliveredAt: new Date().toISOString() as IsoTimestamp,
        },
      ],
      success: true,
    };
    this.deliveryHistory.set(payload.id, result);
    return result;
  }

  /**
   * Deliver a mention notification for the given context.
   */
  public async deliverMentionNotification(
    context: MentionContext,
    senderId: Uuid
  ): Promise<DeliveryResult> {
    const payload = createMentionNotification(context);
    payload.senderId = senderId;
    return this.deliver(payload);
  }

  /**
   * Mark a notification as read.
   */
  public async markAsRead(notificationId: Uuid): Promise<boolean> {
    if (this.callbacks.onMarkRead) {
      return this.callbacks.onMarkRead(notificationId);
    }
    return true;
  }

  /**
   * Mark all notifications as read.
   */
  public async markAllAsRead(): Promise<boolean> {
    if (this.callbacks.onMarkAllRead) {
      return this.callbacks.onMarkAllRead();
    }
    return true;
  }

  /**
   * Delete a notification.
   */
  public async deleteNotification(notificationId: Uuid): Promise<boolean> {
    if (this.callbacks.onDelete) {
      return this.callbacks.onDelete(notificationId);
    }
    this.deliveryHistory.delete(notificationId);
    return true;
  }

  /**
   * Get the delivery status of a notification.
   */
  public getDeliveryStatus(notificationId: Uuid): DeliveryResult | undefined {
    return this.deliveryHistory.get(notificationId);
  }

  /**
   * Queue a notification for background delivery (offline support).
   */
  public queueForDelivery(payload: NotificationPayload): void {
    this.pendingDeliveries.push(payload);
    this.persistQueue();
  }

  /**
   * Process any queued notifications (called when back online).
   */
  public async processQueue(): Promise<void> {
    if (this.isProcessing || this.pendingDeliveries.length === 0) return;

    this.isProcessing = true;
    const toProcess = [...this.pendingDeliveries];
    this.pendingDeliveries = [];

    for (const payload of toProcess) {
      try {
        await this.deliver(payload);
      } catch {
        // Re-queue on failure
        this.pendingDeliveries.push(payload);
      }
    }

    this.persistQueue();
    this.isProcessing = false;
  }

  /**
   * Get count of pending deliveries.
   */
  public getPendingCount(): number {
    return this.pendingDeliveries.length;
  }

  /**
   * Persist queue to localStorage for offline resilience.
   */
  private persistQueue(): void {
    try {
      localStorage.setItem(
        'streetstudio_notification_queue',
        JSON.stringify(this.pendingDeliveries)
      );
    } catch {
      // Storage may be full or unavailable
    }
  }

  /**
   * Load persisted queue from localStorage.
   */
  public loadPersistedQueue(): void {
    try {
      const stored = localStorage.getItem('streetstudio_notification_queue');
      if (stored) {
        this.pendingDeliveries = JSON.parse(stored);
      }
    } catch {
      this.pendingDeliveries = [];
    }
  }

  /**
   * Clear all delivery history and pending items.
   */
  public clear(): void {
    this.deliveryHistory.clear();
    this.pendingDeliveries = [];
    localStorage.removeItem('streetstudio_notification_queue');
  }
}
