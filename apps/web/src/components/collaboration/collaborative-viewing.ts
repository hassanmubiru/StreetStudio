/**
 * Collaborative Viewing Mode
 *
 * Enables synchronized video playback between collaborators viewing the same
 * video. When enabled, one user acts as the "host" and their playback position
 * is synchronized to all participants. Provides controls for enabling/disabling
 * sync and shows the current sync state.
 *
 * Requirements: 7.8
 */

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Unique identifier (UUID string). */
export type Uuid = string;

/** ISO-8601 timestamp string. */
export type IsoTimestamp = string;

/** Sync mode for collaborative viewing. */
export type SyncMode = 'host' | 'follower' | 'independent';

/** Participant in a collaborative viewing session. */
export interface ViewingParticipant {
  id: Uuid;
  displayName: string;
  avatarUrl?: string;
  syncMode: SyncMode;
  currentTime: number;
  isPlaying: boolean;
}

/** Playback state to synchronize. */
export interface PlaybackState {
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  timestamp: IsoTimestamp;
}

/** Configuration for the collaborative viewing component. */
export interface CollaborativeViewingOptions {
  /** The ID of the video being viewed. */
  videoId: Uuid;
  /** The current user ID. */
  currentUserId: Uuid;
  /** The video duration in seconds. */
  videoDuration: number;
  /** Tolerance in seconds for sync drift (default 2). */
  syncToleranceSeconds?: number;
}

/** Callbacks for collaborative viewing events. */
export interface CollaborativeViewingCallbacks {
  /** Called when sync mode changes and playback should update. */
  onSeek?: (time: number) => void;
  /** Called when playback state should change (play/pause). */
  onPlayPause?: (isPlaying: boolean) => void;
  /** Called when playback rate should change. */
  onPlaybackRateChange?: (rate: number) => void;
  /** Called to broadcast the current user's playback state. */
  onBroadcastState?: (state: PlaybackState) => void;
  /** Called when sync mode changes. */
  onSyncModeChange?: (mode: SyncMode) => void;
}

// --------------------------------------------------------------------------
// Utility Functions
// --------------------------------------------------------------------------

/**
 * Determines if a sync correction is needed based on time drift.
 */
export function needsSyncCorrection(
  localTime: number,
  remoteTime: number,
  toleranceSeconds: number
): boolean {
  return Math.abs(localTime - remoteTime) > toleranceSeconds;
}

/**
 * Adjusts the target time to account for network latency.
 * Adds estimated latency to the remote time to predict current position.
 */
export function adjustForLatency(
  remoteTime: number,
  remoteTimestamp: IsoTimestamp,
  isPlaying: boolean,
  playbackRate: number = 1
): number {
  if (!isPlaying) return remoteTime;

  const latencyMs = Date.now() - new Date(remoteTimestamp).getTime();
  const latencySeconds = Math.max(0, latencyMs / 1000);
  return remoteTime + latencySeconds * playbackRate;
}

/**
 * Formats a sync status message for display.
 */
export function formatSyncStatus(mode: SyncMode, hostName?: string): string {
  switch (mode) {
    case 'host':
      return 'You are hosting — others follow your playback';
    case 'follower':
      return hostName
        ? `Following ${hostName}'s playback`
        : 'Following host playback';
    case 'independent':
      return 'Independent viewing — sync disabled';
    default:
      return '';
  }
}

// --------------------------------------------------------------------------
// CollaborativeViewing Class
// --------------------------------------------------------------------------

/**
 * CollaborativeViewing manages synchronized playback between users
 * viewing the same video. Provides UI controls for enabling sync mode
 * and shows the current synchronization state.
 */
