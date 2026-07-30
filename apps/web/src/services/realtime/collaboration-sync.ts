/**
 * Real-Time Collaboration Synchronization
 *
 * Provides:
 * - Presence state broadcasting (who is viewing what)
 * - Typing indicators
 * - Synchronized playback state for collaborative viewing
 * - Local queue for offline resilience (queues actions until reconnected)
 *
 * Requirements: 7.2, 7.9, 7.10
 */

import type { RealtimeWebSocketManager, WebSocketEvent } from './websocket-manager.js';

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export interface PresenceUser {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  joinedAt: number;
  lastActivity: number;
  /** Resource the user is currently viewing */
  resourceId?: string;
  resourceType?: 'video' | 'project' | 'editor';
}

export interface TypingIndicator {
  userId: string;
  displayName: string;
  resourceId: string;
  startedAt: number;
}

export interface PlaybackState {
  videoId: string;
  position: number;
  isPlaying: boolean;
  speed: number;
  updatedBy: string;
  updatedAt: number;
}

export interface CollaborationSyncOptions {
  /** Current user ID */
  userId: string;
  /** Current user display name */
  displayName: string;
  /** User avatar URL */
  avatarUrl?: string;
  /** How often to broadcast presence (ms, default: 30000) */
  presenceInterval?: number;
  /** How long before a user is considered inactive (ms, default: 60000) */
  presenceTimeout?: number;
  /** Typing indicator debounce (ms, default: 2000) */
  typingDebounce?: number;
  /** Playback sync tolerance in seconds (default: 2) */
  playbackSyncTolerance?: number;
}

export type CollaborationEventType =
  | 'presenceUpdate'
  | 'typingStart'
  | 'typingStop'
  | 'playbackSync'
  | 'userJoined'
  | 'userLeft';

export type CollaborationEventHandler = (data: unknown) => void;

const DEFAULT_OPTIONS = {
  presenceInterval: 30000,
  presenceTimeout: 60000,
  typingDebounce: 2000,
  playbackSyncTolerance: 2,
};

// -------------------------------------------------------------------------
// CollaborationSyncService
// -------------------------------------------------------------------------

/**
 * Manages real-time collaboration state: presence, typing, and playback sync.
 * Communicates through a RealtimeWebSocketManager instance.
 */
export class CollaborationSyncService {
  private wsManager: RealtimeWebSocketManager;
  private options: Required<Omit<CollaborationSyncOptions, 'avatarUrl'>> & { avatarUrl?: string };
  private presenceMap = new Map<string, PresenceUser>();
  private typingMap = new Map<string, TypingIndicator>();
  private currentPlaybackState: PlaybackState | null = null;
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private eventListeners = new Map<CollaborationEventType, Set<CollaborationEventHandler>>();
  private currentResourceId: string | null = null;
  private currentResourceType: 'video' | 'project' | 'editor' | null = null;
  private isTyping = false;
  private unsubscribeWs: (() => void) | null = null;
  private offlineQueue: WebSocketEvent[] = [];

