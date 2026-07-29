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
