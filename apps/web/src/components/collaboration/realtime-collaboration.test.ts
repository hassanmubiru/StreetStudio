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
      expect(tracker.getViewers()[0]!.id).toBe('u1');
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
      expect(tracker.getViewers()[0]!.status).toBe('idle');
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

  describe('filterExpiredTyping', () => {
    it('removes expired users', () => {
      const now = new Date();
      const users = [
        makeTypingUser({ id: 'u1', startedAt: new Date(now.getTime() - 1000).toISOString() }),
        makeTypingUser({ id: 'u2', startedAt: new Date(now.getTime() - 8000).toISOString() }),
      ];
      const result = filterExpiredTyping(users, 5000, now);
      expect(result.length).toBe(1);
      expect(result[0]!.id).toBe('u1');
    });

    it('keeps all users if none expired', () => {
      const now = new Date();
      const users = [
        makeTypingUser({ id: 'u1', startedAt: new Date(now.getTime() - 1000).toISOString() }),
        makeTypingUser({ id: 'u2', startedAt: new Date(now.getTime() - 2000).toISOString() }),
      ];
      const result = filterExpiredTyping(users, 5000, now);
      expect(result.length).toBe(2);
    });
  });

  describe('TypingIndicators component', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = createContainer();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('renders with proper ARIA attributes', () => {
      new TypingIndicators(container);
      expect(container.getAttribute('role')).toBe('status');
      expect(container.getAttribute('aria-live')).toBe('polite');
    });

    it('is hidden when no users are typing', () => {
      new TypingIndicators(container);
      expect(container.style.display).toBe('none');
    });

    it('shows typing message when a user starts typing', () => {
      const indicators = new TypingIndicators(container, { currentUserId: 'me' });
      indicators.setUserTyping(makeTypingUser({ id: 'u1', displayName: 'Alice' }));
      expect(container.style.display).toBe('flex');
      expect(container.textContent).toContain('Alice is typing...');
    });

    it('hides when user stops typing', () => {
      const indicators = new TypingIndicators(container, { currentUserId: 'me' });
      indicators.setUserTyping(makeTypingUser({ id: 'u1', displayName: 'Alice' }));
      indicators.clearUserTyping('u1');
      expect(container.style.display).toBe('none');
    });

    it('excludes current user from display', () => {
      const indicators = new TypingIndicators(container, { currentUserId: 'me' });
      indicators.setUserTyping(makeTypingUser({ id: 'me', displayName: 'Me' }));
      expect(container.style.display).toBe('none');
    });

    it('shows multiple typing users', () => {
      const indicators = new TypingIndicators(container, { currentUserId: 'me' });
      indicators.setUserTyping(makeTypingUser({ id: 'u1', displayName: 'Alice' }));
      indicators.setUserTyping(makeTypingUser({ id: 'u2', displayName: 'Bob' }));
      expect(container.textContent).toContain('Alice and Bob are typing...');
    });

    it('renders animated dots', () => {
      const indicators = new TypingIndicators(container, { currentUserId: 'me' });
      indicators.setUserTyping(makeTypingUser({ id: 'u1', displayName: 'Alice' }));
      const dots = container.querySelectorAll('.dot');
      expect(dots.length).toBe(3);
    });

    it('emits onTypingStart and onTypingStop for local typing', () => {
      const onTypingStart = vi.fn();
      const onTypingStop = vi.fn();
      const indicators = new TypingIndicators(
        container,
        { currentUserId: 'me', expiryMs: 3000 },
        { onTypingStart, onTypingStop }
      );

      indicators.handleLocalTyping();
      expect(onTypingStart).toHaveBeenCalledOnce();

      vi.advanceTimersByTime(3100);
      expect(onTypingStop).toHaveBeenCalledOnce();
    });

    it('expires typing users after timeout', () => {
      const indicators = new TypingIndicators(container, { currentUserId: 'me', expiryMs: 3000 });
      indicators.setUserTyping(makeTypingUser({ id: 'u1', displayName: 'Alice' }));
      expect(indicators.hasTypingUsers()).toBe(true);

      vi.advanceTimersByTime(4000);
      expect(indicators.hasTypingUsers()).toBe(false);
    });

    it('cleans up on destroy', () => {
      const indicators = new TypingIndicators(container, { currentUserId: 'me' });
      indicators.setUserTyping(makeTypingUser({ id: 'u1' }));
      indicators.destroy();
      expect(indicators.getTypingUsers()).toEqual([]);
    });
  });
});

// ==========================================================================
// Collaborative Viewing Tests
// ==========================================================================