  constructor(wsManager: RealtimeWebSocketManager, options: CollaborationSyncOptions) {
    this.wsManager = wsManager;
    this.options = { ...DEFAULT_OPTIONS, ...options } as any;
    this.setupMessageHandling();
    this.startPresenceBroadcast();
    this.startPresenceCleanup();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Join a resource (video, project, editor) for collaboration.
   */
  public joinResource(resourceId: string, resourceType: 'video' | 'project' | 'editor'): void {
    this.currentResourceId = resourceId;
    this.currentResourceType = resourceType;

    this.sendEvent('collaboration.join', {
      resourceId,
      resourceType,
      userId: this.options.userId,
      displayName: this.options.displayName,
      avatarUrl: this.options.avatarUrl,
    });

    // Immediately broadcast presence
    this.broadcastPresence();
  }

  /**
   * Leave the current resource.
   */
  public leaveResource(): void {
    if (this.currentResourceId) {
      this.sendEvent('collaboration.leave', {
        resourceId: this.currentResourceId,
        userId: this.options.userId,
      });
    }

    this.currentResourceId = null;
    this.currentResourceType = null;
    this.presenceMap.clear();
    this.typingMap.clear();
  }

  /**
   * Signal that the current user started typing.
   */
  public startTyping(): void {
    if (this.isTyping || !this.currentResourceId) return;

    this.isTyping = true;
    this.sendEvent('collaboration.typingStart', {
      resourceId: this.currentResourceId,
      userId: this.options.userId,
      displayName: this.options.displayName,
    });

    // Auto-stop typing after debounce period
    this.resetTypingTimer();
  }

  /**
   * Signal that the current user stopped typing.
   */
  public stopTyping(): void {
    if (!this.isTyping) return;

    this.isTyping = false;
    this.clearTypingTimer();
    this.sendEvent('collaboration.typingStop', {
      resourceId: this.currentResourceId,
      userId: this.options.userId,
    });
  }

  /**
   * Broadcast playback state for collaborative viewing.
   */
  public syncPlayback(state: Omit<PlaybackState, 'updatedBy' | 'updatedAt'>): void {
    const fullState: PlaybackState = {
      ...state,
      updatedBy: this.options.userId,
      updatedAt: Date.now(),
    };

    this.sendEvent('collaboration.playbackSync', fullState as unknown as Record<string, unknown>);
  }

  /**
   * Get all users present on the current resource.
   */
  public getPresence(): PresenceUser[] {
    return Array.from(this.presenceMap.values());
  }

  /**
   * Get currently typing users (excluding self).
   */
  public getTypingUsers(): TypingIndicator[] {
    return Array.from(this.typingMap.values()).filter(
      (t) => t.userId !== this.options.userId
    );
  }

  /**
   * Get the latest collaborative playback state.
   */
  public getPlaybackState(): PlaybackState | null {
    return this.currentPlaybackState;
  }

  /**
   * Subscribe to collaboration events.
   */
  public on(event: CollaborationEventType, handler: CollaborationEventHandler): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
    return () => {
      this.eventListeners.get(event)?.delete(handler);
    };
  }

  /**
   * Flush any queued offline actions.
   */
  public flushOfflineQueue(): void {
    const queued = [...this.offlineQueue];
    this.offlineQueue = [];
    for (const event of queued) {
      this.wsManager.send(event);
    }
  }

  /**
   * Clean up all resources.
   */
  public destroy(): void {
    this.leaveResource();
    this.stopPresenceBroadcast();
    this.stopPresenceCleanup();
    this.clearTypingTimer();
    if (this.unsubscribeWs) {
      this.unsubscribeWs();
      this.unsubscribeWs = null;
    }
    this.eventListeners.clear();
    this.offlineQueue = [];
  }

  // -------------------------------------------------------------------------
  // Private: Message Handling
  // -------------------------------------------------------------------------

  private setupMessageHandling(): void {
    this.unsubscribeWs = this.wsManager.on('message', (data) => {
      const event = data as WebSocketEvent;
      this.handleIncomingEvent(event);
    });

    // On reconnect, flush offline queue and re-join
    this.wsManager.on('reconnected', () => {
      this.flushOfflineQueue();
      if (this.currentResourceId && this.currentResourceType) {
        this.joinResource(this.currentResourceId, this.currentResourceType);
      }
    });
  }

  private handleIncomingEvent(event: WebSocketEvent): void {
    const payload = event.payload as Record<string, any>;

    switch (event.type) {
      case 'collaboration.presence':
        this.handlePresenceUpdate(payload);
        break;
      case 'collaboration.join':
        this.handleUserJoined(payload);
        break;
      case 'collaboration.leave':
        this.handleUserLeft(payload);
        break;
      case 'collaboration.typingStart':
        this.handleTypingStart(payload);
        break;
      case 'collaboration.typingStop':
        this.handleTypingStop(payload);
        break;
      case 'collaboration.playbackSync':
        this.handlePlaybackSync(payload);
        break;
    }
  }

  private handlePresenceUpdate(payload: Record<string, any>): void {
    if (payload.userId === this.options.userId) return;
    if (payload.resourceId !== this.currentResourceId) return;

    this.presenceMap.set(payload.userId, {
      userId: payload.userId,
      displayName: payload.displayName,
      avatarUrl: payload.avatarUrl,
      joinedAt: payload.joinedAt || Date.now(),
      lastActivity: Date.now(),
      resourceId: payload.resourceId,
      resourceType: payload.resourceType,
    });

    this.emit('presenceUpdate', this.getPresence());
  }

  private handleUserJoined(payload: Record<string, any>): void {
    if (payload.userId === this.options.userId) return;
    if (payload.resourceId !== this.currentResourceId) return;

    const user: PresenceUser = {
      userId: payload.userId,
      displayName: payload.displayName,
      avatarUrl: payload.avatarUrl,
      joinedAt: Date.now(),
      lastActivity: Date.now(),
      resourceId: payload.resourceId,
      resourceType: payload.resourceType,
    };

    this.presenceMap.set(payload.userId, user);
    this.emit('userJoined', user);
    this.emit('presenceUpdate', this.getPresence());
  }

