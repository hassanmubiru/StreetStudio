/**
 * Unit tests for Real-Time Collaboration Features
 *
 * Tests presence indicators (existing), typing indicators, collaborative
 * viewing mode, and activity feed components.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.8, 7.9
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  PresenceTracker,
  PresenceIndicators,
  getInitials,
  getAvatarColor,
  isValidPresenceUser,
} from './presence-indicators';
import type { PresenceUser, PresenceIndicatorsOptions } from './presence-indicators';

import {
  formatTypingMessage,
  isTypingExpired,
  filterExpiredTyping,
  TypingIndicators,
} from './typing-indicators';
import type { TypingUser } from './typing-indicators';

import {
  needsSyncCorrection,
  adjustForLatency,
  formatSyncStatus,
  CollaborativeViewing,
} from './collaborative-viewing';

import {
  getActivityIcon,
  formatRelativeTime,
  groupActivities,
  filterActivities,
  ActivityFeed,
} from './activity-feed';
import type { ActivityEvent } from './activity-feed';

// --------------------------------------------------------------------------
// Test helpers
// --------------------------------------------------------------------------

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

function makePresenceUser(overrides: Partial<PresenceUser> = {}): PresenceUser {
  return {
    id: 'user-1',
    displayName: 'Alice Smith',
    status: 'active',
    joinedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTypingUser(overrides: Partial<TypingUser> = {}): TypingUser {
  return {
    id: 'user-1',
    displayName: 'Alice',
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeActivityEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 'event-1',
    type: 'comment_added',
    actorId: 'user-1',
    actorName: 'Alice',
    description: 'added a comment',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ==========================================================================
// Presence Indicators Tests (existing API)
// ==========================================================================

describe('Presence Indicators', () => {
  describe('getInitials', () => {
    it('returns single initial for single name', () => {
      expect(getInitials('Alice')).toBe('A');
    });

    it('returns two initials for full name', () => {
      expect(getInitials('Alice Smith')).toBe('AS');
    });

    it('uses first and last word for multi-word names', () => {
      expect(getInitials('Alice B Smith')).toBe('AS');
    });

    it('returns ? for empty string', () => {
      expect(getInitials('')).toBe('?');
    });
  });

  describe('getAvatarColor', () => {
    it('returns a hex color string', () => {
      expect(getAvatarColor('user-1')).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('is deterministic for same ID', () => {
      expect(getAvatarColor('abc')).toBe(getAvatarColor('abc'));
    });
  });

  describe('isValidPresenceUser', () => {
    it('returns true for valid user', () => {
      expect(isValidPresenceUser(makePresenceUser())).toBe(true);
    });

    it('returns false for null', () => {
      expect(isValidPresenceUser(null)).toBe(false);
    });

    it('returns false for missing fields', () => {
      expect(isValidPresenceUser({ id: 'x' })).toBe(false);
    });
  });

  describe('PresenceTracker', () => {
    it('tracks viewers excluding current user', () => {
      const tracker = new PresenceTracker('me');
      tracker.upsertUser(makePresenceUser({ id: 'u1' }));
      tracker.upsertUser(makePresenceUser({ id: 'me' }));
      expect(tracker.getViewerCount()).toBe(1);
      expect(tracker.getViewers()[0].id).toBe('u1');
    });

    it('removes users correctly', () => {
      const tracker = new PresenceTracker('me');
      tracker.upsertUser(makePresenceUser({ id: 'u1' }));
      tracker.upsertUser(makePresenceUser({ id: 'u2' }));
      tracker.removeUser('u1');
      expect(tracker.getViewerCount()).toBe(1);
    });

    it('updates typing status', () => {
      const tracker = new PresenceTracker('me');
      tracker.upsertUser(makePresenceUser({ id: 'u1' }));
      tracker.setTypingStatus('u1', true);
      expect(tracker.getTypingUsers().length).toBe(1);
    });

    it('updates user status', () => {
      const tracker = new PresenceTracker('me');
      tracker.upsertUser(makePresenceUser({ id: 'u1', status: 'active' }));
      tracker.setUserStatus('u1', 'idle');
      expect(tracker.getViewers()[0].status).toBe('idle');
    });
  });

  describe('PresenceIndicators component', () => {
    let container: HTMLElement;
    const defaultOptions: PresenceIndicatorsOptions = {
      videoId: 'video-1',
      currentUserId: 'me',
      maxVisibleAvatars: 5,
      showTypingIndicators: true,
      showViewersList: true,
    };

    beforeEach(() => {
      container = createContainer();
    });

    it('renders with proper ARIA attributes', () => {
      new PresenceIndicators(container, defaultOptions);
      expect(container.getAttribute('role')).toBe('region');
      expect(container.getAttribute('aria-label')).toBe('Active viewers');
    });

    it('renders user avatars when viewers are present', () => {
      const indicators = new PresenceIndicators(container, defaultOptions);
      indicators.setViewers([
        makePresenceUser({ id: 'u1', displayName: 'Alice' }),
        makePresenceUser({ id: 'u2', displayName: 'Bob' }),
      ]);
      const avatars = container.querySelectorAll('.presence-avatar:not(.presence-overflow)');
      expect(avatars.length).toBe(2);
    });

    it('shows overflow indicator when users exceed max', () => {
      const indicators = new PresenceIndicators(container, { ...defaultOptions, maxVisibleAvatars: 2 });
      indicators.setViewers([
        makePresenceUser({ id: 'u1' }),
        makePresenceUser({ id: 'u2' }),
        makePresenceUser({ id: 'u3' }),
        makePresenceUser({ id: 'u4' }),
      ]);
      const overflow = container.querySelector('.presence-overflow');
      expect(overflow).not.toBeNull();
      expect(overflow!.textContent).toBe('+2');
    });

    it('excludes current user from display', () => {
      const indicators = new PresenceIndicators(container, defaultOptions);
      indicators.setViewers([
        makePresenceUser({ id: 'me', displayName: 'Me' }),
        makePresenceUser({ id: 'u1', displayName: 'Alice' }),
      ]);
      expect(indicators.getViewerCount()).toBe(1);
    });

    it('shows typing indicator when users are typing', () => {
      const indicators = new PresenceIndicators(container, defaultOptions);
      indicators.setViewers([makePresenceUser({ id: 'u1', displayName: 'Alice', isTyping: true })]);
      const typing = container.querySelector('.presence-typing-indicator');
      expect(typing).not.toBeNull();
      expect(typing!.textContent).toContain('Alice is typing...');
    });

    it('shows viewer count in toggle button', () => {
      const indicators = new PresenceIndicators(container, defaultOptions);
      indicators.setViewers([
        makePresenceUser({ id: 'u1' }),
        makePresenceUser({ id: 'u2' }),
      ]);
      const toggle = container.querySelector('.presence-viewers-toggle');
      expect(toggle).not.toBeNull();
      expect(toggle!.textContent).toBe('2 viewing');
    });

    it('shows initials when no avatar URL', () => {
      const indicators = new PresenceIndicators(container, defaultOptions);
      indicators.setViewers([makePresenceUser({ id: 'u1', displayName: 'Alice Smith' })]);
      const initials = container.querySelector('.presence-avatar-initials');
      expect(initials?.textContent).toBe('AS');
    });
  });
});

// ==========================================================================
// Typing Indicators Tests
// ==========================================================================

describe('Typing Indicators', () => {
  describe('formatTypingMessage', () => {
    it('returns empty string for no users', () => {
      expect(formatTypingMessage([])).toBe('');
    });

    it('formats single user as "is typing..."', () => {
      expect(formatTypingMessage([makeTypingUser({ displayName: 'Alice' })])).toBe(
        'Alice is typing...'
      );
    });

    it('formats two users with "and"', () => {
      const users = [
        makeTypingUser({ displayName: 'Alice' }),
        makeTypingUser({ displayName: 'Bob' }),
      ];
      expect(formatTypingMessage(users)).toBe('Alice and Bob are typing...');
    });

    it('formats three users with commas and "and"', () => {
      const users = [
        makeTypingUser({ displayName: 'Alice' }),
        makeTypingUser({ displayName: 'Bob' }),
        makeTypingUser({ displayName: 'Charlie' }),
      ];
      expect(formatTypingMessage(users, 3)).toBe(
        'Alice, Bob, and Charlie are typing...'
      );
    });

    it('shows "others" when exceeding maxNames', () => {
      const users = [
        makeTypingUser({ displayName: 'Alice' }),
        makeTypingUser({ displayName: 'Bob' }),
        makeTypingUser({ displayName: 'Charlie' }),
        makeTypingUser({ displayName: 'Dave' }),
      ];
      const result = formatTypingMessage(users, 3);
      expect(result).toContain('2 others are typing...');
    });
  });

  describe('isTypingExpired', () => {
    it('returns false when within expiry window', () => {
      const now = new Date();
      const startedAt = new Date(now.getTime() - 2000).toISOString();
      expect(isTypingExpired(startedAt, 5000, now)).toBe(false);
    });

    it('returns true when past expiry window', () => {
      const now = new Date();
      const startedAt = new Date(now.getTime() - 6000).toISOString();
      expect(isTypingExpired(startedAt, 5000, now)).toBe(true);
    });

    it('returns true when exactly past boundary', () => {
      const now = new Date();
      const startedAt = new Date(now.getTime() - 5001).toISOString();
      expect(isTypingExpired(startedAt, 5000, now)).toBe(true);
    });
  });
