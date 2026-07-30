/**
 * Notification Delivery System
 *
 * Handles notification delivery with:
 * - Rate limiting (configurable max notifications per window)
 * - Notification grouping and batching
 * - Priority levels (critical, high, normal, low)
 * - Deduplication
 * - Queue management with overflow protection
 *
 * Requirements: 7.2, 7.9, 7.10
 */

export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';

export interface DeliveryNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  priority: NotificationPriority;
  groupKey?: string;
  timestamp: number;
  data?: Record<string, unknown>;
  /** If true, notification will not be grouped with others */
  ungroupable?: boolean;
}

export interface NotificationDeliveryOptions {
  /** Max notifications delivered per rate-limit window (default: 10) */
  maxPerWindow?: number;
  /** Rate-limit window in ms (default: 60000 = 1 minute) */
  windowDuration?: number;
  /** Maximum queue size before dropping low-priority notifications (default: 100) */
  maxQueueSize?: number;
  /** Batch delivery interval in ms for grouped notifications (default: 3000) */
  batchInterval?: number;
  /** Handler called when a notification (or batch) is delivered */
  onDeliver?: (notifications: DeliveryNotification[]) => void;
  /** Handler called when notifications are dropped due to rate-limiting */
  onDrop?: (notifications: DeliveryNotification[], reason: string) => void;
}

interface RateLimitWindow {
  startTime: number;
  count: number;
}

interface BatchGroup {
  groupKey: string;
  notifications: DeliveryNotification[];
  timer: ReturnType<typeof setTimeout> | null;
}

const DEFAULT_OPTIONS: Required<Omit<NotificationDeliveryOptions, 'onDeliver' | 'onDrop'>> = {
  maxPerWindow: 10,
  windowDuration: 60000,
  maxQueueSize: 100,
  batchInterval: 3000,
};

/**
 * Manages notification delivery with rate limiting, batching, and priority queuing.
 */
export class NotificationDeliveryService {
  private options: Required<Omit<NotificationDeliveryOptions, 'onDeliver' | 'onDrop'>> & {
    onDeliver?: (notifications: DeliveryNotification[]) => void;
    onDrop?: (notifications: DeliveryNotification[], reason: string) => void;
  };
  private queue: DeliveryNotification[] = [];
  private rateLimitWindow: RateLimitWindow = { startTime: Date.now(), count: 0 };
  private batchGroups = new Map<string, BatchGroup>();
  private deliveredIds = new Set<string>();
  private deliveryTimer: ReturnType<typeof setInterval> | null = null;
  private paused = false;