describe('Collaborative Viewing', () => {
  describe('needsSyncCorrection', () => {
    it('returns false when within tolerance', () => {
      expect(needsSyncCorrection(10, 11, 2)).toBe(false);
    });

    it('returns true when beyond tolerance', () => {
      expect(needsSyncCorrection(10, 15, 2)).toBe(true);
    });

    it('returns false when exactly at tolerance boundary', () => {
      expect(needsSyncCorrection(10, 12, 2)).toBe(false);
    });

    it('handles negative difference', () => {
      expect(needsSyncCorrection(15, 10, 2)).toBe(true);
    });
  });

  describe('adjustForLatency', () => {
    it('returns remote time when not playing', () => {
      const result = adjustForLatency(10, new Date().toISOString(), false);
      expect(result).toBe(10);
    });

    it('adds estimated latency when playing', () => {
      const pastTime = new Date(Date.now() - 500).toISOString();
      const result = adjustForLatency(10, pastTime, true, 1);
      expect(result).toBeGreaterThan(10);
      expect(result).toBeLessThan(11);
    });

    it('accounts for playback rate', () => {
      const pastTime = new Date(Date.now() - 1000).toISOString();
      const result = adjustForLatency(10, pastTime, true, 2);
      expect(result).toBeGreaterThan(11);
      expect(result).toBeLessThan(13);
    });
  });

  describe('formatSyncStatus', () => {
    it('formats host status', () => {
      expect(formatSyncStatus('host')).toContain('hosting');
    });

    it('formats follower status with host name', () => {
      expect(formatSyncStatus('follower', 'Alice')).toContain('Alice');
    });

    it('formats independent status', () => {
      expect(formatSyncStatus('independent')).toContain('disabled');
    });
  });

  describe('CollaborativeViewing component', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = createContainer();
    });

    it('renders with proper ARIA attributes', () => {
      new CollaborativeViewing(container, {
        videoId: 'v1',
        currentUserId: 'me',
        videoDuration: 120,
      });
      expect(container.getAttribute('role')).toBe('region');
      expect(container.getAttribute('aria-label')).toBe('Collaborative viewing controls');
    });

    it('starts in independent mode by default', () => {
      const collab = new CollaborativeViewing(container, {
        videoId: 'v1',
        currentUserId: 'me',
        videoDuration: 120,
      });
      expect(collab.getSyncMode()).toBe('independent');
    });

    it('renders sync toggle button', () => {
      new CollaborativeViewing(container, {
        videoId: 'v1',
        currentUserId: 'me',
        videoDuration: 120,
      });
      const syncBtn = container.querySelector('.collab-sync-btn');
      expect(syncBtn).not.toBeNull();
      expect(syncBtn!.textContent).toContain('Sync Off');
    });

    it('toggles sync mode when button is clicked', () => {
      const onSyncModeChange = vi.fn();
      const collab = new CollaborativeViewing(
        container,
        { videoId: 'v1', currentUserId: 'me', videoDuration: 120 },
        { onSyncModeChange }
      );

      const syncBtn = container.querySelector('.collab-sync-btn') as HTMLButtonElement;
      syncBtn.click();

      expect(collab.getSyncMode()).toBe('follower');
      expect(onSyncModeChange).toHaveBeenCalledWith('follower');
    });

    it('shows host button when sync is enabled', () => {
      new CollaborativeViewing(container, {
        videoId: 'v1',
        currentUserId: 'me',
        videoDuration: 120,
      });

      const syncBtn = container.querySelector('.collab-sync-btn') as HTMLButtonElement;
      syncBtn.click();

      const hostBtn = container.querySelector('.collab-host-btn');
      expect(hostBtn).not.toBeNull();
    });

    it('switches to host mode when host button is clicked', () => {
      const collab = new CollaborativeViewing(container, {
        videoId: 'v1',
        currentUserId: 'me',
        videoDuration: 120,
      });

      const syncBtn = container.querySelector('.collab-sync-btn') as HTMLButtonElement;
      syncBtn.click();
      const hostBtn = container.querySelector('.collab-host-btn') as HTMLButtonElement;
      hostBtn.click();

      expect(collab.getSyncMode()).toBe('host');
      expect(collab.getHostId()).toBe('me');
    });

    it('syncs playback when remote state differs beyond tolerance', () => {
      const onSeek = vi.fn();
      const collab = new CollaborativeViewing(
        container,
        { videoId: 'v1', currentUserId: 'me', videoDuration: 120, syncToleranceSeconds: 2 },
        { onSeek }
      );

      const syncBtn = container.querySelector('.collab-sync-btn') as HTMLButtonElement;
      syncBtn.click();
      collab.updateParticipant({
        id: 'host-1',
        displayName: 'Host',
        syncMode: 'host',
        currentTime: 0,
        isPlaying: false,
      });

      collab.updateLocalPlayback({ currentTime: 10 });
      collab.handleRemotePlaybackState('host-1', {
        currentTime: 50,
        isPlaying: false,
        playbackRate: 1,
        timestamp: new Date().toISOString(),
      });

      expect(onSeek).toHaveBeenCalledWith(50);
    });

    it('does not seek when within sync tolerance', () => {
      const onSeek = vi.fn();
      const collab = new CollaborativeViewing(
        container,
        { videoId: 'v1', currentUserId: 'me', videoDuration: 120, syncToleranceSeconds: 2 },
        { onSeek }
      );

      const syncBtn = container.querySelector('.collab-sync-btn') as HTMLButtonElement;
      syncBtn.click();
      collab.updateParticipant({
        id: 'host-1',
        displayName: 'Host',
        syncMode: 'host',
        currentTime: 0,
        isPlaying: false,
      });

      collab.updateLocalPlayback({ currentTime: 10 });
      collab.handleRemotePlaybackState('host-1', {
        currentTime: 11,
        isPlaying: false,
        playbackRate: 1,
        timestamp: new Date().toISOString(),
      });

      expect(onSeek).not.toHaveBeenCalled();
    });

    it('reverts to independent when host leaves', () => {
      const onSyncModeChange = vi.fn();
      const collab = new CollaborativeViewing(
        container,
        { videoId: 'v1', currentUserId: 'me', videoDuration: 120 },
        { onSyncModeChange }
      );

      const syncBtn = container.querySelector('.collab-sync-btn') as HTMLButtonElement;
      syncBtn.click();
      collab.updateParticipant({
        id: 'host-1',
        displayName: 'Host',
        syncMode: 'host',
        currentTime: 0,
        isPlaying: false,
      });

      collab.removeParticipant('host-1');
      expect(collab.getSyncMode()).toBe('independent');
    });
  });
});

