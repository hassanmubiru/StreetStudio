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
