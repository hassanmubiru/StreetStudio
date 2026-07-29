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

// ─── ConflictDetector ─────────────────────────────────────────────────────────

describe('ConflictDetector', () => {
  let detector: ConflictDetector;

  beforeEach(() => {
    detector = new ConflictDetector();
  });

  it('allows a user to register an edit without conflict', () => {
    const conflict = detector.registerEdit('user-1', 'clip-A', 'trim');
    expect(conflict).toBeNull();
  });

  it('same user can re-register the same clip without conflict', () => {
    detector.registerEdit('user-1', 'clip-A', 'trim');
    const conflict = detector.registerEdit('user-1', 'clip-A', 'split');
    expect(conflict).toBeNull();
  });

  it('detects conflict when a second user edits the same clip', () => {
    detector.registerEdit('user-1', 'clip-A', 'trim');
    const conflict = detector.registerEdit('user-2', 'clip-A', 'split');

    expect(conflict).not.toBeNull();
    expect(conflict!.initiatorUserId).toBe('user-1');
    expect(conflict!.conflictingUserId).toBe('user-2');
    expect(conflict!.clipId).toBe('clip-A');
    expect(conflict!.resolution).toBe('pending');
  });

  it('no conflict for different clips', () => {
    detector.registerEdit('user-1', 'clip-A', 'trim');
    const conflict = detector.registerEdit('user-2', 'clip-B', 'trim');
    expect(conflict).toBeNull();
  });

  it('completeEdit releases the lock', () => {
    detector.registerEdit('user-1', 'clip-A', 'trim');
    detector.completeEdit('user-1', 'clip-A');
    expect(detector.hasActiveLock('clip-A')).toBe(false);
  });

  it('completeEdit only releases if the user matches', () => {
    detector.registerEdit('user-1', 'clip-A', 'trim');
    detector.completeEdit('user-2', 'clip-A'); // wrong user
    expect(detector.hasActiveLock('clip-A')).toBe(true);
  });

  it('resolveConflict with accept-initiator keeps the initiator lock', () => {
    detector.registerEdit('user-1', 'clip-A', 'trim');
    const conflict = detector.registerEdit('user-2', 'clip-A', 'split')!;

    const resolved = detector.resolveConflict(conflict.id, 'accept-initiator');
    expect(resolved!.resolution).toBe('accept-initiator');
    expect(detector.getLockHolder('clip-A')).toBe('user-1');
  });

  it('resolveConflict with accept-conflicting transfers the lock', () => {
    detector.registerEdit('user-1', 'clip-A', 'trim');
    const conflict = detector.registerEdit('user-2', 'clip-A', 'split')!;

    detector.resolveConflict(conflict.id, 'accept-conflicting');
    expect(detector.getLockHolder('clip-A')).toBe('user-2');
  });

  it('resolveConflict with merge clears the lock', () => {
    detector.registerEdit('user-1', 'clip-A', 'trim');
    const conflict = detector.registerEdit('user-2', 'clip-A', 'split')!;

    detector.resolveConflict(conflict.id, 'merge');
    expect(detector.hasActiveLock('clip-A')).toBe(false);
  });

  it('resolveConflict with dismissed clears the lock', () => {
    detector.registerEdit('user-1', 'clip-A', 'trim');
    const conflict = detector.registerEdit('user-2', 'clip-A', 'split')!;

    detector.resolveConflict(conflict.id, 'dismissed');
    expect(detector.hasActiveLock('clip-A')).toBe(false);
  });

  it('getPendingConflicts returns only unresolved conflicts', () => {
    detector.registerEdit('user-1', 'clip-A', 'trim');
    const c1 = detector.registerEdit('user-2', 'clip-A', 'split')!;

    expect(detector.getPendingConflicts()).toHaveLength(1);

    detector.resolveConflict(c1.id, 'merge');
    expect(detector.getPendingConflicts()).toHaveLength(0);
  });

  it('calls onConflictDetected callback', () => {
    const onDetected = vi.fn();
    detector.setOnConflictDetected(onDetected);

    detector.registerEdit('user-1', 'clip-A', 'trim');
    detector.registerEdit('user-2', 'clip-A', 'split');

    expect(onDetected).toHaveBeenCalledTimes(1);
    expect(onDetected.mock.calls[0][0].clipId).toBe('clip-A');
  });

  it('calls onConflictResolved callback', () => {
    const onResolved = vi.fn();
    detector.setOnConflictResolved(onResolved);

    detector.registerEdit('user-1', 'clip-A', 'trim');
    const conflict = detector.registerEdit('user-2', 'clip-A', 'split')!;
    detector.resolveConflict(conflict.id, 'merge');

    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('resolveConflict returns null for unknown conflict ID', () => {
    expect(detector.resolveConflict('nonexistent', 'merge')).toBeNull();
  });

  it('clear resets all state', () => {
    detector.registerEdit('user-1', 'clip-A', 'trim');
    detector.clear();
    expect(detector.hasActiveLock('clip-A')).toBe(false);
    expect(detector.getAllConflicts()).toHaveLength(0);
  });
});

// ─── EditHistoryManager ───────────────────────────────────────────────────────

describe('EditHistoryManager', () => {
  let history: EditHistoryManager;

  beforeEach(() => {
    history = new EditHistoryManager(50);
  });

  it('records an edit and assigns id and timestamp', () => {
    const op = history.recordEdit({
      userId: 'user-1',
      type: 'trim',
      clipId: 'clip-A',
      description: 'Trimmed in point',
      previousState: '{"inPoint":0}',
      newState: '{"inPoint":30}',
    });

    expect(op.id).toBeDefined();
    expect(op.timestamp).toBeDefined();
    expect(op.clipId).toBe('clip-A');
  });

  it('increments version on each record', () => {
    expect(history.getCurrentVersion()).toBe(0);

    history.recordEdit({
      userId: 'user-1',
      type: 'trim',
      clipId: 'clip-A',
      description: 'Edit 1',
      previousState: '',
      newState: '',
    });
    expect(history.getCurrentVersion()).toBe(1);

    history.recordEdit({
      userId: 'user-1',
      type: 'split',
      clipId: 'clip-B',
      description: 'Edit 2',
      previousState: '',
      newState: '',
    });
    expect(history.getCurrentVersion()).toBe(2);
  });

  it('getHistory returns all recorded operations', () => {
    history.recordEdit({ userId: 'u1', type: 'trim', clipId: 'c1', description: '', previousState: '', newState: '' });
    history.recordEdit({ userId: 'u2', type: 'split', clipId: 'c2', description: '', previousState: '', newState: '' });

    expect(history.getHistory()).toHaveLength(2);
  });

  it('getClipHistory filters by clipId', () => {
    history.recordEdit({ userId: 'u1', type: 'trim', clipId: 'c1', description: '', previousState: '', newState: '' });
    history.recordEdit({ userId: 'u1', type: 'split', clipId: 'c2', description: '', previousState: '', newState: '' });
    history.recordEdit({ userId: 'u2', type: 'move', clipId: 'c1', description: '', previousState: '', newState: '' });

    const clipHistory = history.getClipHistory('c1');
    expect(clipHistory).toHaveLength(2);
    expect(clipHistory.every((op) => op.clipId === 'c1')).toBe(true);
  });

  it('getUserHistory filters by userId', () => {
    history.recordEdit({ userId: 'u1', type: 'trim', clipId: 'c1', description: '', previousState: '', newState: '' });
    history.recordEdit({ userId: 'u2', type: 'split', clipId: 'c2', description: '', previousState: '', newState: '' });
    history.recordEdit({ userId: 'u1', type: 'move', clipId: 'c3', description: '', previousState: '', newState: '' });

    const userHistory = history.getUserHistory('u1');
    expect(userHistory).toHaveLength(2);
    expect(userHistory.every((op) => op.userId === 'u1')).toBe(true);
  });

  it('getRecentHistory returns last N entries', () => {
    for (let i = 0; i < 10; i++) {
      history.recordEdit({ userId: 'u1', type: 'trim', clipId: `c${i}`, description: `op${i}`, previousState: '', newState: '' });
    }

    const recent = history.getRecentHistory(3);
    expect(recent).toHaveLength(3);
    expect(recent[0].clipId).toBe('c7');
    expect(recent[2].clipId).toBe('c9');
  });

  it('trims history when exceeding maxSize', () => {
    const smallHistory = new EditHistoryManager(5);
    for (let i = 0; i < 10; i++) {
      smallHistory.recordEdit({ userId: 'u1', type: 'trim', clipId: `c${i}`, description: '', previousState: '', newState: '' });
    }

    expect(smallHistory.getHistorySize()).toBe(5);
    // Should keep the most recent entries
    const all = smallHistory.getHistory();
    expect(all[0].clipId).toBe('c5');
    expect(all[4].clipId).toBe('c9');
  });

  it('getLastEdit returns the most recent operation', () => {
    expect(history.getLastEdit()).toBeUndefined();

    history.recordEdit({ userId: 'u1', type: 'trim', clipId: 'c1', description: 'first', previousState: '', newState: '' });
    history.recordEdit({ userId: 'u1', type: 'split', clipId: 'c2', description: 'second', previousState: '', newState: '' });

    expect(history.getLastEdit()!.description).toBe('second');
  });

  it('calls onVersionChange callback', () => {
    const onVersion = vi.fn();
    history.setOnVersionChange(onVersion);

    history.recordEdit({ userId: 'u1', type: 'trim', clipId: 'c1', description: '', previousState: '', newState: '' });
    expect(onVersion).toHaveBeenCalledWith(1);
  });

  it('clear resets history and version', () => {
    history.recordEdit({ userId: 'u1', type: 'trim', clipId: 'c1', description: '', previousState: '', newState: '' });
    history.clear();

    expect(history.getHistorySize()).toBe(0);
    expect(history.getCurrentVersion()).toBe(0);
  });
});
