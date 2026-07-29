/**
 * Comment System Interface
 *
 * Provides timestamped comment input with timeline integration,
 * threaded comment display with proper nesting, comment markers on timeline
 * with click-to-seek functionality, and moderation tools for organization admins.
 *
 * Requirements: 5.5, 5.6, 7.5
 */

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Unique identifier (UUID string). */
export type Uuid = string;

/** ISO-8601 timestamp string. */
export type IsoTimestamp = string;

/** Comment data model matching the shared CommentDto. */
export interface Comment {
  id: Uuid;
  videoId: Uuid;
  parentCommentId?: Uuid;
  authorId: Uuid;
  body: string;
  /** Playback position in seconds the comment is anchored to, if any. */
  timestampSeconds?: number;
  createdAt: IsoTimestamp;
}

/** Author information for rendering. */
export interface CommentAuthor {
  id: Uuid;
  displayName: string;
  avatarUrl?: string;
}

/** Input for creating a new comment. */
export interface CreateCommentInput {
  body: string;
  parentCommentId?: Uuid;
  timestampSeconds?: number;
}

/** Moderation action types. */
export type ModerationAction = 'delete' | 'hide' | 'pin' | 'unpin';

/** Status of a comment for moderation purposes. */
export type CommentStatus = 'visible' | 'hidden' | 'pinned' | 'deleted';

/** Extended comment with UI state. */
export interface CommentWithState extends Comment {
  status: CommentStatus;
  author?: CommentAuthor;
  replies: CommentWithState[];
  isCollapsed: boolean;
}

/** Callbacks for the comment system. */
export interface CommentSystemCallbacks {
  onSubmit?: (input: CreateCommentInput) => Promise<Comment | null>;
  onDelete?: (commentId: Uuid) => Promise<boolean>;
  onModerate?: (commentId: Uuid, action: ModerationAction) => Promise<boolean>;
  onSeek?: (timestampSeconds: number) => void;
  onMention?: (query: string) => Promise<CommentAuthor[]>;
}

/** Configuration for the comment system. */
export interface CommentSystemOptions {
  videoId: Uuid;
  videoDuration: number;
  currentUserId: Uuid;
  isAdmin?: boolean;
  /** Current playback time in seconds for timestamped comment input. */
  currentTime?: number;
}

// --------------------------------------------------------------------------
// Utility functions
// --------------------------------------------------------------------------

/**
 * Formats seconds into a time string (e.g., "1:23" or "1:05:30").
 */
