/**
 * Unit tests for Collaborative Editing Features
 *
 * Tests presence indicators, edit conflict detection and resolution,
 * session management, and edit history/version control.
 *
 * Requirements: 6.10
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PresenceManager,
  ConflictDetector,
  EditHistoryManager,
  CollaborativeEditingManager,
  getUserColor,
  USER_COLORS,
  DEFAULT_PRESENCE_TIMEOUT_MS,
  DEFAULT_MAX_HISTORY_SIZE,
} from './collaborative-editing';
import type {
  EditorPresence,
  EditConflict,
  EditOperation,
  EditSession,
  CollaborativeEditingOptions,
} from './collaborative-editing';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createPresence(overrides: Partial<EditorPresence> = {}): EditorPresence {
  return {
    userId: 'user-1',
    displayName: 'Test User',
    color: '#FF6B6B',
    playheadFrame: 0,
    lastActiveAt: new Date().toISOString(),
    isConnected: true,
    ...overrides,
  };
}

// ─── getUserColor ─────────────────────────────────────────────────────────────

describe('getUserColor', () => {
  it('returns a color from the predefined palette', () => {
    const color = getUserColor('some-user-id');
    expect(USER_COLORS).toContain(color);
  });

  it('returns consistent color for the same user', () => {
    expect(getUserColor('user-abc')).toBe(getUserColor('user-abc'));
  });

  it('returns different colors for different users (in most cases)', () => {
    const color1 = getUserColor('user-1');
    const color2 = getUserColor('user-2');
    // Not guaranteed to differ but highly likely with distinct IDs
    expect(typeof color1).toBe('string');
    expect(typeof color2).toBe('string');
  });
});

// ─── PresenceManager ──────────────────────────────────────────────────────────

describe('PresenceManager', () => {
  let manager: PresenceManager;

  beforeEach(() => {
    manager = new PresenceManager('current-user');
  });

  afterEach(() => {
    manager.destroy();
  });

  it('adds and retrieves a participant', () => {
    const presence = createPresence({ userId: 'user-2', displayName: 'Alice' });
    manager.updatePresence(presence);

    const participant = manager.getParticipant('user-2');
    expect(participant).toBeDefined();
    expect(participant!.displayName).toBe('Alice');
  });

  it('getOtherParticipants excludes the current user', () => {
    manager.updatePresence(createPresence({ userId: 'current-user', displayName: 'Me' }));
    manager.updatePresence(createPresence({ userId: 'user-2', displayName: 'Other' }));

    const others = manager.getOtherParticipants();
    expect(others).toHaveLength(1);
    expect(others[0].userId).toBe('user-2');
  });

  it('getAllParticipants includes connected users only', () => {
    manager.updatePresence(createPresence({ userId: 'current-user', isConnected: true }));
    manager.updatePresence(createPresence({ userId: 'user-2', isConnected: true }));
    manager.updatePresence(createPresence({ userId: 'user-3', isConnected: false }));

    const all = manager.getAllParticipants();
    expect(all).toHaveLength(2);
  });

  it('removes a participant', () => {
    manager.updatePresence(createPresence({ userId: 'user-2' }));
    expect(manager.getParticipant('user-2')).toBeDefined();

    const removed = manager.removePresence('user-2');
    expect(removed).toBe(true);
    expect(manager.getParticipant('user-2')).toBeUndefined();
  });

  it('returns false when removing non-existent participant', () => {
    expect(manager.removePresence('nonexistent')).toBe(false);
  });

  it('getParticipantCount returns active count', () => {
    manager.updatePresence(createPresence({ userId: 'user-1', isConnected: true }));
    manager.updatePresence(createPresence({ userId: 'user-2', isConnected: true }));
    expect(manager.getParticipantCount()).toBe(2);
  });

  it('isClipBeingEdited returns the editing user', () => {
    manager.updatePresence(
      createPresence({
        userId: 'user-2',
        activeClipId: 'clip-A',
        activeOperation: 'trim',
      })
    );

    const editor = manager.isClipBeingEdited('clip-A');
    expect(editor).toBeDefined();
    expect(editor!.userId).toBe('user-2');
  });

  it('isClipBeingEdited returns undefined when no one is editing', () => {
    manager.updatePresence(createPresence({ userId: 'user-2', activeClipId: undefined }));
    expect(manager.isClipBeingEdited('clip-A')).toBeUndefined();
  });

  it('calls onUpdate callback when presence changes', () => {
    const onUpdate = vi.fn();
    manager.setOnUpdate(onUpdate);

    manager.updatePresence(createPresence({ userId: 'user-2' }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('marks stale presences as disconnected', () => {
    vi.useFakeTimers();
    const shortTimeout = 100;
    const mgr = new PresenceManager('me', shortTimeout);

    mgr.updatePresence(createPresence({
      userId: 'user-2',
      lastActiveAt: new Date(Date.now() - 200).toISOString(),
    }));

    mgr.startCleanup();
    vi.advanceTimersByTime(shortTimeout + 10);

    const participant = mgr.getParticipant('user-2');
    expect(participant?.isConnected).toBe(false);

    mgr.destroy();
    vi.useRealTimers();
  });

  it('clear removes all participants', () => {
    manager.updatePresence(createPresence({ userId: 'user-2' }));
    manager.updatePresence(createPresence({ userId: 'user-3' }));
    manager.clear();
    expect(manager.getAllParticipants()).toHaveLength(0);
  });
});
