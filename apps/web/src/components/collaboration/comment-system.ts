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