  constructor(options: NotificationDeliveryOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.startDeliveryLoop();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Enqueue a notification for delivery. Respects rate limits,
   * deduplication, grouping, and priority ordering.
   */
  public enqueue(notification: DeliveryNotification): void {
    // Deduplication check
    if (this.deliveredIds.has(notification.id)) {
      return;
    }

    // Queue overflow protection — drop low-priority items
    if (this.queue.length >= this.options.maxQueueSize) {
      this.evictLowestPriority();
    }

    // If notification belongs to a group and is groupable, batch it
    if (notification.groupKey && !notification.ungroupable) {
      this.addToBatch(notification);
      return;
    }

    // Insert into queue sorted by priority
    this.insertByPriority(notification);
    this.processQueue();
  }

  /**
   * Pause notification delivery (queuing continues).
   */
  public pause(): void {
    this.paused = true;
  }

  /**
   * Resume notification delivery and flush queue.
   */
  public resume(): void {
    this.paused = false;
    this.processQueue();
  }

  /**
   * Get current queue length.
   */
  public getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get remaining delivery capacity in the current rate-limit window.
   */
  public getRemainingCapacity(): number {
    this.refreshRateLimitWindow();
    return Math.max(0, this.options.maxPerWindow - this.rateLimitWindow.count);
  }

  /**
   * Check if delivery is currently rate-limited.
   */
  public isRateLimited(): boolean {
    return this.getRemainingCapacity() === 0;
  }

  /**
   * Clear all queued notifications and batch groups.
   */
  public clear(): void {
    this.queue = [];
    for (const group of this.batchGroups.values()) {
      if (group.timer) clearTimeout(group.timer);
    }
    this.batchGroups.clear();
  }

  /**
   * Destroy the delivery service and clean up resources.
   */
  public destroy(): void {
    this.clear();
    if (this.deliveryTimer) {
      clearInterval(this.deliveryTimer);
      this.deliveryTimer = null;
    }
    this.deliveredIds.clear();
  }

  // -------------------------------------------------------------------------
  // Private: Queue Management
  // -------------------------------------------------------------------------

  private insertByPriority(notification: DeliveryNotification): void {
    const priority = getPriorityWeight(notification.priority);
    let insertIndex = this.queue.length;

    for (let i = 0; i < this.queue.length; i++) {
      if (getPriorityWeight(this.queue[i].priority) < priority) {
        insertIndex = i;
        break;
      }
    }

    this.queue.splice(insertIndex, 0, notification);
  }

  private evictLowestPriority(): void {
    // Remove the lowest-priority item from the end
    const evicted = this.queue.pop();
    if (evicted) {
      this.options.onDrop?.([evicted], 'queue_overflow');
    }
  }

  private processQueue(): void {
    if (this.paused || this.queue.length === 0) return;

    this.refreshRateLimitWindow();

    while (this.queue.length > 0 && this.rateLimitWindow.count < this.options.maxPerWindow) {
      const notification = this.queue.shift()!;
      this.deliver([notification]);
    }
  }

  // -------------------------------------------------------------------------
  // Private: Batching / Grouping
  // -------------------------------------------------------------------------

  private addToBatch(notification: DeliveryNotification): void {
    const key = notification.groupKey!;

    if (!this.batchGroups.has(key)) {
      const group: BatchGroup = {
        groupKey: key,
        notifications: [],
        timer: null,
      };
      this.batchGroups.set(key, group);
    }

    const group = this.batchGroups.get(key)!;
    group.notifications.push(notification);

    // Reset the batch timer to coalesce rapid notifications
    if (group.timer) clearTimeout(group.timer);
    group.timer = setTimeout(() => {
      this.flushBatchGroup(key);
    }, this.options.batchInterval);
  }

  private flushBatchGroup(groupKey: string): void {
    const group = this.batchGroups.get(groupKey);
    if (!group || group.notifications.length === 0) return;

    this.batchGroups.delete(groupKey);

    // Check rate limit
    this.refreshRateLimitWindow();
    if (this.rateLimitWindow.count >= this.options.maxPerWindow) {
      // Queue as single grouped delivery for later
      const representative = group.notifications[0];
      this.insertByPriority({
        ...representative,
        body: `${group.notifications.length} notifications`,
        ungroupable: true,
      });
      this.options.onDrop?.(group.notifications.slice(1), 'rate_limited_batch');
      return;
    }

    this.deliver(group.notifications);
  }

  // -------------------------------------------------------------------------
  // Private: Delivery
  // -------------------------------------------------------------------------

  private deliver(notifications: DeliveryNotification[]): void {
    // Track delivered IDs for deduplication
    for (const n of notifications) {
      this.deliveredIds.add(n.id);
    }

    // Prevent unbounded growth of delivered IDs set
    if (this.deliveredIds.size > 1000) {
      const entries = [...this.deliveredIds];
      this.deliveredIds = new Set(entries.slice(entries.length - 500));
    }

    this.rateLimitWindow.count++;
    this.options.onDeliver?.(notifications);
  }

  // -------------------------------------------------------------------------
  // Private: Rate Limiting
  // -------------------------------------------------------------------------

  private refreshRateLimitWindow(): void {
    const now = Date.now();
    if (now - this.rateLimitWindow.startTime >= this.options.windowDuration) {
      this.rateLimitWindow = { startTime: now, count: 0 };
    }
  }

  // -------------------------------------------------------------------------
  // Private: Background Processing
  // -------------------------------------------------------------------------

  private startDeliveryLoop(): void {
    // Periodically attempt to drain the queue (handles rate-limit window resets)
    this.deliveryTimer = setInterval(() => {
      this.processQueue();
    }, 5000);
  }
}

// -------------------------------------------------------------------------
// Utilities
// -------------------------------------------------------------------------

function getPriorityWeight(priority: NotificationPriority): number {
  switch (priority) {
    case 'critical': return 4;
    case 'high': return 3;
    case 'normal': return 2;
    case 'low': return 1;
  }
}