// ==========================================================================
// Activity Feed Tests
// ==========================================================================

describe('Activity Feed', () => {
  describe('getActivityIcon', () => {
    it('returns comment icon for comment_added', () => {
      expect(getActivityIcon('comment_added')).toBe('💬');
    });

    it('returns reply icon for comment_reply', () => {
      expect(getActivityIcon('comment_reply')).toBe('↩️');
    });

    it('returns video icon for video_uploaded', () => {
      expect(getActivityIcon('video_uploaded')).toBe('📹');
    });

    it('returns folder icon for project_created', () => {
      expect(getActivityIcon('project_created')).toBe('📁');
    });
  });

  describe('formatRelativeTime', () => {
    it('formats recent time as "just now"', () => {
      const now = new Date();
      expect(formatRelativeTime(now.toISOString(), now)).toBe('just now');
    });

    it('formats minutes ago', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 5 * 60000).toISOString();
      expect(formatRelativeTime(past, now)).toBe('5m ago');
    });

    it('formats hours ago', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 3 * 3600000).toISOString();
      expect(formatRelativeTime(past, now)).toBe('3h ago');
    });

    it('formats days ago', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 2 * 86400000).toISOString();
      expect(formatRelativeTime(past, now)).toBe('2d ago');
    });
  });

  describe('groupActivities', () => {
    it('returns empty array for empty input', () => {
      expect(groupActivities([])).toEqual([]);
    });

    it('groups consecutive events from same actor', () => {
      const now = new Date();
      const events = [
        makeActivityEvent({ id: 'e1', actorId: 'u1', createdAt: now.toISOString() }),
        makeActivityEvent({ id: 'e2', actorId: 'u1', createdAt: new Date(now.getTime() - 60000).toISOString() }),
      ];
      const groups = groupActivities(events);
      expect(groups.length).toBe(1);
      expect(groups[0]!.length).toBe(2);
    });

    it('separates events from different actors', () => {
      const now = new Date();
      const events = [
        makeActivityEvent({ id: 'e1', actorId: 'u1', createdAt: now.toISOString() }),
        makeActivityEvent({ id: 'e2', actorId: 'u2', createdAt: new Date(now.getTime() - 60000).toISOString() }),
      ];
      const groups = groupActivities(events);
      expect(groups.length).toBe(2);
    });

    it('splits groups when time gap exceeds window', () => {
      const now = new Date();
      const events = [
        makeActivityEvent({ id: 'e1', actorId: 'u1', createdAt: now.toISOString() }),
        makeActivityEvent({ id: 'e2', actorId: 'u1', createdAt: new Date(now.getTime() - 600000).toISOString() }),
      ];
      const groups = groupActivities(events, 300000);
      expect(groups.length).toBe(2);
    });
  });

  describe('filterActivities', () => {
    it('returns all events when no filter', () => {
      const events = [
        makeActivityEvent({ type: 'comment_added' }),
        makeActivityEvent({ type: 'video_uploaded' }),
      ];
      expect(filterActivities(events)).toEqual(events);
    });

    it('filters to specified types', () => {
      const events = [
        makeActivityEvent({ id: 'e1', type: 'comment_added' }),
        makeActivityEvent({ id: 'e2', type: 'video_uploaded' }),
        makeActivityEvent({ id: 'e3', type: 'comment_reply' }),
      ];
      const result = filterActivities(events, ['comment_added', 'comment_reply']);
      expect(result.length).toBe(2);
      expect(result.every(e => e.type !== 'video_uploaded')).toBe(true);
    });

    it('returns empty when no matches', () => {
      const events = [makeActivityEvent({ type: 'comment_added' })];
      expect(filterActivities(events, ['video_uploaded'])).toEqual([]);
    });
  });

  describe('ActivityFeed component', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = createContainer();
    });

    it('renders with proper ARIA attributes', () => {
      new ActivityFeed(container);
      expect(container.getAttribute('role')).toBe('feed');
      expect(container.getAttribute('aria-label')).toBe('Activity feed');
    });

    it('shows empty message when no events', () => {
      new ActivityFeed(container);
      expect(container.textContent).toContain('No activity yet');
    });

    it('renders activity events', () => {
      const feed = new ActivityFeed(container, { groupByUser: false });
      feed.setEvents([
        makeActivityEvent({ id: 'e1', actorId: 'u1', actorName: 'Alice', description: 'added a comment' }),
        makeActivityEvent({ id: 'e2', actorId: 'u2', actorName: 'Bob', description: 'uploaded a video' }),
      ]);
      expect(container.textContent).toContain('Alice');
      expect(container.textContent).toContain('Bob');
    });

    it('adds new events at the top', () => {
      const feed = new ActivityFeed(container, { groupByUser: false });
      feed.setEvents([
        makeActivityEvent({ id: 'e1', actorName: 'Alice' }),
      ]);
      feed.addEvent(makeActivityEvent({ id: 'e2', actorName: 'Bob', description: 'new action' }));
      const events = feed.getEvents();
      expect(events[0]!.id).toBe('e2');
    });

    it('removes events by ID', () => {
      const feed = new ActivityFeed(container);
      feed.setEvents([
        makeActivityEvent({ id: 'e1', actorId: 'u1' }),
        makeActivityEvent({ id: 'e2', actorId: 'u2' }),
      ]);
      feed.removeEvent('e1');
      expect(feed.getEventCount()).toBe(1);
    });

    it('respects maxItems limit', () => {
      const feed = new ActivityFeed(container, { maxItems: 3 });
      const events = Array.from({ length: 5 }, (_, i) =>
        makeActivityEvent({ id: `e${i}`, actorId: `u${i}` })
      );
      feed.setEvents(events);
      expect(feed.getEvents().length).toBe(3);
    });

    it('filters events by type', () => {
      const feed = new ActivityFeed(container, { visibleTypes: ['comment_added'] });
      feed.setEvents([
        makeActivityEvent({ id: 'e1', type: 'comment_added' }),
        makeActivityEvent({ id: 'e2', type: 'video_uploaded' }),
      ]);
      expect(feed.getEventCount()).toBe(1);
    });

    it('updates filter dynamically', () => {
      const feed = new ActivityFeed(container);
      feed.setEvents([
        makeActivityEvent({ id: 'e1', type: 'comment_added' }),
        makeActivityEvent({ id: 'e2', type: 'video_uploaded' }),
      ]);
      feed.setFilter(['video_uploaded']);
      expect(feed.getEventCount()).toBe(1);
    });

    it('calls onActivityClick when event is clicked', () => {
      const onActivityClick = vi.fn();
      const feed = new ActivityFeed(container, { groupByUser: false }, { onActivityClick });
      const event = makeActivityEvent({ id: 'e1', resourceId: 'res-1' });
      feed.setEvents([event]);

      const item = container.querySelector('[data-activity-id="e1"]') as HTMLElement;
      item.click();
      expect(onActivityClick).toHaveBeenCalledWith(event);
    });

    it('shows load more button when at max capacity', () => {
      const onLoadMore = vi.fn().mockResolvedValue([]);
      const feed = new ActivityFeed(container, { maxItems: 2 }, { onLoadMore });
      feed.setEvents([
        makeActivityEvent({ id: 'e1', actorId: 'u1' }),
        makeActivityEvent({ id: 'e2', actorId: 'u2' }),
      ]);
      const loadMoreBtn = container.querySelector('.activity-feed-load-more');
      expect(loadMoreBtn).not.toBeNull();
    });
  });
});
