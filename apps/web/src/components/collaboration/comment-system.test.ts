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

// --------------------------------------------------------------------------
// buildCommentTree
// --------------------------------------------------------------------------

describe('buildCommentTree', () => {
  it('returns empty array for no comments', () => {
    const tree = buildCommentTree([], new Map());
    expect(tree).toEqual([]);
  });

  it('builds flat list for top-level comments', () => {
    const comments = [
      makeComment({ id: 'c1', createdAt: '2024-01-01T00:00:00Z' }),
      makeComment({ id: 'c2', createdAt: '2024-01-02T00:00:00Z' }),
    ];
    const tree = buildCommentTree(comments, new Map());
    expect(tree.length).toBe(2);
    // Sorted newest first
    expect(tree[0].id).toBe('c2');
    expect(tree[1].id).toBe('c1');
  });

  it('nests replies under parent comments', () => {
    const comments = [
      makeComment({ id: 'c1', createdAt: '2024-01-01T00:00:00Z' }),
      makeComment({ id: 'c2', parentCommentId: 'c1', createdAt: '2024-01-01T01:00:00Z' }),
      makeComment({ id: 'c3', parentCommentId: 'c1', createdAt: '2024-01-01T02:00:00Z' }),
    ];
    const tree = buildCommentTree(comments, new Map());
    expect(tree.length).toBe(1);
    expect(tree[0].id).toBe('c1');
    expect(tree[0].replies.length).toBe(2);
  });

  it('attaches author information from the map', () => {
    const comments = [makeComment({ id: 'c1', authorId: 'user-1' })];
    const authors = makeAuthorMap({ id: 'user-1', displayName: 'Alice' });
    const tree = buildCommentTree(comments, authors);
    expect(tree[0].author?.displayName).toBe('Alice');
  });

  it('handles orphan replies as top-level', () => {
    const comments = [
      makeComment({ id: 'c1', parentCommentId: 'nonexistent' }),
    ];
    const tree = buildCommentTree(comments, new Map());
    expect(tree.length).toBe(1);
    expect(tree[0].id).toBe('c1');
  });
});

// --------------------------------------------------------------------------
// getCommentMarkerPositions
// --------------------------------------------------------------------------

describe('getCommentMarkerPositions', () => {
  it('returns empty for no comments', () => {
    expect(getCommentMarkerPositions([], 120)).toEqual([]);
  });

  it('returns empty for zero duration', () => {
    const comments = [makeComment({ timestampSeconds: 30 })];
    expect(getCommentMarkerPositions(comments, 0)).toEqual([]);
  });

  it('calculates percentage positions correctly', () => {
    const comments = [
      makeComment({ id: 'c1', timestampSeconds: 60 }),
      makeComment({ id: 'c2', timestampSeconds: 30 }),
    ];
    const markers = getCommentMarkerPositions(comments, 120);
    expect(markers.length).toBe(2);
    expect(markers[0].position).toBe(50); // 60/120 * 100
    expect(markers[1].position).toBe(25); // 30/120 * 100
  });

  it('skips comments without timestamps', () => {
    const comments = [
      makeComment({ id: 'c1', timestampSeconds: 30 }),
      makeComment({ id: 'c2', timestampSeconds: undefined }),
    ];
    const markers = getCommentMarkerPositions(comments, 120);
    expect(markers.length).toBe(1);
    expect(markers[0].commentId).toBe('c1');
  });

  it('caps position at 100%', () => {
    const comments = [makeComment({ id: 'c1', timestampSeconds: 200 })];
    const markers = getCommentMarkerPositions(comments, 120);
    expect(markers[0].position).toBe(100);
  });
});

// --------------------------------------------------------------------------
// CommentInput
// --------------------------------------------------------------------------

