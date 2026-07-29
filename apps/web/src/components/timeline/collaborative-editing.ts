/**
 * Collaborative Editing Features for Timeline Editor
 *
 * Provides presence indicators in timeline editor, edit conflict detection
 * and resolution, collaborative editing session management, and edit history
 * with version control display.
 *
 * Requirements: 6.10
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Unique identifier (UUID string). */
export type Uuid = string;

/** ISO-8601 timestamp string. */
export type IsoTimestamp = string;

/** User presence information in the timeline editor. */
export interface EditorPresence {
  userId: Uuid;
  displayName: string;
  avatarUrl?: string;
  color: string;
  /** Current playhead frame position of this user. */
  playheadFrame: number;
  /** The clip this user is currently editing, if any. */
  activeClipId?: string;
  /** The type of edit operation in progress. */
  activeOperation?: EditOperationType;
  /** When presence was last updated. */
  lastActiveAt: IsoTimestamp;
  /** Whether the user is currently connected. */
  isConnected: boolean;
}
