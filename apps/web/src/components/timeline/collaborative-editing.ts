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

/** Types of edit operations that can be tracked. */
export type EditOperationType = 'trim' | 'split' | 'move' | 'delete' | 'add' | 'text-overlay' | 'caption';

/** A recorded edit operation for version history. */
export interface EditOperation {
  id: Uuid;
  userId: Uuid;
  type: EditOperationType;
  timestamp: IsoTimestamp;
  /** The clip affected by this operation. */
  clipId: string;
  /** Description of the change. */
  description: string;
  /** Serialized before-state for undo. */
  previousState: string;
  /** Serialized after-state for redo. */
  newState: string;
}

/** An edit conflict between two users. */
export interface EditConflict {
  id: Uuid;
  /** The clip being edited by multiple users. */
  clipId: string;
  /** The user who initiated the first edit. */
  initiatorUserId: Uuid;
  /** The user whose edit conflicts. */
  conflictingUserId: Uuid;
  /** The type of the initiator's operation. */
  initiatorOperation: EditOperationType;
  /** The type of the conflicting operation. */
  conflictingOperation: EditOperationType;
  /** When the conflict was detected. */
  detectedAt: IsoTimestamp;
  /** Resolution status. */
  resolution: ConflictResolution;
}

/** How a conflict was resolved. */
export type ConflictResolution = 'pending' | 'accept-initiator' | 'accept-conflicting' | 'merge' | 'dismissed';

/** A collaborative editing session. */
export interface EditSession {
  id: Uuid;
  videoId: Uuid;
  /** Users currently participating in this session. */
  participants: EditorPresence[];
  /** When the session started. */
  startedAt: IsoTimestamp;
  /** Whether the session is active. */
  isActive: boolean;
  /** Current version number. */
  version: number;
}

/** Options for the collaborative editing manager. */
export interface CollaborativeEditingOptions {
  /** Current user ID. */
  currentUserId: Uuid;
  /** Current user display name. */
  currentUserName: string;
  /** Current user avatar URL. */
  currentUserAvatar?: string;
  /** Video ID being edited. */
  videoId: Uuid;
  /** Presence timeout in ms (default: 30000). */
  presenceTimeoutMs?: number;
  /** Max edit history entries to retain (default: 100). */
  maxHistorySize?: number;
}

/** Callbacks for collaborative editing events. */
export interface CollaborativeEditingCallbacks {
  onPresenceUpdate?: (participants: EditorPresence[]) => void;
  onConflictDetected?: (conflict: EditConflict) => void;
  onConflictResolved?: (conflict: EditConflict) => void;
  onEditReceived?: (operation: EditOperation) => void;
  onSessionStart?: (session: EditSession) => void;
  onSessionEnd?: (sessionId: Uuid) => void;
  onVersionChange?: (version: number) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_PRESENCE_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_HISTORY_SIZE = 100;
export const PRESENCE_UPDATE_INTERVAL_MS = 5_000;

/** Pre-defined colors for user cursors/indicators. */
export const USER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#F0B27A', '#7DCEA0',
];

// ─── Utility Functions ────────────────────────────────────────────────────────

/** Generate a simple unique ID. */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Get a deterministic color for a user based on their ID. */
export function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

/** Get current time as ISO timestamp. */
function now(): IsoTimestamp {
  return new Date().toISOString();
}

// ─── Presence Manager ─────────────────────────────────────────────────────────

/**
 * Manages user presence indicators in the timeline editor.
 * Tracks which users are active, their cursor positions, and their current operations.
 */
export class PresenceManager {
  private participants: Map<Uuid, EditorPresence> = new Map();
  private currentUserId: Uuid;
  private presenceTimeoutMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private onUpdate: ((participants: EditorPresence[]) => void) | null = null;

  constructor(currentUserId: Uuid, presenceTimeoutMs = DEFAULT_PRESENCE_TIMEOUT_MS) {
    this.currentUserId = currentUserId;
    this.presenceTimeoutMs = presenceTimeoutMs;
  }

