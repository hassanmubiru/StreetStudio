/**
 * Unit tests for Comment System Interface
 *
 * Tests timestamped comment input, threaded comment display,
 * timeline comment markers, and moderation tools.
 *
 * Requirements: 5.5, 5.6, 7.5
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  formatTimestamp,
  buildCommentTree,
  getCommentMarkerPositions,
  CommentInput,
  ThreadedCommentDisplay,
  TimelineCommentMarkers,
  CommentModerationTools,
  CommentSystem,
} from './comment-system';
import type {
  Comment,
  CommentAuthor,
  CommentSystemCallbacks,
  CommentSystemOptions,
  CommentWithState,
  Uuid,
} from './comment-system';

// --------------------------------------------------------------------------
// Test helpers
// --------------------------------------------------------------------------

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'comment-1',
    videoId: 'video-1',
    authorId: 'user-1',
    body: 'Test comment',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeAuthorMap(...authors: CommentAuthor[]): Map<Uuid, CommentAuthor> {
  const map = new Map<Uuid, CommentAuthor>();
  for (const a of authors) map.set(a.id, a);
  return map;
}

const defaultOptions: CommentSystemOptions = {
  videoId: 'video-1',
  videoDuration: 120,
  currentUserId: 'user-1',
  isAdmin: false,
  currentTime: 30,
};

const adminOptions: CommentSystemOptions = {
  ...defaultOptions,
  isAdmin: true,
};

function defaultCallbacks(): CommentSystemCallbacks {
  return {
    onSubmit: vi.fn().mockResolvedValue(makeComment()),
    onDelete: vi.fn().mockResolvedValue(true),
    onModerate: vi.fn().mockResolvedValue(true),
    onSeek: vi.fn(),
    onMention: vi.fn().mockResolvedValue([]),
  };
}

// --------------------------------------------------------------------------
// formatTimestamp
// --------------------------------------------------------------------------

describe('formatTimestamp', () => {
  it('formats 0 seconds as 0:00', () => {
    expect(formatTimestamp(0)).toBe('0:00');
  });

  it('formats seconds under a minute', () => {
    expect(formatTimestamp(45)).toBe('0:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatTimestamp(90)).toBe('1:30');
  });

  it('formats hours, minutes, seconds', () => {
    expect(formatTimestamp(3661)).toBe('1:01:01');
  });

  it('handles negative as 0:00', () => {
    expect(formatTimestamp(-10)).toBe('0:00');
  });

  it('handles NaN as 0:00', () => {
    expect(formatTimestamp(NaN)).toBe('0:00');
  });
});
