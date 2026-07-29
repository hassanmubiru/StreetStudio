/**
 * Unit tests for Real-Time Collaboration Features
 *
 * Tests presence indicators, typing indicators, collaborative viewing mode,
 * and activity feed components.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.8, 7.9
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getStatusClass,
  getInitials,
  filterAndSortUsers,
  splitVisibleUsers,
  PresenceIndicators,
} from './presence-indicators';
import type { PresenceUser } from './presence-indicators';

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
    lastActiveAt: new Date().toISOString(),
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
// Presence Indicators Tests
// ==========================================================================

describe('Presence Indicators', () => {
  describe('getStatusClass', () => {
    it('returns correct class for active status', () => {
      expect(getStatusClass('active')).toBe('presence-status-active');
    });

    it('returns correct class for idle status', () => {
      expect(getStatusClass('idle')).toBe('presence-status-idle');
    });

    it('returns correct class for away status', () => {
      expect(getStatusClass('away')).toBe('presence-status-away');
    });
  });

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

    it('handles whitespace-only strings', () => {
      expect(getInitials('   ')).toBe('?');
    });
  });

  describe('filterAndSortUsers', () => {
    it('excludes current user from the list', () => {
      const users = [
        makePresenceUser({ id: 'user-1' }),
        makePresenceUser({ id: 'user-2', displayName: 'Bob' }),
      ];
      const result = filterAndSortUsers(users, 'user-1');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('user-2');
    });

    it('sorts active users before idle and away', () => {
      const users = [
        makePresenceUser({ id: 'u1', status: 'away' }),
        makePresenceUser({ id: 'u2', status: 'active' }),
        makePresenceUser({ id: 'u3', status: 'idle' }),
      ];
      const result = filterAndSortUsers(users);
      expect(result[0].status).toBe('active');
      expect(result[1].status).toBe('idle');
      expect(result[2].status).toBe('away');
    });

    it('returns empty array when all users are current user', () => {
      const users = [makePresenceUser({ id: 'me' })];
      expect(filterAndSortUsers(users, 'me')).toEqual([]);
    });
  });

  describe('splitVisibleUsers', () => {
    it('returns all users when under max', () => {
      const users = [makePresenceUser(), makePresenceUser({ id: 'u2' })];
      const { visible, overflowCount } = splitVisibleUsers(users, 5);
      expect(visible.length).toBe(2);
      expect(overflowCount).toBe(0);
    });

    it('splits and returns overflow count when over max', () => {
      const users = Array.from({ length: 8 }, (_, i) =>
        makePresenceUser({ id: `u${i}` })
      );
      const { visible, overflowCount } = splitVisibleUsers(users, 5);
      expect(visible.length).toBe(5);
      expect(overflowCount).toBe(3);
    });

    it('returns exactly max with 0 overflow at boundary', () => {
      const users = Array.from({ length: 5 }, (_, i) =>
        makePresenceUser({ id: `u${i}` })
      );
      const { visible, overflowCount } = splitVisibleUsers(users, 5);
      expect(visible.length).toBe(5);
      expect(overflowCount).toBe(0);
    });
  });

  describe('PresenceIndicators component', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = createContainer();
    });

    it('renders with proper ARIA attributes', () => {
      new PresenceIndicators(container);
      expect(container.getAttribute('role')).toBe('group');
      expect(container.getAttribute('aria-label')).toBe('Users currently viewing');
    });

    it('shows empty message when no users', () => {
      const indicators = new PresenceIndicators(container);
      indicators.setUsers([]);
      expect(container.textContent).toContain('No other viewers');
    });

    it('renders user avatars when users are present', () => {
      const indicators = new PresenceIndicators(container, { currentUserId: 'me' });
      indicators.setUsers([
        makePresenceUser({ id: 'u1', displayName: 'Alice' }),
        makePresenceUser({ id: 'u2', displayName: 'Bob' }),
      ]);
      const avatars = container.querySelectorAll('.presence-avatar');
      expect(avatars.length).toBe(2);
    });

    it('shows overflow indicator when users exceed max', () => {
      const indicators = new PresenceIndicators(container, { maxVisible: 2, currentUserId: 'me' });
      indicators.setUsers([
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
      const indicators = new PresenceIndicators(container, { currentUserId: 'me' });
      indicators.setUsers([
        makePresenceUser({ id: 'me', displayName: 'Me' }),
        makePresenceUser({ id: 'u1', displayName: 'Alice' }),
      ]);
      expect(container.textContent).not.toContain('Me');
      expect(container.textContent).toContain('1 viewer');
    });

    it('adds user via addUser method', () => {
      const indicators = new PresenceIndicators(container, { currentUserId: 'me' });
      indicators.setUsers([]);
      indicators.addUser(makePresenceUser({ id: 'u1', displayName: 'Alice' }));
      expect(indicators.getVisibleCount()).toBe(1);
    });

    it('removes user via removeUser method', () => {
      const indicators = new PresenceIndicators(container, { currentUserId: 'me' });
      indicators.setUsers([
        makePresenceUser({ id: 'u1' }),
        makePresenceUser({ id: 'u2' }),
      ]);
      indicators.removeUser('u1');
      expect(indicators.getVisibleCount()).toBe(1);
    });

    it('updates user status', () => {
      const indicators = new PresenceIndicators(container, { currentUserId: 'me' });
      indicators.setUsers([makePresenceUser({ id: 'u1', status: 'active' })]);
      indicators.updateUserStatus('u1', 'idle');
      const users = indicators.getUsers();
      expect(users[0].status).toBe('idle');
    });

    it('displays viewer count label', () => {
      const indicators = new PresenceIndicators(container, { currentUserId: 'me' });
      indicators.setUsers([
        makePresenceUser({ id: 'u1' }),
        makePresenceUser({ id: 'u2' }),
        makePresenceUser({ id: 'u3' }),
      ]);
      expect(container.textContent).toContain('3 viewers');
    });

    it('shows initials when no avatar URL', () => {
      const indicators = new PresenceIndicators(container, { currentUserId: 'me' });
      indicators.setUsers([makePresenceUser({ id: 'u1', displayName: 'Alice Smith' })]);
      const initials = container.querySelector('.presence-avatar-initials');
      expect(initials?.textContent).toBe('AS');
    });
  });
});
