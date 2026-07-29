/**
 * Unit tests for Mention Autocomplete, Notification Delivery,
 * Notification Preferences, and Notification Center.
 *
 * Requirements: 5.7, 7.6
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  extractMentionQuery,
  insertMentionIntoText,
  filterCandidates,
  extractMentionsFromText,
  MentionAutocomplete,
} from './mention-autocomplete';
import type { MentionCandidate } from './mention-autocomplete';
import {
  createMentionNotification,
  createReplyNotification,
  determineDeliveryChannels,
  formatNotificationMessage,
  NotificationDeliveryService,
} from './notification-delivery';
import type { MentionContext, DeliveryResult } from './notification-delivery';
import {
  createDefaultPreferences,
  getPreference,
  updatePreference,
  toggleCategory,
  toggleChannel,
  shouldDeliverNotification,
  isInQuietHours,
  getEnabledChannelCount,
  NotificationPreferencesPanel,
} from './notification-preferences';
import {
  filterNotifications,
  groupNotificationsByDate,
  formatRelativeTime,
  getNotificationIcon,
  NotificationsPage,
} from '../../pages/notifications/notifications-page';
import type { NotificationItem } from '../../pages/notifications/notifications-page';

// --------------------------------------------------------------------------
// Test helpers
// --------------------------------------------------------------------------

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

const mockMembers: MentionCandidate[] = [
  { id: 'u1', displayName: 'Alice Johnson', email: 'alice@example.com' },
  { id: 'u2', displayName: 'Bob Smith', email: 'bob@example.com' },
  { id: 'u3', displayName: 'Charlie Brown', email: 'charlie@example.com' },
  { id: 'u4', displayName: 'Alice Williams', email: 'alice.w@example.com' },
];

function makeNotification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 'notif-1',
    type: 'mention',
    title: 'Alice mentioned you',
    message: 'Hey @user check this out',
    isRead: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// --------------------------------------------------------------------------
// extractMentionQuery
// --------------------------------------------------------------------------

describe('extractMentionQuery', () => {
  it('extracts query after @ at start of text', () => {
    const result = extractMentionQuery('@ali', 4);
    expect(result).toEqual({ query: 'ali', triggerIndex: 0 });
  });

  it('extracts query after @ preceded by space', () => {
    const result = extractMentionQuery('hello @bob', 10);
    expect(result).toEqual({ query: 'bob', triggerIndex: 6 });
  });

  it('returns null when no @ trigger is active', () => {
    const result = extractMentionQuery('hello world', 11);
    expect(result).toBeNull();
  });

  it('returns null for cursor at position 0', () => {
    const result = extractMentionQuery('@test', 0);
    expect(result).toBeNull();
  });

  it('handles empty query after @', () => {
    const result = extractMentionQuery('hey @', 5);
    expect(result).toEqual({ query: '', triggerIndex: 4 });
  });
});

// --------------------------------------------------------------------------
// insertMentionIntoText
// --------------------------------------------------------------------------

describe('insertMentionIntoText', () => {
  it('replaces @query with full mention', () => {
    const result = insertMentionIntoText('hello @ali', 10, mockMembers[0]);
    expect(result.text).toBe('hello @Alice Johnson ');
    expect(result.member).toBe(mockMembers[0]);
  });

  it('preserves text after cursor', () => {
    const result = insertMentionIntoText('hi @bo and more', 6, mockMembers[1]);
    expect(result.text).toBe('hi @Bob Smith  and more');
  });

  it('returns correct cursor position after insertion', () => {
    const result = insertMentionIntoText('@ali', 4, mockMembers[0]);
    expect(result.cursorPosition).toBe('@Alice Johnson '.length);
  });
});

// --------------------------------------------------------------------------
// filterCandidates
// --------------------------------------------------------------------------

describe('filterCandidates', () => {
  it('filters by display name (case-insensitive)', () => {
    const results = filterCandidates(mockMembers, 'alice', 10);
    expect(results.length).toBe(2);
    expect(results[0].displayName).toBe('Alice Johnson');
    expect(results[1].displayName).toBe('Alice Williams');
  });

  it('filters by email', () => {
    const results = filterCandidates(mockMembers, 'bob@', 10);
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('u2');
  });

  it('returns all candidates with empty query', () => {
    const results = filterCandidates(mockMembers, '', 10);
    expect(results.length).toBe(4);
  });

  it('limits results to maxResults', () => {
    const results = filterCandidates(mockMembers, '', 2);
    expect(results.length).toBe(2);
  });

  it('returns empty array when no matches', () => {
    const results = filterCandidates(mockMembers, 'zzz', 10);
    expect(results.length).toBe(0);
  });
});

// --------------------------------------------------------------------------
// extractMentionsFromText
// --------------------------------------------------------------------------

describe('extractMentionsFromText', () => {
  it('extracts single mention', () => {
    const mentions = extractMentionsFromText('hey @Alice check this');
    expect(mentions).toContain('Alice');
  });

  it('extracts multiple mentions', () => {
    const mentions = extractMentionsFromText('@Alice and @Bob please review');
    expect(mentions).toContain('Alice');
    expect(mentions).toContain('Bob');
  });

  it('returns empty for text with no mentions', () => {
    const mentions = extractMentionsFromText('hello world');
    expect(mentions.length).toBe(0);
  });

  it('deduplicates mentions', () => {
    const mentions = extractMentionsFromText('@Alice said @Alice is right');
    expect(mentions.length).toBe(1);
  });
});

// --------------------------------------------------------------------------
// MentionAutocomplete
// --------------------------------------------------------------------------

describe('MentionAutocomplete', () => {
  let textarea: HTMLTextAreaElement;
  let dropdown: HTMLElement;
  let searchFn: ReturnType<typeof vi.fn>;
  let onSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    textarea = document.createElement('textarea');
    dropdown = document.createElement('div');
    document.body.appendChild(textarea);
    document.body.appendChild(dropdown);
    searchFn = vi.fn().mockResolvedValue(mockMembers);
    onSelect = vi.fn();
  });

  it('sets up dropdown with correct ARIA attributes', () => {
    new MentionAutocomplete(textarea, dropdown, searchFn, onSelect);
    expect(dropdown.getAttribute('role')).toBe('listbox');
    expect(dropdown.getAttribute('aria-label')).toBe('Member suggestions');
    expect(dropdown.getAttribute('aria-hidden')).toBe('true');
  });

  it('hides dropdown initially', () => {
    new MentionAutocomplete(textarea, dropdown, searchFn, onSelect);
    expect(dropdown.style.display).toBe('none');
  });

  it('reports dropdown not visible initially', () => {
    const ac = new MentionAutocomplete(textarea, dropdown, searchFn, onSelect);
    expect(ac.isDropdownVisible()).toBe(false);
  });
});

// --------------------------------------------------------------------------
// createMentionNotification
// --------------------------------------------------------------------------

describe('createMentionNotification', () => {
  it('creates notification with correct type and title', () => {
    const context: MentionContext = {
      commentId: 'c1',
      videoId: 'v1',
      mentionedMemberId: 'u2',
      mentionerName: 'Alice',
      commentBody: 'Hey @Bob check this video',
    };
    const notification = createMentionNotification(context);
    expect(notification.type).toBe('mention');
    expect(notification.title).toBe('Alice mentioned you');
    expect(notification.recipientId).toBe('u2');
    expect(notification.resourceId).toBe('v1');
  });

  it('truncates long comment bodies', () => {
    const context: MentionContext = {
      commentId: 'c1',
      videoId: 'v1',
      mentionedMemberId: 'u2',
      mentionerName: 'Alice',
      commentBody: 'A'.repeat(200),
    };
    const notification = createMentionNotification(context);
    expect(notification.message.length).toBeLessThanOrEqual(100);
    expect(notification.message.endsWith('...')).toBe(true);
  });

  it('includes timestamp metadata when provided', () => {
    const context: MentionContext = {
      commentId: 'c1',
      videoId: 'v1',
      mentionedMemberId: 'u2',
      mentionerName: 'Alice',
      commentBody: 'Check this',
      timestampSeconds: 45,
    };
    const notification = createMentionNotification(context);
    expect(notification.metadata?.timestampSeconds).toBe(45);
  });
});

// --------------------------------------------------------------------------
// createReplyNotification
// --------------------------------------------------------------------------

describe('createReplyNotification', () => {
  it('creates reply notification with correct type', () => {
    const notification = createReplyNotification('u1', 'Bob', 'I agree!', 'v1', 'c1');
    expect(notification.type).toBe('comment_reply');
    expect(notification.title).toBe('Bob replied to your comment');
    expect(notification.recipientId).toBe('u1');
  });
});

// --------------------------------------------------------------------------
// determineDeliveryChannels
// --------------------------------------------------------------------------

describe('determineDeliveryChannels', () => {
  it('always includes in_app', () => {
    const channels = determineDeliveryChannels('low', []);
    expect(channels).toContain('in_app');
  });

  it('adds push for normal priority when enabled', () => {
    const channels = determineDeliveryChannels('normal', ['push', 'email']);
    expect(channels).toContain('in_app');
    expect(channels).toContain('push');
    expect(channels).not.toContain('email');
  });

  it('adds push and email for high priority', () => {
    const channels = determineDeliveryChannels('high', ['push', 'email', 'slack']);
    expect(channels).toContain('in_app');
    expect(channels).toContain('push');
    expect(channels).toContain('email');
    expect(channels).not.toContain('slack');
  });

  it('adds all enabled channels for urgent', () => {
    const channels = determineDeliveryChannels('urgent', ['push', 'email', 'slack']);
    expect(channels).toContain('in_app');
    expect(channels).toContain('push');
    expect(channels).toContain('email');
    expect(channels).toContain('slack');
  });
});

// --------------------------------------------------------------------------
// NotificationDeliveryService
// --------------------------------------------------------------------------

describe('NotificationDeliveryService', () => {
  it('delivers notification via callback', async () => {
    const onDeliver = vi.fn().mockResolvedValue({
      notificationId: 'n1',
      channels: [{ notificationId: 'n1', channel: 'in_app', status: 'delivered' }],
      success: true,
    } as DeliveryResult);

    const service = new NotificationDeliveryService({ onDeliver });
    const context: MentionContext = {
      commentId: 'c1',
      videoId: 'v1',
      mentionedMemberId: 'u2',
      mentionerName: 'Alice',
      commentBody: 'Hey @Bob',
    };

    const result = await service.deliverMentionNotification(context, 'u1');
    expect(onDeliver).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('marks notification as read', async () => {
    const onMarkRead = vi.fn().mockResolvedValue(true);
    const service = new NotificationDeliveryService({ onMarkRead });
    const result = await service.markAsRead('n1');
    expect(onMarkRead).toHaveBeenCalledWith('n1');
    expect(result).toBe(true);
  });

  it('marks all as read', async () => {
    const onMarkAllRead = vi.fn().mockResolvedValue(true);
    const service = new NotificationDeliveryService({ onMarkAllRead });
    const result = await service.markAllAsRead();
    expect(onMarkAllRead).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('handles delivery failure gracefully', async () => {
    const onDeliver = vi.fn().mockRejectedValue(new Error('Network error'));
    const service = new NotificationDeliveryService({ onDeliver });
    const context: MentionContext = {
      commentId: 'c1',
      videoId: 'v1',
      mentionedMemberId: 'u2',
      mentionerName: 'Alice',
      commentBody: 'Test',
    };
    const result = await service.deliverMentionNotification(context, 'u1');
    expect(result.success).toBe(false);
  });

  it('queues and processes pending deliveries', () => {
    const service = new NotificationDeliveryService({});
    service.queueForDelivery(createMentionNotification({
      commentId: 'c1',
      videoId: 'v1',
      mentionedMemberId: 'u2',
      mentionerName: 'Alice',
      commentBody: 'Test',
    }));
    expect(service.getPendingCount()).toBe(1);
  });
});

// --------------------------------------------------------------------------
// Notification Preferences utilities
// --------------------------------------------------------------------------

describe('Notification Preferences', () => {
  describe('createDefaultPreferences', () => {
    it('creates preferences for all categories and channels', () => {
      const prefs = createDefaultPreferences('u1');
      expect(prefs.memberId).toBe('u1');
      // 7 categories x 3 channels = 21 preferences
      expect(prefs.preferences.length).toBe(21);
      expect(prefs.preferences.every((p) => p.enabled)).toBe(true);
    });

    it('has quiet hours disabled by default', () => {
      const prefs = createDefaultPreferences('u1');
      expect(prefs.quietHoursEnabled).toBe(false);
      expect(prefs.doNotDisturb).toBe(false);
    });
  });

  describe('getPreference', () => {
    it('returns true for enabled preference', () => {
      const prefs = createDefaultPreferences('u1');
      expect(getPreference(prefs, 'mentions', 'in_app')).toBe(true);
    });

    it('returns true for missing preference (default)', () => {
      const prefs = createDefaultPreferences('u1');
      prefs.preferences = [];
      expect(getPreference(prefs, 'mentions', 'email')).toBe(true);
    });
  });

  describe('updatePreference', () => {
    it('disables a specific preference', () => {
      const prefs = createDefaultPreferences('u1');
      const updated = updatePreference(prefs, 'mentions', 'email', false);
      expect(getPreference(updated, 'mentions', 'email')).toBe(false);
      expect(getPreference(updated, 'mentions', 'in_app')).toBe(true);
    });
  });

  describe('toggleCategory', () => {
    it('disables all channels for a category', () => {
      const prefs = createDefaultPreferences('u1');
      const updated = toggleCategory(prefs, 'reactions', false);
      expect(getPreference(updated, 'reactions', 'in_app')).toBe(false);
      expect(getPreference(updated, 'reactions', 'email')).toBe(false);
      expect(getPreference(updated, 'reactions', 'push')).toBe(false);
    });
  });

  describe('toggleChannel', () => {
    it('disables a channel across all categories', () => {
      const prefs = createDefaultPreferences('u1');
      const updated = toggleChannel(prefs, 'push', false);
      expect(getPreference(updated, 'mentions', 'push')).toBe(false);
      expect(getPreference(updated, 'reactions', 'push')).toBe(false);
      // Other channels unaffected
      expect(getPreference(updated, 'mentions', 'email')).toBe(true);
    });
  });
});

// --------------------------------------------------------------------------
// shouldDeliverNotification and isInQuietHours
// --------------------------------------------------------------------------

describe('shouldDeliverNotification', () => {
  it('returns false when do not disturb is enabled', () => {
    const prefs = createDefaultPreferences('u1');
    prefs.doNotDisturb = true;
    expect(shouldDeliverNotification(prefs, 'mentions', 'push')).toBe(false);
  });

  it('returns true for enabled preference outside quiet hours', () => {
    const prefs = createDefaultPreferences('u1');
    expect(shouldDeliverNotification(prefs, 'mentions', 'push')).toBe(true);
  });

  it('returns false during quiet hours for push/email', () => {
    const prefs = createDefaultPreferences('u1');
    prefs.quietHoursEnabled = true;
    prefs.quietHoursStart = '22:00';
    prefs.quietHoursEnd = '08:00';
    const lateNight = new Date('2024-01-15T23:30:00');
    expect(shouldDeliverNotification(prefs, 'mentions', 'push', lateNight)).toBe(false);
  });

  it('allows in_app during quiet hours', () => {
    const prefs = createDefaultPreferences('u1');
    prefs.quietHoursEnabled = true;
    prefs.quietHoursStart = '22:00';
    prefs.quietHoursEnd = '08:00';
    const lateNight = new Date('2024-01-15T23:30:00');
    expect(shouldDeliverNotification(prefs, 'mentions', 'in_app', lateNight)).toBe(true);
  });
});

describe('isInQuietHours', () => {
  it('detects overnight quiet hours (22:00 to 08:00)', () => {
    expect(isInQuietHours(new Date('2024-01-15T23:00:00'), '22:00', '08:00')).toBe(true);
    expect(isInQuietHours(new Date('2024-01-15T07:00:00'), '22:00', '08:00')).toBe(true);
    expect(isInQuietHours(new Date('2024-01-15T12:00:00'), '22:00', '08:00')).toBe(false);
  });

  it('detects same-day quiet hours (08:00 to 17:00)', () => {
    expect(isInQuietHours(new Date('2024-01-15T12:00:00'), '08:00', '17:00')).toBe(true);
    expect(isInQuietHours(new Date('2024-01-15T20:00:00'), '08:00', '17:00')).toBe(false);
  });
});

describe('getEnabledChannelCount', () => {
  it('counts all enabled channels for a category', () => {
    const prefs = createDefaultPreferences('u1');
    expect(getEnabledChannelCount(prefs, 'mentions')).toBe(3);
  });

  it('reflects toggled off channels', () => {
    const prefs = createDefaultPreferences('u1');
    const updated = updatePreference(prefs, 'mentions', 'push', false);
    expect(getEnabledChannelCount(updated, 'mentions')).toBe(2);
  });
});

// --------------------------------------------------------------------------
// NotificationPreferencesPanel
// --------------------------------------------------------------------------

describe('NotificationPreferencesPanel', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createContainer();
  });

  it('renders preferences panel with correct ARIA attributes', () => {
    const prefs = createDefaultPreferences('u1');
    new NotificationPreferencesPanel(container, prefs);
    expect(container.getAttribute('role')).toBe('region');
    expect(container.getAttribute('aria-label')).toBe('Notification preferences');
  });

  it('renders the do not disturb toggle', () => {
    const prefs = createDefaultPreferences('u1');
    new NotificationPreferencesPanel(container, prefs);
    const dndSection = container.querySelector('.dnd-section');
    expect(dndSection).not.toBeNull();
  });

  it('renders quiet hours section', () => {
    const prefs = createDefaultPreferences('u1');
    new NotificationPreferencesPanel(container, prefs);
    const qhSection = container.querySelector('.quiet-hours-section');
    expect(qhSection).not.toBeNull();
  });

  it('renders preferences matrix table', () => {
    const prefs = createDefaultPreferences('u1');
    new NotificationPreferencesPanel(container, prefs);
    const table = container.querySelector('.preferences-matrix-table');
    expect(table).not.toBeNull();
    expect(table?.getAttribute('role')).toBe('grid');
  });

  it('renders save button', () => {
    const prefs = createDefaultPreferences('u1');
    new NotificationPreferencesPanel(container, prefs);
    const saveBtn = container.querySelector('.preferences-save-btn');
    expect(saveBtn).not.toBeNull();
    expect(saveBtn?.textContent).toBe('Save Preferences');
  });

  it('calls onSave when save button is clicked', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const prefs = createDefaultPreferences('u1');
    new NotificationPreferencesPanel(container, prefs, { onSave });
    const saveBtn = container.querySelector('.preferences-save-btn') as HTMLButtonElement;
    saveBtn.click();
    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
  });
});

// --------------------------------------------------------------------------
// Notification Center - filterNotifications
// --------------------------------------------------------------------------

describe('filterNotifications', () => {
  const notifications: NotificationItem[] = [
    makeNotification({ id: 'n1', type: 'mention', isRead: false }),
    makeNotification({ id: 'n2', type: 'comment_reply', isRead: true }),
    makeNotification({ id: 'n3', type: 'system', isRead: false }),
    makeNotification({ id: 'n4', type: 'mention', isRead: true }),
  ];

  it('returns all with "all" filter', () => {
    expect(filterNotifications(notifications, 'all').length).toBe(4);
  });

  it('filters unread only', () => {
    const filtered = filterNotifications(notifications, 'unread');
    expect(filtered.length).toBe(2);
    expect(filtered.every((n) => !n.isRead)).toBe(true);
  });

  it('filters mentions only', () => {
    const filtered = filterNotifications(notifications, 'mentions');
    expect(filtered.length).toBe(2);
    expect(filtered.every((n) => n.type === 'mention')).toBe(true);
  });

  it('filters replies only', () => {
    const filtered = filterNotifications(notifications, 'replies');
    expect(filtered.length).toBe(1);
    expect(filtered[0].type).toBe('comment_reply');
  });

  it('filters system only', () => {
    const filtered = filterNotifications(notifications, 'system');
    expect(filtered.length).toBe(1);
    expect(filtered[0].type).toBe('system');
  });
});

// --------------------------------------------------------------------------
// groupNotificationsByDate
// --------------------------------------------------------------------------

describe('groupNotificationsByDate', () => {
  it('groups today notifications', () => {
    const notifications = [makeNotification({ createdAt: new Date().toISOString() })];
    const groups = groupNotificationsByDate(notifications);
    expect(groups.has('Today')).toBe(true);
    expect(groups.get('Today')!.length).toBe(1);
  });

  it('groups yesterday notifications', () => {
    const yesterday = new Date(Date.now() - 86400000);
    yesterday.setHours(12, 0, 0, 0);
    const notifications = [makeNotification({ createdAt: yesterday.toISOString() })];
    const groups = groupNotificationsByDate(notifications);
    expect(groups.has('Yesterday')).toBe(true);
  });

  it('groups older notifications', () => {
    const old = new Date(Date.now() - 30 * 86400000);
    const notifications = [makeNotification({ createdAt: old.toISOString() })];
    const groups = groupNotificationsByDate(notifications);
    expect(groups.has('Older')).toBe(true);
  });
});

// --------------------------------------------------------------------------
// formatRelativeTime
// --------------------------------------------------------------------------

describe('formatRelativeTime', () => {
  it('shows "just now" for recent timestamps', () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe('just now');
  });

  it('shows minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(formatRelativeTime(fiveMinAgo)).toBe('5m ago');
  });

  it('shows hours ago', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();
    expect(formatRelativeTime(twoHoursAgo)).toBe('2h ago');
  });
});

// --------------------------------------------------------------------------
// getNotificationIcon
// --------------------------------------------------------------------------

describe('getNotificationIcon', () => {
  it('returns @ for mention', () => {
    expect(getNotificationIcon('mention')).toBe('@');
  });

  it('returns 💬 for comment_reply', () => {
    expect(getNotificationIcon('comment_reply')).toBe('💬');
  });

  it('returns ℹ️ for system', () => {
    expect(getNotificationIcon('system')).toBe('ℹ️');
  });
});

// --------------------------------------------------------------------------
// NotificationsPage
// --------------------------------------------------------------------------

describe('NotificationsPage', () => {
  it('renders notification center with correct ARIA attributes', () => {
    const page = new NotificationsPage();
    const el = page.getElement();
    expect(el.getAttribute('role')).toBe('region');
    expect(el.getAttribute('aria-label')).toBe('Notification center');
  });

  it('shows empty state when no notifications', () => {
    const page = new NotificationsPage([]);
    const el = page.getElement();
    expect(el.querySelector('.notification-empty-state')).not.toBeNull();
  });

  it('renders filter tabs', () => {
    const page = new NotificationsPage([makeNotification()]);
    const el = page.getElement();
    const tabs = el.querySelectorAll('.notification-filter-tab');
    expect(tabs.length).toBe(5);
  });

  it('renders notification items', () => {
    const notifications = [
      makeNotification({ id: 'n1', title: 'Alice mentioned you' }),
      makeNotification({ id: 'n2', title: 'Bob replied', type: 'comment_reply' }),
    ];
    const page = new NotificationsPage(notifications);
    const el = page.getElement();
    const items = el.querySelectorAll('.notification-item');
    expect(items.length).toBe(2);
  });

  it('shows unread badge with count', () => {
    const notifications = [
      makeNotification({ id: 'n1', isRead: false }),
      makeNotification({ id: 'n2', isRead: false }),
      makeNotification({ id: 'n3', isRead: true }),
    ];
    const page = new NotificationsPage(notifications);
    const el = page.getElement();
    const badge = el.querySelector('.notification-unread-badge');
    expect(badge?.textContent).toBe('2 unread');
  });

  it('marks unread items with unread class', () => {
    const notifications = [makeNotification({ id: 'n1', isRead: false })];
    const page = new NotificationsPage(notifications);
    const el = page.getElement();
    const item = el.querySelector('.notification-item');
    expect(item?.classList.contains('unread')).toBe(true);
  });

  it('calls onMarkRead when mark read button clicked', async () => {
    const onMarkRead = vi.fn().mockResolvedValue(undefined);
    const notifications = [makeNotification({ id: 'n1', isRead: false })];
    const page = new NotificationsPage(notifications, { onMarkRead });
    const el = page.getElement();
    const readBtn = el.querySelector('.mark-read-btn') as HTMLButtonElement;
    readBtn.click();
    await vi.waitFor(() => {
      expect(onMarkRead).toHaveBeenCalledWith('n1');
    });
  });

  it('calls onMarkAllRead when mark all read button clicked', async () => {
    const onMarkAllRead = vi.fn().mockResolvedValue(undefined);
    const notifications = [
      makeNotification({ id: 'n1', isRead: false }),
      makeNotification({ id: 'n2', isRead: false }),
    ];
    const page = new NotificationsPage(notifications, { onMarkAllRead });
    const el = page.getElement();
    const btn = el.querySelector('.notification-mark-all-btn') as HTMLButtonElement;
    btn.click();
    await vi.waitFor(() => {
      expect(onMarkAllRead).toHaveBeenCalled();
    });
  });

  it('calls onDelete when delete button clicked', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const notifications = [makeNotification({ id: 'n1' })];
    const page = new NotificationsPage(notifications, { onDelete });
    const el = page.getElement();
    const deleteBtn = el.querySelector('.delete-btn') as HTMLButtonElement;
    deleteBtn.click();
    await vi.waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('n1');
    });
  });

  it('reports correct unread count', () => {
    const notifications = [
      makeNotification({ id: 'n1', isRead: false }),
      makeNotification({ id: 'n2', isRead: true }),
    ];
    const page = new NotificationsPage(notifications);
    expect(page.getUnreadCount()).toBe(1);
  });

  it('adds notification via addNotification', () => {
    const page = new NotificationsPage([]);
    page.addNotification(makeNotification({ id: 'new-1', title: 'New mention' }));
    expect(page.getUnreadCount()).toBe(1);
    const el = page.getElement();
    expect(el.querySelector('.notification-item')).not.toBeNull();
  });
});
