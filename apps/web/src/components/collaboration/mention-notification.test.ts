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