  /** Start periodic cleanup of stale presence entries. */
  public startCleanup(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.removeStalePresences(), this.presenceTimeoutMs);
  }

  /** Stop periodic cleanup. */
  public stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /** Set the callback for presence updates. */
  public setOnUpdate(callback: ((participants: EditorPresence[]) => void) | null): void {
    this.onUpdate = callback;
  }

  /** Update or add a user's presence. */
  public updatePresence(presence: EditorPresence): void {
    this.participants.set(presence.userId, {
      ...presence,
      lastActiveAt: now(),
    });
    this.notifyUpdate();
  }

  /** Remove a user's presence (e.g., they disconnected). */
  public removePresence(userId: Uuid): boolean {
    const removed = this.participants.delete(userId);
    if (removed) {
      this.notifyUpdate();
    }
    return removed;
  }

  /** Get all current participants (excluding the current user). */
  public getOtherParticipants(): EditorPresence[] {
    return Array.from(this.participants.values()).filter(
      (p) => p.userId !== this.currentUserId && p.isConnected
    );
  }

  /** Get all participants including the current user. */
  public getAllParticipants(): EditorPresence[] {
    return Array.from(this.participants.values()).filter((p) => p.isConnected);
  }

  /** Get a specific participant. */
  public getParticipant(userId: Uuid): EditorPresence | undefined {
    return this.participants.get(userId);
  }

  /** Get the number of active participants. */
  public getParticipantCount(): number {
    return this.getAllParticipants().length;
  }

  /** Check if a specific clip is being edited by another user. */
  public isClipBeingEdited(clipId: string): EditorPresence | undefined {
    return this.getOtherParticipants().find(
      (p) => p.activeClipId === clipId && p.activeOperation !== undefined
    );
  }

  /** Remove stale presence entries that haven't been updated within the timeout. */
  private removeStalePresences(): void {
    const cutoff = Date.now() - this.presenceTimeoutMs;
    let changed = false;
    for (const [userId, presence] of this.participants.entries()) {
      const lastActive = new Date(presence.lastActiveAt).getTime();
      if (lastActive < cutoff) {
        this.participants.set(userId, { ...presence, isConnected: false });
        changed = true;
      }
    }
    if (changed) {
      this.notifyUpdate();
    }
  }

  private notifyUpdate(): void {
    this.onUpdate?.(this.getAllParticipants());
  }

  /** Clear all presence data. */
  public clear(): void {
    this.participants.clear();
    this.notifyUpdate();
  }

  /** Destroy the manager and release resources. */
  public destroy(): void {
    this.stopCleanup();
    this.participants.clear();
    this.onUpdate = null;
  }
}

// ─── Conflict Detection and Resolution ────────────────────────────────────────

/**
 * Detects and resolves edit conflicts when multiple users edit the same clip.
 */
export class ConflictDetector {
  private activeEdits: Map<string, { userId: Uuid; operation: EditOperationType; startedAt: string }> = new Map();
  private conflicts: Map<Uuid, EditConflict> = new Map();
  private onConflictDetected: ((conflict: EditConflict) => void) | null = null;
  private onConflictResolved: ((conflict: EditConflict) => void) | null = null;

  /** Set callback for when a conflict is detected. */
  public setOnConflictDetected(callback: ((conflict: EditConflict) => void) | null): void {
    this.onConflictDetected = callback;
  }

  /** Set callback for when a conflict is resolved. */
  public setOnConflictResolved(callback: ((conflict: EditConflict) => void) | null): void {
    this.onConflictResolved = callback;
  }

  /**
   * Register that a user has started editing a clip.
   * Returns a conflict if another user is already editing the same clip.
   */
  public registerEdit(userId: Uuid, clipId: string, operation: EditOperationType): EditConflict | null {
    const existing = this.activeEdits.get(clipId);

    if (existing && existing.userId !== userId) {
      // Conflict detected!
      const conflict: EditConflict = {
        id: generateId(),
        clipId,
        initiatorUserId: existing.userId,
        conflictingUserId: userId,
        initiatorOperation: existing.operation,
        conflictingOperation: operation,
        detectedAt: now(),
        resolution: 'pending',
      };
      this.conflicts.set(conflict.id, conflict);
      this.onConflictDetected?.(conflict);
      return conflict;
    }

    // No conflict, register the edit
    this.activeEdits.set(clipId, { userId, operation, startedAt: now() });
    return null;
  }

  /** Mark that a user has finished editing a clip. */
  public completeEdit(userId: Uuid, clipId: string): void {
    const existing = this.activeEdits.get(clipId);
    if (existing && existing.userId === userId) {
      this.activeEdits.delete(clipId);
    }
  }

  /** Resolve a conflict with the chosen resolution strategy. */
  public resolveConflict(conflictId: Uuid, resolution: ConflictResolution): EditConflict | null {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) return null;

    conflict.resolution = resolution;
    this.conflicts.set(conflictId, conflict);
    this.onConflictResolved?.(conflict);

    // If resolved, clear the active edit lock based on resolution
    if (resolution === 'accept-initiator') {
      // The conflicting user's edit is rejected - keep initiator's lock
    } else if (resolution === 'accept-conflicting') {
      // Replace the initiator's lock with the conflicting user's
      this.activeEdits.set(conflict.clipId, {
        userId: conflict.conflictingUserId,
        operation: conflict.conflictingOperation,
        startedAt: now(),
      });
    } else if (resolution === 'merge' || resolution === 'dismissed') {
      // Clear the lock so both can proceed
      this.activeEdits.delete(conflict.clipId);
    }

    return conflict;
  }

  /** Get all pending (unresolved) conflicts. */
  public getPendingConflicts(): EditConflict[] {
    return Array.from(this.conflicts.values()).filter((c) => c.resolution === 'pending');
  }

  /** Get all conflicts (resolved and pending). */
  public getAllConflicts(): EditConflict[] {
    return Array.from(this.conflicts.values());
  }

  /** Check if a clip currently has an active edit lock. */
  public hasActiveLock(clipId: string): boolean {
    return this.activeEdits.has(clipId);
  }

  /** Get the user who holds the edit lock on a clip. */
  public getLockHolder(clipId: string): Uuid | undefined {
    return this.activeEdits.get(clipId)?.userId;
  }

  /** Clear all active edits and conflicts. */
  public clear(): void {
    this.activeEdits.clear();
    this.conflicts.clear();
  }
}
