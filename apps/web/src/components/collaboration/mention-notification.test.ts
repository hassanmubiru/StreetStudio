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

