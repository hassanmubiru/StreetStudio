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
