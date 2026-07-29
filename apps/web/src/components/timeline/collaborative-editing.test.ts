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
