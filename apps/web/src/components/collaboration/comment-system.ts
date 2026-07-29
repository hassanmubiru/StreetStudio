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
