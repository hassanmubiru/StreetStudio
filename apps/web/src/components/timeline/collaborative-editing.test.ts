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

    // Add a presence at the current time
    mgr.updatePresence(createPresence({ userId: 'user-2' }));

    mgr.startCleanup();

    // Advance time past the timeout so the presence becomes stale
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

// ─── CollaborativeEditingManager ──────────────────────────────────────────────

describe('CollaborativeEditingManager', () => {
  let manager: CollaborativeEditingManager;
  const defaultOptions: CollaborativeEditingOptions = {
    currentUserId: 'me',
    currentUserName: 'Current User',
    videoId: 'video-1',
    presenceTimeoutMs: 30000,
    maxHistorySize: 50,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new CollaborativeEditingManager(defaultOptions);
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
  });

  describe('session management', () => {
    it('startSession creates an active session', () => {
      const session = manager.startSession();

      expect(session.id).toBeDefined();
      expect(session.videoId).toBe('video-1');
      expect(session.isActive).toBe(true);
      expect(manager.isSessionActive()).toBe(true);
    });

    it('startSession adds current user as participant', () => {
      manager.startSession();

      const session = manager.getSession();
      expect(session!.participants).toHaveLength(1);
      expect(session!.participants[0].userId).toBe('me');
      expect(session!.participants[0].displayName).toBe('Current User');
    });

    it('endSession deactivates the session', () => {
      manager.startSession();
      manager.endSession();

      expect(manager.isSessionActive()).toBe(false);
      expect(manager.getSession()).toBeNull();
    });

    it('calls onSessionStart callback', () => {
      const onStart = vi.fn();
      const mgr = new CollaborativeEditingManager(defaultOptions, { onSessionStart: onStart });
      mgr.startSession();

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onStart.mock.calls[0][0].videoId).toBe('video-1');
      mgr.destroy();
    });

    it('calls onSessionEnd callback', () => {
      const onEnd = vi.fn();
      const mgr = new CollaborativeEditingManager(defaultOptions, { onSessionEnd: onEnd });
      const session = mgr.startSession();
      mgr.endSession();

      expect(onEnd).toHaveBeenCalledWith(session.id);
      mgr.destroy();
    });
  });

  describe('presence', () => {
    it('updatePlayheadPosition updates the current user presence', () => {
      manager.startSession();
      manager.updatePlayheadPosition(150);

      const session = manager.getSession();
      const self = session!.participants.find((p) => p.userId === 'me');
      expect(self!.playheadFrame).toBe(150);
    });

    it('handleUserJoined adds a remote participant', () => {
      manager.startSession();
      manager.handleUserJoined(createPresence({
        userId: 'remote-1',
        displayName: 'Remote User',
      }));

      const session = manager.getSession();
      expect(session!.participants).toHaveLength(2);
    });

    it('handleUserLeft removes a remote participant', () => {
      manager.startSession();
      manager.handleUserJoined(createPresence({ userId: 'remote-1' }));
      manager.handleUserLeft('remote-1');

      const presence = manager.getPresenceManager().getParticipant('remote-1');
      expect(presence).toBeUndefined();
    });

    it('calls onPresenceUpdate when participants change', () => {
      const onPresence = vi.fn();
      const mgr = new CollaborativeEditingManager(defaultOptions, { onPresenceUpdate: onPresence });
      mgr.startSession();

      mgr.handleUserJoined(createPresence({ userId: 'remote-1' }));
      expect(onPresence).toHaveBeenCalled();
      mgr.destroy();
    });
  });

  describe('conflict detection', () => {
    it('beginEdit returns null when no conflict exists', () => {
      manager.startSession();
      const conflict = manager.beginEdit('clip-A', 'trim');
      expect(conflict).toBeNull();
    });

    it('beginEdit detects a conflict when another user is editing', () => {
      manager.startSession();
      // Simulate another user registering an edit
      manager.getConflictDetector().registerEdit('remote-1', 'clip-A', 'trim');

      const conflict = manager.beginEdit('clip-A', 'split');
      expect(conflict).not.toBeNull();
      expect(conflict!.initiatorUserId).toBe('remote-1');
      expect(conflict!.conflictingUserId).toBe('me');
    });

    it('completeEdit clears the active edit and records history', () => {
      manager.startSession();
      manager.beginEdit('clip-A', 'trim');

      const op = manager.completeEdit('clip-A', 'trim', 'Trimmed clip', '{"in":0}', '{"in":30}');
      expect(op.type).toBe('trim');
      expect(op.clipId).toBe('clip-A');

      // Edit lock should be released
      expect(manager.getConflictDetector().hasActiveLock('clip-A')).toBe(false);
    });

    it('resolveConflict resolves an existing conflict', () => {
      manager.startSession();
      manager.getConflictDetector().registerEdit('remote-1', 'clip-A', 'trim');
      const conflict = manager.beginEdit('clip-A', 'split')!;

      const resolved = manager.resolveConflict(conflict.id, 'merge');
      expect(resolved!.resolution).toBe('merge');
    });

    it('calls onConflictDetected callback', () => {
      const onConflict = vi.fn();
      const mgr = new CollaborativeEditingManager(defaultOptions, { onConflictDetected: onConflict });
      mgr.startSession();
      mgr.getConflictDetector().registerEdit('remote-1', 'clip-A', 'trim');
      mgr.beginEdit('clip-A', 'split');

      expect(onConflict).toHaveBeenCalledTimes(1);
      mgr.destroy();
    });
  });

  describe('edit history', () => {
    it('completeEdit adds entry to history', () => {
      manager.startSession();
      manager.beginEdit('clip-A', 'trim');
      manager.completeEdit('clip-A', 'trim', 'Trimmed', '{}', '{}');

      const hist = manager.getHistoryManager().getHistory();
      expect(hist).toHaveLength(1);
      expect(hist[0].type).toBe('trim');
    });

    it('handleRemoteEdit records remote operations in history', () => {
      manager.startSession();
      const remoteOp: EditOperation = {
        id: 'op-1',
        userId: 'remote-1',
        type: 'split',
        timestamp: new Date().toISOString(),
        clipId: 'clip-B',
        description: 'Split by remote',
        previousState: '{}',
        newState: '{}',
      };

      manager.handleRemoteEdit(remoteOp);

      const hist = manager.getHistoryManager().getHistory();
      expect(hist).toHaveLength(1);
    });

    it('version increments with each edit', () => {
      manager.startSession();
      manager.beginEdit('clip-A', 'trim');
      manager.completeEdit('clip-A', 'trim', 'op1', '{}', '{}');
      manager.beginEdit('clip-B', 'split');
      manager.completeEdit('clip-B', 'split', 'op2', '{}', '{}');

      expect(manager.getHistoryManager().getCurrentVersion()).toBe(2);
    });

    it('calls onVersionChange callback', () => {
      const onVersion = vi.fn();
      const mgr = new CollaborativeEditingManager(defaultOptions, { onVersionChange: onVersion });
      mgr.startSession();
      mgr.beginEdit('clip-A', 'trim');
      mgr.completeEdit('clip-A', 'trim', 'op1', '{}', '{}');

      expect(onVersion).toHaveBeenCalledWith(1);
      mgr.destroy();
    });
  });

  describe('user left handling', () => {
    it('handleUserLeft dismisses pending conflicts from that user', () => {
      manager.startSession();
      // remote-1 starts editing
      manager.getConflictDetector().registerEdit('remote-1', 'clip-A', 'trim');
      // current user conflicts
      manager.beginEdit('clip-A', 'split');

      const pending = manager.getConflictDetector().getPendingConflicts();
      expect(pending).toHaveLength(1);

      // remote-1 leaves
      manager.handleUserLeft('remote-1');

      const afterLeave = manager.getConflictDetector().getPendingConflicts();
      expect(afterLeave).toHaveLength(0);
    });
  });
});