export function formatTimestamp(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Builds a tree structure from a flat list of comments.
 * Top-level comments (no parentCommentId) become roots.
 * Replies are nested under their parent.
 */
export function buildCommentTree(
  comments: Comment[],
  authorMap: Map<Uuid, CommentAuthor>
): CommentWithState[] {
  const map = new Map<Uuid, CommentWithState>();
  const roots: CommentWithState[] = [];

  // Create CommentWithState for each comment
  for (const comment of comments) {
    map.set(comment.id, {
      ...comment,
      status: 'visible',
      author: authorMap.get(comment.authorId),
      replies: [],
      isCollapsed: false,
    });
  }

  // Build the tree
  for (const comment of comments) {
    const node = map.get(comment.id)!;
    if (comment.parentCommentId && map.has(comment.parentCommentId)) {
      map.get(comment.parentCommentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort roots by creation date (newest first)
  roots.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return roots;
}

/**
 * Calculates comment marker positions as percentages along a timeline.
 */
export function getCommentMarkerPositions(
  comments: Comment[],
  videoDuration: number
): Array<{ commentId: Uuid; position: number; timestampSeconds: number }> {
  if (videoDuration <= 0) return [];
  return comments
    .filter(c => c.timestampSeconds != null && c.timestampSeconds >= 0)
    .map(c => ({
      commentId: c.id,
      position: Math.min(100, (c.timestampSeconds! / videoDuration) * 100),
      timestampSeconds: c.timestampSeconds!,
    }));
}

// --------------------------------------------------------------------------
// CommentInput - Timestamped comment input with timeline integration
// --------------------------------------------------------------------------

/**
 * CommentInput manages the comment composition area.
 * It provides a textarea with optional timestamp anchoring,
 * reply-to functionality, and @mention support.
 */
export class CommentInput {
  private container: HTMLElement;
  private textareaEl!: HTMLTextAreaElement;
  private timestampToggle!: HTMLButtonElement;
  private submitBtn!: HTMLButtonElement;
  private timestampDisplay!: HTMLSpanElement;
  private replyIndicator!: HTMLElement;
  private mentionDropdown!: HTMLElement;

  private includeTimestamp = true;
  private currentTime = 0;
  private replyToId: Uuid | null = null;
  private callbacks: CommentSystemCallbacks;
  private options: CommentSystemOptions;
  private isSubmitting = false;

  constructor(
    container: HTMLElement,
    options: CommentSystemOptions,
    callbacks: CommentSystemCallbacks
  ) {
    this.container = container;
    this.options = options;
    this.callbacks = callbacks;
    this.currentTime = options.currentTime ?? 0;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.className = 'comment-input-container';
    this.container.setAttribute('role', 'form');
    this.container.setAttribute('aria-label', 'Add comment');

    // Reply indicator (hidden by default)
    this.replyIndicator = document.createElement('div');
    this.replyIndicator.className = 'comment-reply-indicator';
    this.replyIndicator.style.display = 'none';
    this.replyIndicator.setAttribute('aria-live', 'polite');
    this.container.appendChild(this.replyIndicator);

    // Textarea
    this.textareaEl = document.createElement('textarea');
    this.textareaEl.className = 'comment-textarea';
    this.textareaEl.placeholder = 'Add a comment...';
    this.textareaEl.setAttribute('aria-label', 'Comment text');
    this.textareaEl.rows = 2;
    this.textareaEl.maxLength = 1000;
    this.textareaEl.addEventListener('keydown', this.handleKeydown.bind(this));
    this.textareaEl.addEventListener('input', this.handleInput.bind(this));
    this.container.appendChild(this.textareaEl);

    // Mention dropdown
    this.mentionDropdown = document.createElement('div');
    this.mentionDropdown.className = 'mention-dropdown';
    this.mentionDropdown.setAttribute('role', 'listbox');
    this.mentionDropdown.setAttribute('aria-label', 'Mention suggestions');
    this.mentionDropdown.style.display = 'none';
    this.container.appendChild(this.mentionDropdown);

    // Controls row
    const controlsRow = document.createElement('div');
    controlsRow.className = 'comment-controls-row';

    // Timestamp toggle
    this.timestampToggle = document.createElement('button');
    this.timestampToggle.type = 'button';
    this.timestampToggle.className = 'timestamp-toggle active';
    this.timestampToggle.setAttribute('aria-pressed', 'true');
    this.timestampToggle.setAttribute('aria-label', 'Include timestamp');
    this.timestampToggle.addEventListener('click', this.toggleTimestamp.bind(this));
    controlsRow.appendChild(this.timestampToggle);

    // Timestamp display
    this.timestampDisplay = document.createElement('span');
    this.timestampDisplay.className = 'timestamp-display';
    this.timestampDisplay.textContent = formatTimestamp(this.currentTime);
    controlsRow.appendChild(this.timestampDisplay);

    // Submit button
    this.submitBtn = document.createElement('button');
    this.submitBtn.type = 'button';
    this.submitBtn.className = 'comment-submit-btn';
    this.submitBtn.textContent = 'Comment';
    this.submitBtn.setAttribute('aria-label', 'Submit comment');
    this.submitBtn.disabled = true;
    this.submitBtn.addEventListener('click', this.handleSubmit.bind(this));
    controlsRow.appendChild(this.submitBtn);

    this.container.appendChild(controlsRow);
  }

  private handleKeydown(event: KeyboardEvent): void {
    // Submit on Ctrl/Cmd+Enter
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.handleSubmit();
    }
    // Cancel reply on Escape
    if (event.key === 'Escape' && this.replyToId) {
      this.cancelReply();
    }
  }

  private handleInput(): void {
    const hasContent = this.textareaEl.value.trim().length > 0;
    this.submitBtn.disabled = hasContent ? false : true;

    // Check for @mention triggers
    this.checkForMentionTrigger();
  }

  private async checkForMentionTrigger(): Promise<void> {
    const value = this.textareaEl.value;
    const cursorPos = this.textareaEl.selectionStart;
    const textUpToCursor = value.substring(0, cursorPos);
    const mentionMatch = textUpToCursor.match(/@(\w*)$/);

    if (mentionMatch && this.callbacks.onMention) {
      const query = mentionMatch[1];
      const suggestions = await this.callbacks.onMention(query);
      this.showMentionDropdown(suggestions);
    } else {
      this.hideMentionDropdown();
    }
  }

  private showMentionDropdown(suggestions: CommentAuthor[]): void {
    if (suggestions.length === 0) {
      this.hideMentionDropdown();
      return;
    }
    this.mentionDropdown.innerHTML = '';
    this.mentionDropdown.style.display = 'block';

    for (const author of suggestions) {
      const item = document.createElement('div');
      item.className = 'mention-item';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-label', author.displayName);
      item.textContent = `@${author.displayName}`;
      item.addEventListener('click', () => this.insertMention(author));
      this.mentionDropdown.appendChild(item);
    }
  }

  private hideMentionDropdown(): void {
    this.mentionDropdown.style.display = 'none';
    this.mentionDropdown.innerHTML = '';
  }

  private insertMention(author: CommentAuthor): void {
    const value = this.textareaEl.value;
    const cursorPos = this.textareaEl.selectionStart;
    const textUpToCursor = value.substring(0, cursorPos);
    const mentionStart = textUpToCursor.lastIndexOf('@');
    const after = value.substring(cursorPos);
    const before = value.substring(0, mentionStart);
    this.textareaEl.value = `${before}@${author.displayName} ${after}`;
    this.textareaEl.focus();
    this.hideMentionDropdown();
    this.handleInput();
  }

  private toggleTimestamp(): void {
    this.includeTimestamp = !this.includeTimestamp;
    this.timestampToggle.classList.toggle('active', this.includeTimestamp);
    this.timestampToggle.setAttribute('aria-pressed', String(this.includeTimestamp));
    this.timestampDisplay.style.opacity = this.includeTimestamp ? '1' : '0.4';
  }

  private async handleSubmit(): Promise<void> {
    const body = this.textareaEl.value.trim();
    if (!body || this.isSubmitting) return;

    this.isSubmitting = true;
    this.submitBtn.disabled = true;
    this.submitBtn.textContent = 'Posting...';

    const input: CreateCommentInput = {
      body,
      parentCommentId: this.replyToId ?? undefined,
      timestampSeconds: this.includeTimestamp ? this.currentTime : undefined,
    };

    try {
      await this.callbacks.onSubmit?.(input);
      this.textareaEl.value = '';
      this.cancelReply();
    } finally {
      this.isSubmitting = false;
      this.submitBtn.disabled = false;
      this.submitBtn.textContent = 'Comment';
    }
  }

  /** Set reply-to state, updating UI. */
  public setReplyTo(commentId: Uuid, authorName: string): void {
    this.replyToId = commentId;
    this.replyIndicator.style.display = 'flex';
    this.replyIndicator.innerHTML = `
      <span>Replying to <strong>${authorName}</strong></span>
      <button type="button" class="cancel-reply-btn" aria-label="Cancel reply">&times;</button>
    `;
    const cancelBtn = this.replyIndicator.querySelector('.cancel-reply-btn');
    cancelBtn?.addEventListener('click', () => this.cancelReply());
    this.textareaEl.focus();
  }

  /** Cancel active reply. */
  public cancelReply(): void {
    this.replyToId = null;
    this.replyIndicator.style.display = 'none';
    this.replyIndicator.innerHTML = '';
  }

  /** Update the current playback time (called externally from player). */
  public updateCurrentTime(time: number): void {
    this.currentTime = time;
    this.timestampDisplay.textContent = formatTimestamp(time);
  }

  public getElement(): HTMLElement {
    return this.container;
  }
}

// --------------------------------------------------------------------------
// ThreadedCommentDisplay - Threaded comment display with proper nesting
// --------------------------------------------------------------------------

/** Maximum nesting depth for visual indentation. */
const MAX_DISPLAY_DEPTH = 5;

/**
 * ThreadedCommentDisplay renders a threaded list of comments
 * with proper nesting, expand/collapse, and reply functionality.
 */
export class ThreadedCommentDisplay {
  private container: HTMLElement;
  private comments: CommentWithState[] = [];
  private callbacks: CommentSystemCallbacks;
  private options: CommentSystemOptions;
  private onReply?: (commentId: Uuid, authorName: string) => void;

  constructor(
    container: HTMLElement,
    options: CommentSystemOptions,
    callbacks: CommentSystemCallbacks,
    onReply?: (commentId: Uuid, authorName: string) => void
  ) {
    this.container = container;
    this.options = options;
    this.callbacks = callbacks;
    this.onReply = onReply;
    this.container.className = 'threaded-comments';
    this.container.setAttribute('role', 'list');
    this.container.setAttribute('aria-label', 'Comments');
  }

  /** Update the displayed comments. */
  public setComments(comments: CommentWithState[]): void {
    this.comments = comments;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';
    if (this.comments.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'comments-empty';
      empty.textContent = 'No comments yet. Be the first to comment!';
      this.container.appendChild(empty);
      return;
    }
    for (const comment of this.comments) {
      this.container.appendChild(this.renderComment(comment, 0));
    }
  }

  private renderComment(comment: CommentWithState, depth: number): HTMLElement {
    const item = document.createElement('div');
    item.className = 'comment-item';
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-comment-id', comment.id);
    item.style.marginLeft = `${Math.min(depth, MAX_DISPLAY_DEPTH) * 24}px`;

    // Header: author name + timestamp badge
    const header = document.createElement('div');
    header.className = 'comment-header';

    const authorSpan = document.createElement('span');
    authorSpan.className = 'comment-author';
    authorSpan.textContent = comment.author?.displayName ?? 'Unknown';
    header.appendChild(authorSpan);

    if (comment.timestampSeconds != null) {
      const badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'comment-timestamp-badge';
      badge.textContent = formatTimestamp(comment.timestampSeconds);
      badge.setAttribute('aria-label', `Jump to ${formatTimestamp(comment.timestampSeconds)}`);
      badge.addEventListener('click', () => {
        this.callbacks.onSeek?.(comment.timestampSeconds!);
      });
      header.appendChild(badge);
    }

    const dateSpan = document.createElement('span');
    dateSpan.className = 'comment-date';
    dateSpan.textContent = this.formatRelativeDate(comment.createdAt);
    header.appendChild(dateSpan);

    item.appendChild(header);

    // Body
    const body = document.createElement('p');
    body.className = 'comment-body';
    body.textContent = comment.body;
    item.appendChild(body);

    // Actions row
    const actions = document.createElement('div');
    actions.className = 'comment-actions';

    // Reply button
    const replyBtn = document.createElement('button');
    replyBtn.type = 'button';
    replyBtn.className = 'comment-action-btn';
    replyBtn.textContent = 'Reply';
    replyBtn.setAttribute('aria-label', `Reply to ${comment.author?.displayName ?? 'comment'}`);
    replyBtn.addEventListener('click', () => {
      this.onReply?.(comment.id, comment.author?.displayName ?? 'Unknown');
    });
    actions.appendChild(replyBtn);

    // Moderation actions (admin only)
    if (this.options.isAdmin) {
      const moderateBtn = document.createElement('button');
      moderateBtn.type = 'button';
      moderateBtn.className = 'comment-action-btn comment-moderate-btn';
      moderateBtn.textContent = '•••';
      moderateBtn.setAttribute('aria-label', 'Moderate comment');
      moderateBtn.setAttribute('aria-haspopup', 'menu');
      moderateBtn.addEventListener('click', (e) => {
        this.showModerationMenu(comment, e.currentTarget as HTMLElement);
      });
      actions.appendChild(moderateBtn);
    }

    // Delete button (own comments or admin)
    if (comment.authorId === this.options.currentUserId || this.options.isAdmin) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'comment-action-btn comment-delete-btn';
      deleteBtn.textContent = 'Delete';
      deleteBtn.setAttribute('aria-label', 'Delete comment');
      deleteBtn.addEventListener('click', () => {
        this.callbacks.onDelete?.(comment.id);
      });
      actions.appendChild(deleteBtn);
    }

    item.appendChild(actions);

    // Threaded replies
    if (comment.replies.length > 0) {
      const repliesContainer = document.createElement('div');
      repliesContainer.className = 'comment-replies';
      repliesContainer.setAttribute('role', 'list');
      repliesContainer.setAttribute('aria-label', `Replies to ${comment.author?.displayName ?? 'comment'}`);

      // Collapse/expand toggle for threads with replies
      if (comment.replies.length > 0) {
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'comment-collapse-btn';
        toggleBtn.textContent = comment.isCollapsed
          ? `Show ${comment.replies.length} ${comment.replies.length === 1 ? 'reply' : 'replies'}`
          : 'Hide replies';
        toggleBtn.setAttribute('aria-expanded', String(!comment.isCollapsed));
        toggleBtn.addEventListener('click', () => {
          comment.isCollapsed = !comment.isCollapsed;
          this.render();
        });
        item.appendChild(toggleBtn);
      }

      if (!comment.isCollapsed) {
        for (const reply of comment.replies) {
          repliesContainer.appendChild(this.renderComment(reply, depth + 1));
        }
        item.appendChild(repliesContainer);
      }
    }

    return item;
  }

  private showModerationMenu(comment: CommentWithState, anchor: HTMLElement): void {
    // Remove any existing menu
    const existing = this.container.querySelector('.moderation-menu');
    existing?.remove();

    const menu = document.createElement('div');
    menu.className = 'moderation-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Moderation actions');