  private handleUserLeft(payload: Record<string, any>): void {
    if (payload.userId === this.options.userId) return;

    const user = this.presenceMap.get(payload.userId);
    if (user) {
      this.presenceMap.delete(payload.userId);
      this.typingMap.delete(payload.userId);
      this.emit('userLeft', user);
      this.emit('presenceUpdate', this.getPresence());
    }
  }

  private handleTypingStart(payload: Record<string, any>): void {
    if (payload.userId === this.options.userId) return;
    if (payload.resourceId !== this.currentResourceId) return;

    const indicator: TypingIndicator = {
      userId: payload.userId,
      displayName: payload.displayName,
      resourceId: payload.resourceId,
      startedAt: Date.now(),
    };

    this.typingMap.set(payload.userId, indicator);
    this.emit('typingStart', indicator);
  }

  private handleTypingStop(payload: Record<string, any>): void {
    if (payload.userId === this.options.userId) return;

    const indicator = this.typingMap.get(payload.userId);
    if (indicator) {
      this.typingMap.delete(payload.userId);
      this.emit('typingStop', indicator);
    }
  }

  private handlePlaybackSync(payload: Record<string, any>): void {
    if (payload.updatedBy === this.options.userId) return;

    const state: PlaybackState = {
      videoId: payload.videoId,
      position: payload.position,
      isPlaying: payload.isPlaying,
      speed: payload.speed,
      updatedBy: payload.updatedBy,
      updatedAt: payload.updatedAt,
    };

    // Only apply if within tolerance or from a forced sync
    if (this.currentPlaybackState) {
      const drift = Math.abs(state.position - this.currentPlaybackState.position);
      if (drift < this.options.playbackSyncTolerance && state.isPlaying === this.currentPlaybackState.isPlaying) {
        return; // Ignore minor drift
      }
    }

    this.currentPlaybackState = state;
    this.emit('playbackSync', state);
  }

  // -------------------------------------------------------------------------
  // Private: Presence Broadcasting
  // -------------------------------------------------------------------------

  private broadcastPresence(): void {
    if (!this.currentResourceId) return;

    this.sendEvent('collaboration.presence', {
      userId: this.options.userId,
      displayName: this.options.displayName,
      avatarUrl: this.options.avatarUrl,
      resourceId: this.currentResourceId,
      resourceType: this.currentResourceType,
      joinedAt: Date.now(),
    });
  }

  private startPresenceBroadcast(): void {
    this.presenceTimer = setInterval(() => {
      this.broadcastPresence();
    }, this.options.presenceInterval);
  }

  private stopPresenceBroadcast(): void {
    if (this.presenceTimer) {
      clearInterval(this.presenceTimer);
      this.presenceTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Private: Presence Cleanup
  // -------------------------------------------------------------------------

  private startPresenceCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const presenceEntries = Array.from(this.presenceMap.entries());
      for (const [userId, user] of presenceEntries) {
        if (now - user.lastActivity > this.options.presenceTimeout) {
          this.presenceMap.delete(userId);
          this.typingMap.delete(userId);
          this.emit('userLeft', user);
        }
      }
      // Clean stale typing indicators
      const typingEntries = Array.from(this.typingMap.entries());
      for (const [userId, indicator] of typingEntries) {
        if (now - indicator.startedAt > this.options.typingDebounce * 3) {
          this.typingMap.delete(userId);
          this.emit('typingStop', indicator);
        }
      }
    }, 15000);
  }

  private stopPresenceCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Private: Typing Timer
  // -------------------------------------------------------------------------

  private resetTypingTimer(): void {
    this.clearTypingTimer();
    this.typingTimer = setTimeout(() => {
      this.stopTyping();
    }, this.options.typingDebounce);
  }

  private clearTypingTimer(): void {
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Private: Utilities
  // -------------------------------------------------------------------------

  private sendEvent(type: string, payload: Record<string, unknown>): void {
    const event: WebSocketEvent = { type, payload };

    if (this.wsManager.getStatus() !== 'connected') {
      this.offlineQueue.push(event);
      return;
    }

    this.wsManager.send(event);
  }

  private emit(event: CollaborationEventType, data: unknown): void {
    const handlers = this.eventListeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(data);
      } catch {
        // Don't let listener errors break the service
      }
    }
  }
}