export class CollaborativeViewing {
  private container: HTMLElement;
  private options: Required<CollaborativeViewingOptions>;
  private callbacks: CollaborativeViewingCallbacks;
  private syncMode: SyncMode = 'independent';
  private participants: Map<Uuid, ViewingParticipant> = new Map();
  private hostId: Uuid | null = null;
  private localPlaybackState: PlaybackState;
  private broadcastTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    container: HTMLElement,
    options: CollaborativeViewingOptions,
    callbacks: CollaborativeViewingCallbacks = {}
  ) {
    this.container = container;
    this.options = {
      ...options,
      syncToleranceSeconds: options.syncToleranceSeconds ?? 2,
    };
    this.callbacks = callbacks;
    this.localPlaybackState = {
      currentTime: 0,
      isPlaying: false,
      playbackRate: 1,
      timestamp: new Date().toISOString(),
    };
    this.setupContainer();
    this.render();
  }

  private setupContainer(): void {
    this.container.className = 'collaborative-viewing';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Collaborative viewing controls');
  }

  private render(): void {
    this.container.innerHTML = '';

    // Sync mode controls
    const controls = document.createElement('div');
    controls.className = 'collab-viewing-controls';

    // Sync toggle button
    const syncBtn = document.createElement('button');
    syncBtn.type = 'button';
    syncBtn.className = `collab-sync-btn ${this.syncMode !== 'independent' ? 'active' : ''}`;
    syncBtn.setAttribute('aria-pressed', String(this.syncMode !== 'independent'));
    syncBtn.setAttribute('aria-label', 'Toggle synchronized viewing');

    const syncIcon = document.createElement('span');
    syncIcon.className = 'collab-sync-icon';
    syncIcon.textContent = '🔗';
    syncIcon.setAttribute('aria-hidden', 'true');
    syncBtn.appendChild(syncIcon);

    const syncLabel = document.createElement('span');
    syncLabel.className = 'collab-sync-label';
    syncLabel.textContent = this.syncMode !== 'independent' ? 'Sync On' : 'Sync Off';
    syncBtn.appendChild(syncLabel);

    syncBtn.addEventListener('click', () => this.toggleSync());
    controls.appendChild(syncBtn);

    // Host button (only shown when sync is enabled)
    if (this.syncMode !== 'independent') {
      const hostBtn = document.createElement('button');
      hostBtn.type = 'button';
      hostBtn.className = `collab-host-btn ${this.syncMode === 'host' ? 'active' : ''}`;
      hostBtn.setAttribute('aria-pressed', String(this.syncMode === 'host'));
      hostBtn.setAttribute('aria-label', this.syncMode === 'host' ? 'Stop hosting' : 'Become host');
      hostBtn.textContent = this.syncMode === 'host' ? 'Hosting' : 'Become Host';
      hostBtn.addEventListener('click', () => this.toggleHost());
      controls.appendChild(hostBtn);
    }

    this.container.appendChild(controls);

    // Status message
    const hostUser = this.hostId ? this.participants.get(this.hostId) : null;
    const statusEl = document.createElement('div');
    statusEl.className = 'collab-viewing-status';
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.textContent = formatSyncStatus(this.syncMode, hostUser?.displayName);
    this.container.appendChild(statusEl);

    // Participant list (if sync is active)
    if (this.syncMode !== 'independent' && this.participants.size > 0) {
      const participantList = document.createElement('div');
      participantList.className = 'collab-participant-list';
      participantList.setAttribute('role', 'list');
      participantList.setAttribute('aria-label', 'Sync participants');

      const participantArray = Array.from(this.participants.values());
      for (const participant of participantArray) {
        if (participant.id === this.options.currentUserId) continue;

        const item = document.createElement('div');
        item.className = 'collab-participant-item';
        item.setAttribute('role', 'listitem');

        const name = document.createElement('span');
        name.className = 'collab-participant-name';
        name.textContent = participant.displayName;
        item.appendChild(name);

        const mode = document.createElement('span');
        mode.className = `collab-participant-mode collab-mode-${participant.syncMode}`;
        mode.textContent = participant.syncMode === 'host' ? '👑' : '👁';
        mode.setAttribute('aria-label', participant.syncMode === 'host' ? 'Host' : 'Follower');
        item.appendChild(mode);

        participantList.appendChild(item);
      }

      this.container.appendChild(participantList);
    }
  }

  private toggleSync(): void {
    if (this.syncMode === 'independent') {
      this.syncMode = 'follower';
      this.startBroadcasting();
    } else {
      this.syncMode = 'independent';
      this.hostId = null;
      this.stopBroadcasting();
    }
    this.callbacks.onSyncModeChange?.(this.syncMode);
    this.render();
  }

  private toggleHost(): void {
    if (this.syncMode === 'host') {
      this.syncMode = 'follower';
      this.hostId = null;
    } else {
      this.syncMode = 'host';
      this.hostId = this.options.currentUserId;
    }
    this.callbacks.onSyncModeChange?.(this.syncMode);
    this.render();
  }

  private startBroadcasting(): void {
    if (this.broadcastTimer) return;
    this.broadcastTimer = setInterval(() => {
      if (this.syncMode === 'host') {
        this.callbacks.onBroadcastState?.({
          ...this.localPlaybackState,
          timestamp: new Date().toISOString(),
        });
      }
    }, 1000);
  }

  private stopBroadcasting(): void {
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }
  }

  /**
   * Update the local playback state (called by the video player).
   */
  public updateLocalPlayback(state: Partial<PlaybackState>): void {
    this.localPlaybackState = {
      ...this.localPlaybackState,
      ...state,
      timestamp: new Date().toISOString(),
    };

    // If hosting, broadcast the state
    if (this.syncMode === 'host') {
      this.callbacks.onBroadcastState?.(this.localPlaybackState);
    }
  }

  /**
   * Handle a remote playback state update from the host.
   */
  public handleRemotePlaybackState(
    userId: Uuid,
    state: PlaybackState
  ): void {
    // Update participant state
    const participant = this.participants.get(userId);
    if (participant) {
      participant.currentTime = state.currentTime;
      participant.isPlaying = state.isPlaying;
    }

    // Only sync if we're following and this is from the host
    if (this.syncMode !== 'follower' || userId !== this.hostId) {
      return;
    }

    const adjustedTime = adjustForLatency(
      state.currentTime,
      state.timestamp,
      state.isPlaying,
      state.playbackRate
    );

    // Check if we need to correct drift
    if (needsSyncCorrection(
      this.localPlaybackState.currentTime,
      adjustedTime,
      this.options.syncToleranceSeconds
    )) {
      this.callbacks.onSeek?.(adjustedTime);
    }

    // Sync play/pause state
    if (state.isPlaying !== this.localPlaybackState.isPlaying) {
      this.callbacks.onPlayPause?.(state.isPlaying);
    }

    // Sync playback rate
    if (state.playbackRate !== this.localPlaybackState.playbackRate) {
      this.callbacks.onPlaybackRateChange?.(state.playbackRate);
    }
  }

  /**
   * Set participants in the viewing session.
   */
  public setParticipants(participants: ViewingParticipant[]): void {
    this.participants.clear();
    for (const p of participants) {
      this.participants.set(p.id, p);
    }

    // Detect host
    const host = participants.find(p => p.syncMode === 'host');
    if (host && host.id !== this.options.currentUserId) {
      this.hostId = host.id;
    }

    this.render();
  }

  /**
   * Add or update a participant.
   */
  public updateParticipant(participant: ViewingParticipant): void {
    this.participants.set(participant.id, participant);
    if (participant.syncMode === 'host' && participant.id !== this.options.currentUserId) {
      this.hostId = participant.id;
    }
    this.render();
  }

  /**
   * Remove a participant who left.
   */
  public removeParticipant(userId: Uuid): void {
    this.participants.delete(userId);
    if (this.hostId === userId) {
      this.hostId = null;
      // If we were following, switch to independent
      if (this.syncMode === 'follower') {
        this.syncMode = 'independent';
        this.callbacks.onSyncModeChange?.(this.syncMode);
      }
    }
    this.render();
  }

  /**
   * Get the current sync mode.
   */
  public getSyncMode(): SyncMode {
    return this.syncMode;
  }

  /**
   * Get the host user ID if one exists.
   */
  public getHostId(): Uuid | null {
    return this.hostId;
  }

  /**
   * Clean up timers and state.
   */
  public destroy(): void {
    this.stopBroadcasting();
    this.participants.clear();
  }

  public getElement(): HTMLElement {
    return this.container;
  }
}
