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
