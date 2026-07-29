/**
 * Notification Center Page
 *
 * Full notification center with filtering, mark as read functionality,
 * notification grouping, and real-time updates. Displays notification history,
 * allows bulk operations, and provides navigation to related resources.
 *
 * Requirements: 5.7, 7.6
 */

import type { Uuid, IsoTimestamp } from '@streetstudio/shared';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Extended notification type for the notification center UI. */
export interface NotificationItem {
  id: Uuid;
  type: NotificationType;
  title: string;
  message: string;
  senderName?: string;
  senderAvatarUrl?: string;
  resourceId?: Uuid;
  resourceType?: string;
  isRead: boolean;
  createdAt: IsoTimestamp;
  metadata?: Record<string, unknown>;
}

export type NotificationType =
  | 'mention'
  | 'comment_reply'
  | 'reaction'
  | 'video_shared'
  | 'project_invite'
  | 'system';

/** Filter options for the notification center. */
export type NotificationFilter = 'all' | 'unread' | 'mentions' | 'replies' | 'system';

/** Callbacks for notification center actions. */
export interface NotificationCenterCallbacks {
  onMarkRead?: (notificationId: Uuid) => Promise<void>;
  onMarkAllRead?: () => Promise<void>;
  onDelete?: (notificationId: Uuid) => Promise<void>;
  onNavigate?: (resourceType: string, resourceId: Uuid, metadata?: Record<string, unknown>) => void;
  onLoadMore?: (offset: number) => Promise<NotificationItem[]>;
}

// --------------------------------------------------------------------------
// Utility Functions
// --------------------------------------------------------------------------

/**
 * Filters notifications by the given filter type.
 */
export function filterNotifications(
  notifications: NotificationItem[],
  filter: NotificationFilter
): NotificationItem[] {
  switch (filter) {
    case 'all':
      return notifications;
    case 'unread':
      return notifications.filter((n) => !n.isRead);
    case 'mentions':
      return notifications.filter((n) => n.type === 'mention');
    case 'replies':
      return notifications.filter((n) => n.type === 'comment_reply');
    case 'system':
      return notifications.filter((n) => n.type === 'system');
    default:
      return notifications;
  }
}

/**
 * Groups notifications by date (Today, Yesterday, This Week, Older).
 */