describe('CommentInput', () => {
  let container: HTMLElement;
  let callbacks: CommentSystemCallbacks;

  beforeEach(() => {
    container = createContainer();
    callbacks = defaultCallbacks();
  });

  it('renders comment input form with textarea and controls', () => {
    new CommentInput(container, defaultOptions, callbacks);
    expect(container.querySelector('.comment-textarea')).not.toBeNull();
    expect(container.querySelector('.comment-submit-btn')).not.toBeNull();
    expect(container.querySelector('.timestamp-toggle')).not.toBeNull();
  });

  it('has proper accessibility attributes', () => {
    new CommentInput(container, defaultOptions, callbacks);
    expect(container.getAttribute('role')).toBe('form');
    expect(container.getAttribute('aria-label')).toBe('Add comment');
    expect(container.querySelector('.comment-textarea')?.getAttribute('aria-label')).toBe('Comment text');
  });

  it('submit button is disabled when textarea is empty', () => {
    new CommentInput(container, defaultOptions, callbacks);
    const btn = container.querySelector('.comment-submit-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('submit button enables when text is entered', () => {
    new CommentInput(container, defaultOptions, callbacks);
    const textarea = container.querySelector('.comment-textarea') as HTMLTextAreaElement;
    const btn = container.querySelector('.comment-submit-btn') as HTMLButtonElement;
    textarea.value = 'Hello';
    textarea.dispatchEvent(new Event('input'));
    expect(btn.disabled).toBe(false);
  });

  it('displays current timestamp', () => {
    new CommentInput(container, { ...defaultOptions, currentTime: 90 }, callbacks);
    const display = container.querySelector('.timestamp-display');
    expect(display?.textContent).toBe('1:30');
  });

  it('toggles timestamp inclusion', () => {
    new CommentInput(container, defaultOptions, callbacks);
    const toggle = container.querySelector('.timestamp-toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    toggle.click();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onSubmit with correct input including timestamp', async () => {
    new CommentInput(container, { ...defaultOptions, currentTime: 45 }, callbacks);
    const textarea = container.querySelector('.comment-textarea') as HTMLTextAreaElement;
    const btn = container.querySelector('.comment-submit-btn') as HTMLButtonElement;

    textarea.value = 'Great video!';
    textarea.dispatchEvent(new Event('input'));
    btn.click();

    await vi.waitFor(() => {
      expect(callbacks.onSubmit).toHaveBeenCalledWith({
        body: 'Great video!',
        parentCommentId: undefined,
        timestampSeconds: 45,
      });
    });
  });

  it('clears textarea after successful submit', async () => {
    new CommentInput(container, defaultOptions, callbacks);
    const textarea = container.querySelector('.comment-textarea') as HTMLTextAreaElement;
    const btn = container.querySelector('.comment-submit-btn') as HTMLButtonElement;

    textarea.value = 'Hello world';
    textarea.dispatchEvent(new Event('input'));
    btn.click();

    await vi.waitFor(() => {
      expect(textarea.value).toBe('');
    });
  });

  it('sets reply-to state and shows indicator', () => {
    const input = new CommentInput(container, defaultOptions, callbacks);
    input.setReplyTo('comment-2', 'Bob');
    const indicator = container.querySelector('.comment-reply-indicator') as HTMLElement;
    expect(indicator.style.display).toBe('flex');
    expect(indicator.textContent).toContain('Bob');
  });

  it('updates current time via updateCurrentTime', () => {
    const input = new CommentInput(container, defaultOptions, callbacks);
    input.updateCurrentTime(75);
    const display = container.querySelector('.timestamp-display');
    expect(display?.textContent).toBe('1:15');
  });
});

// --------------------------------------------------------------------------
// ThreadedCommentDisplay
// --------------------------------------------------------------------------

describe('ThreadedCommentDisplay', () => {
  let container: HTMLElement;
  let callbacks: CommentSystemCallbacks;

  beforeEach(() => {
    container = createContainer();
    callbacks = defaultCallbacks();
  });

  it('shows empty message when no comments', () => {
    const display = new ThreadedCommentDisplay(container, defaultOptions, callbacks);
    display.setComments([]);
    expect(container.textContent).toContain('No comments yet');
  });

  it('renders comments with author names', () => {
    const display = new ThreadedCommentDisplay(container, defaultOptions, callbacks);
    const comments: CommentWithState[] = [
      {
        ...makeComment({ id: 'c1' }),
        status: 'visible',
        author: { id: 'user-1', displayName: 'Alice' },
        replies: [],
        isCollapsed: false,
      },
    ];
    display.setComments(comments);
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Test comment');
  });

  it('renders timestamp badges that call onSeek', () => {
    const display = new ThreadedCommentDisplay(container, defaultOptions, callbacks);
    const comments: CommentWithState[] = [
      {
        ...makeComment({ id: 'c1', timestampSeconds: 60 }),
        status: 'visible',
        author: { id: 'user-1', displayName: 'Alice' },
        replies: [],
        isCollapsed: false,
      },
    ];
    display.setComments(comments);
    const badge = container.querySelector('.comment-timestamp-badge') as HTMLButtonElement;
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('1:00');
    badge.click();
    expect(callbacks.onSeek).toHaveBeenCalledWith(60);
  });

  it('renders nested replies with indentation', () => {
    const display = new ThreadedCommentDisplay(container, defaultOptions, callbacks);
    const comments: CommentWithState[] = [
      {
        ...makeComment({ id: 'c1' }),
        status: 'visible',
        author: { id: 'user-1', displayName: 'Alice' },
        replies: [
          {
            ...makeComment({ id: 'c2', parentCommentId: 'c1', body: 'Reply here' }),
            status: 'visible',
            author: { id: 'user-2', displayName: 'Bob' },
            replies: [],
            isCollapsed: false,
          },
        ],
        isCollapsed: false,
      },
    ];
    display.setComments(comments);
    const items = container.querySelectorAll('.comment-item');
    expect(items.length).toBe(2);
    expect((items[1] as HTMLElement).style.marginLeft).toBe('24px');
  });

  it('shows reply button that triggers onReply callback', () => {
    const onReply = vi.fn();
    const display = new ThreadedCommentDisplay(container, defaultOptions, callbacks, onReply);
    const comments: CommentWithState[] = [
      {
        ...makeComment({ id: 'c1' }),
        status: 'visible',
        author: { id: 'user-1', displayName: 'Alice' },
        replies: [],
        isCollapsed: false,
      },
    ];
    display.setComments(comments);
    const replyBtn = container.querySelector('.comment-action-btn') as HTMLButtonElement;
    replyBtn.click();
    expect(onReply).toHaveBeenCalledWith('c1', 'Alice');
  });

  it('shows delete button for own comments', () => {
    const display = new ThreadedCommentDisplay(container, defaultOptions, callbacks);
    const comments: CommentWithState[] = [
      {
        ...makeComment({ id: 'c1', authorId: 'user-1' }),
        status: 'visible',
        author: { id: 'user-1', displayName: 'Me' },
        replies: [],
        isCollapsed: false,
      },
    ];
    display.setComments(comments);
    const deleteBtn = container.querySelector('.comment-delete-btn');
    expect(deleteBtn).not.toBeNull();
  });

  it('shows moderation button for admins', () => {
    const display = new ThreadedCommentDisplay(container, adminOptions, callbacks);
    const comments: CommentWithState[] = [
      {
        ...makeComment({ id: 'c1', authorId: 'user-2' }),
        status: 'visible',
        author: { id: 'user-2', displayName: 'Other' },
        replies: [],
        isCollapsed: false,
      },
    ];
    display.setComments(comments);
    const modBtn = container.querySelector('.comment-moderate-btn');
    expect(modBtn).not.toBeNull();
  });

  it('hides moderation button for non-admins', () => {
    const display = new ThreadedCommentDisplay(container, defaultOptions, callbacks);
    const comments: CommentWithState[] = [
      {
        ...makeComment({ id: 'c1', authorId: 'user-2' }),
        status: 'visible',
        author: { id: 'user-2', displayName: 'Other' },
        replies: [],
        isCollapsed: false,
      },
    ];
    display.setComments(comments);
    const modBtn = container.querySelector('.comment-moderate-btn');
    expect(modBtn).toBeNull();
  });
});

// --------------------------------------------------------------------------
// TimelineCommentMarkers
// --------------------------------------------------------------------------

describe('TimelineCommentMarkers', () => {
  let container: HTMLElement;
  let callbacks: CommentSystemCallbacks;

  beforeEach(() => {
    container = createContainer();
    callbacks = defaultCallbacks();
  });

  it('renders markers for timestamped comments', () => {
    const markers = new TimelineCommentMarkers(container, 120, callbacks);
    markers.setComments([
      makeComment({ id: 'c1', timestampSeconds: 30 }),
      makeComment({ id: 'c2', timestampSeconds: 90 }),
    ]);
    const markerEls = container.querySelectorAll('.comment-marker');
    expect(markerEls.length).toBe(2);
  });

  it('positions markers based on percentage of duration', () => {
    const markers = new TimelineCommentMarkers(container, 100, callbacks);
    markers.setComments([makeComment({ id: 'c1', timestampSeconds: 50 })]);
    const el = container.querySelector('.comment-marker') as HTMLElement;
    expect(el.style.left).toBe('50%');
  });

  it('calls onSeek when marker is clicked', () => {
    const markers = new TimelineCommentMarkers(container, 120, callbacks);
    markers.setComments([makeComment({ id: 'c1', timestampSeconds: 60 })]);
    const el = container.querySelector('.comment-marker') as HTMLButtonElement;
    el.click();
    expect(callbacks.onSeek).toHaveBeenCalledWith(60);
  });

  it('has proper accessibility attributes on markers', () => {
    const markers = new TimelineCommentMarkers(container, 120, callbacks);
    markers.setComments([makeComment({ id: 'c1', timestampSeconds: 30 })]);
    const el = container.querySelector('.comment-marker') as HTMLElement;
    expect(el.getAttribute('aria-label')).toContain('Comment at 0:30');
  });

  it('highlights active marker', () => {
    const markers = new TimelineCommentMarkers(container, 120, callbacks);
    markers.setComments([
      makeComment({ id: 'c1', timestampSeconds: 30 }),
      makeComment({ id: 'c2', timestampSeconds: 60 }),
    ]);
    markers.setActiveMarker('c1');
    const el = container.querySelector('[data-comment-id="c1"]') as HTMLElement;
    expect(el.style.backgroundColor).toContain('3b82f6');
  });

  it('skips comments without timestamps', () => {
    const markers = new TimelineCommentMarkers(container, 120, callbacks);
    markers.setComments([
      makeComment({ id: 'c1', timestampSeconds: 30 }),
      makeComment({ id: 'c2' }), // no timestamp
    ]);
    const markerEls = container.querySelectorAll('.comment-marker');
    expect(markerEls.length).toBe(1);
  });
});

// --------------------------------------------------------------------------
// CommentModerationTools
// --------------------------------------------------------------------------

describe('CommentModerationTools', () => {
  let container: HTMLElement;
  let callbacks: CommentSystemCallbacks;

  beforeEach(() => {
    container = createContainer();
    callbacks = defaultCallbacks();
  });

  it('renders moderation toolbar with stats', () => {
    const tools = new CommentModerationTools(container, callbacks);
    tools.updateStats({ total: 10, visible: 7, hidden: 2, pinned: 1, deleted: 0 });
    expect(container.textContent).toContain('All: 10');
    expect(container.textContent).toContain('Visible: 7');
    expect(container.textContent).toContain('Hidden: 2');
    expect(container.textContent).toContain('Pinned: 1');
  });

  it('has proper accessibility attributes', () => {
    new CommentModerationTools(container, callbacks);
    expect(container.getAttribute('role')).toBe('toolbar');
    expect(container.getAttribute('aria-label')).toBe('Comment moderation tools');
  });

  it('renders filter buttons', () => {
    new CommentModerationTools(container, callbacks);
    const buttons = container.querySelectorAll('.filter-btn');
    expect(buttons.length).toBe(4); // All, Visible, Hidden, Pinned
  });

  it('calls onFilterChange when filter is clicked', () => {
    const onFilterChange = vi.fn();
    new CommentModerationTools(container, callbacks, onFilterChange);
    const hiddenBtn = container.querySelectorAll('.filter-btn')[2] as HTMLButtonElement;
    hiddenBtn.click();
    expect(onFilterChange).toHaveBeenCalledWith('hidden');
  });

  it('marks active filter button', () => {
    new CommentModerationTools(container, callbacks);
    const allBtn = container.querySelector('.filter-btn.active');
    expect(allBtn?.textContent).toBe('All');
  });
});