export function groupNotificationsByDate(
  notifications: NotificationItem[]
): Map<string, NotificationItem[]> {
  const groups = new Map<string, NotificationItem[]>();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  for (const notification of notifications) {
    const date = new Date(notification.createdAt);
    let groupKey: string;

    if (date >= today) {
      groupKey = 'Today';
    } else if (date >= yesterday) {
      groupKey = 'Yesterday';
    } else if (date >= weekAgo) {
      groupKey = 'This Week';
    } else {
      groupKey = 'Older';
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(notification);
  }

  return groups;
}

/**
 * Returns a human-readable relative time string.
 */
export function formatRelativeTime(isoTimestamp: IsoTimestamp): string {
  const date = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Gets an icon name for the notification type.
 */
export function getNotificationIcon(type: NotificationType): string {
  switch (type) {
    case 'mention':
      return '@';
    case 'comment_reply':
      return '💬';
    case 'reaction':
      return '👍';
    case 'video_shared':
      return '🎬';
    case 'project_invite':
      return '📁';
    case 'system':
      return 'ℹ️';
    default:
      return '🔔';
  }
}

// --------------------------------------------------------------------------
// NotificationsPage Class
// --------------------------------------------------------------------------

/**
 * NotificationsPage renders the full notification center with:
 * - Filter tabs (All, Unread, Mentions, Replies, System)
 * - Mark all as read button
 * - Grouped notification list with date separators
 * - Individual notification actions (mark read, delete, navigate)
 * - Infinite scroll / load more
 */
export class NotificationsPage {
  private container: HTMLElement;
  private notifications: NotificationItem[];
  private callbacks: NotificationCenterCallbacks;
  private activeFilter: NotificationFilter = 'all';
  private isLoading = false;

  constructor(
    notifications: NotificationItem[] = [],
    callbacks: NotificationCenterCallbacks = {}
  ) {
    this.notifications = notifications;
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.className = 'notification-center';
    this.container.setAttribute('data-main-content', '');
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Notification center');

    // Header
    this.container.appendChild(this.renderHeader());

    // Filter tabs
    this.container.appendChild(this.renderFilterTabs());

    // Notification list
    this.container.appendChild(this.renderNotificationList());
  }

  private renderHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'notification-center-header';

    const title = document.createElement('h1');
    title.className = 'notification-center-title';
    title.textContent = 'Notifications';
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'notification-center-actions';

    // Unread count badge
    const unreadCount = this.notifications.filter((n) => !n.isRead).length;
    if (unreadCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'notification-unread-badge';
      badge.textContent = `${unreadCount} unread`;
      badge.setAttribute('aria-label', `${unreadCount} unread notifications`);
      actions.appendChild(badge);
    }

    // Mark all as read button
    const markAllBtn = document.createElement('button');
    markAllBtn.type = 'button';
    markAllBtn.className = 'notification-mark-all-btn';
    markAllBtn.textContent = 'Mark all as read';
    markAllBtn.setAttribute('aria-label', 'Mark all notifications as read');
    markAllBtn.disabled = unreadCount === 0;
    markAllBtn.addEventListener('click', () => this.handleMarkAllRead());
    actions.appendChild(markAllBtn);

    header.appendChild(actions);
    return header;
  }

  private renderFilterTabs(): HTMLElement {
    const tabBar = document.createElement('div');
    tabBar.className = 'notification-filter-tabs';
    tabBar.setAttribute('role', 'tablist');
    tabBar.setAttribute('aria-label', 'Filter notifications');

    const filters: Array<{ value: NotificationFilter; label: string }> = [
      { value: 'all', label: 'All' },
      { value: 'unread', label: 'Unread' },
      { value: 'mentions', label: 'Mentions' },
      { value: 'replies', label: 'Replies' },
      { value: 'system', label: 'System' },
    ];

    for (const { value, label } of filters) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `notification-filter-tab${this.activeFilter === value ? ' active' : ''}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(this.activeFilter === value));
      tab.setAttribute('aria-controls', 'notification-list');
      tab.textContent = label;

      // Show count for unread tab
      if (value === 'unread') {
        const count = this.notifications.filter((n) => !n.isRead).length;
        if (count > 0) {
          tab.textContent = `${label} (${count})`;
        }
      }

      tab.addEventListener('click', () => {
        this.activeFilter = value;
        this.render();
      });
      tabBar.appendChild(tab);
    }

    return tabBar;
  }

  private renderNotificationList(): HTMLElement {
    const listContainer = document.createElement('div');
    listContainer.className = 'notification-list-container';
    listContainer.id = 'notification-list';
    listContainer.setAttribute('role', 'list');
    listContainer.setAttribute('aria-label', 'Notifications');

    const filtered = filterNotifications(this.notifications, this.activeFilter);

    if (filtered.length === 0) {
      listContainer.appendChild(this.renderEmptyState());
      return listContainer;
    }

    // Group by date
    const groups = groupNotificationsByDate(filtered);

    for (const [groupLabel, items] of groups) {
      // Date separator
      const separator = document.createElement('div');
      separator.className = 'notification-date-separator';
      separator.setAttribute('role', 'separator');
      separator.textContent = groupLabel;
      listContainer.appendChild(separator);

      // Notification items
      for (const item of items) {
        listContainer.appendChild(this.renderNotificationItem(item));
      }
    }

    // Load more button
    if (this.callbacks.onLoadMore && filtered.length >= 20) {
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.type = 'button';
      loadMoreBtn.className = 'notification-load-more-btn';
      loadMoreBtn.textContent = this.isLoading ? 'Loading...' : 'Load more';
      loadMoreBtn.disabled = this.isLoading;
      loadMoreBtn.setAttribute('aria-label', 'Load more notifications');
      loadMoreBtn.addEventListener('click', () => this.handleLoadMore());
      listContainer.appendChild(loadMoreBtn);
    }

    return listContainer;
  }

  private renderNotificationItem(item: NotificationItem): HTMLElement {
    const el = document.createElement('div');
    el.className = `notification-item${item.isRead ? '' : ' unread'}`;
    el.setAttribute('role', 'listitem');
    el.setAttribute('data-notification-id', item.id);
    el.setAttribute('aria-label', `${item.isRead ? '' : 'Unread: '}${item.title}`);

    // Icon
    const icon = document.createElement('span');
    icon.className = 'notification-item-icon';
    icon.textContent = getNotificationIcon(item.type);
    icon.setAttribute('aria-hidden', 'true');
    el.appendChild(icon);

    // Content
    const content = document.createElement('div');
    content.className = 'notification-item-content';

    const titleEl = document.createElement('div');
    titleEl.className = 'notification-item-title';
    titleEl.textContent = item.title;
    content.appendChild(titleEl);

    const messageEl = document.createElement('div');
    messageEl.className = 'notification-item-message';
    messageEl.textContent = item.message;
    content.appendChild(messageEl);

    const timeEl = document.createElement('time');
    timeEl.className = 'notification-item-time';
    timeEl.dateTime = item.createdAt;
    timeEl.textContent = formatRelativeTime(item.createdAt);
    content.appendChild(timeEl);

    el.appendChild(content);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'notification-item-actions';

    if (!item.isRead) {
      const readBtn = document.createElement('button');
      readBtn.type = 'button';
      readBtn.className = 'notification-action-btn mark-read-btn';
      readBtn.textContent = '✓';
      readBtn.setAttribute('aria-label', 'Mark as read');
      readBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleMarkRead(item.id);
      });
      actions.appendChild(readBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'notification-action-btn delete-btn';
    deleteBtn.textContent = '×';
    deleteBtn.setAttribute('aria-label', 'Delete notification');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleDelete(item.id);
    });
    actions.appendChild(deleteBtn);

    el.appendChild(actions);

    // Click to navigate to resource
    if (item.resourceId && item.resourceType) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        // Mark as read on navigate
        if (!item.isRead) {
          this.handleMarkRead(item.id);
        }
        this.callbacks.onNavigate?.(item.resourceType!, item.resourceId!, item.metadata);
      });
    }

    return el;
  }

  private renderEmptyState(): HTMLElement {
    const empty = document.createElement('div');
    empty.className = 'notification-empty-state';
    empty.setAttribute('role', 'status');

    const icon = document.createElement('span');
    icon.className = 'notification-empty-icon';
    icon.textContent = '🔔';
    icon.setAttribute('aria-hidden', 'true');
    empty.appendChild(icon);

    const text = document.createElement('p');
    text.className = 'notification-empty-text';

    switch (this.activeFilter) {
      case 'unread':
        text.textContent = 'All caught up! No unread notifications.';
        break;
      case 'mentions':
        text.textContent = 'No mention notifications yet.';
        break;
      case 'replies':
        text.textContent = 'No reply notifications yet.';
        break;
      case 'system':
        text.textContent = 'No system notifications.';
        break;
      default:
        text.textContent = 'No notifications yet. You\'ll see updates here when someone mentions you or replies to your comments.';
    }

    empty.appendChild(text);
    return empty;
  }

  private async handleMarkRead(notificationId: Uuid): Promise<void> {
    // Optimistic update
    this.notifications = this.notifications.map((n) =>
      n.id === notificationId ? { ...n, isRead: true } : n
    );
    this.render();

    try {
      await this.callbacks.onMarkRead?.(notificationId);
    } catch {
      // Revert on failure
      this.notifications = this.notifications.map((n) =>
        n.id === notificationId ? { ...n, isRead: false } : n
      );
      this.render();
    }
  }

  private async handleMarkAllRead(): Promise<void> {
    // Optimistic update
    const previousState = [...this.notifications];
    this.notifications = this.notifications.map((n) => ({ ...n, isRead: true }));
    this.render();

    try {
      await this.callbacks.onMarkAllRead?.();
    } catch {
      // Revert on failure
      this.notifications = previousState;
      this.render();
    }
  }

  private async handleDelete(notificationId: Uuid): Promise<void> {
    // Optimistic update
    const previousState = [...this.notifications];
    this.notifications = this.notifications.filter((n) => n.id !== notificationId);
    this.render();

    try {
      await this.callbacks.onDelete?.(notificationId);
    } catch {
      // Revert on failure
      this.notifications = previousState;
      this.render();
    }
  }

  private async handleLoadMore(): Promise<void> {
    if (this.isLoading || !this.callbacks.onLoadMore) return;

    this.isLoading = true;
    this.render();

    try {
      const more = await this.callbacks.onLoadMore(this.notifications.length);
      this.notifications = [...this.notifications, ...more];
    } catch {
      // Silently fail - user can retry
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  /** Update the notifications list and re-render. */
  public setNotifications(notifications: NotificationItem[]): void {
    this.notifications = notifications;
    this.render();
  }

  /** Add a single notification to the top of the list. */
  public addNotification(notification: NotificationItem): void {
    this.notifications = [notification, ...this.notifications];
    this.render();
  }

  /** Get the current filter. */
  public getActiveFilter(): NotificationFilter {
    return this.activeFilter;
  }

  /** Get the unread count. */
  public getUnreadCount(): number {
    return this.notifications.filter((n) => !n.isRead).length;
  }

  public getElement(): HTMLElement {
    return this.container;
  }
}
