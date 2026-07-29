/**
 * Presence Indicators Component
 *
 * Real-time collaboration presence providing user avatars and status,
 * typing indicators, current viewers list, and collaborative viewing sync.
 *
 * Requirements: 7.1, 7.3, 7.4
 */

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Unique identifier (UUID string). */
export type Uuid = string;

/** ISO-8601 timestamp string. */
export type IsoTimestamp = string;

/** User presence status. */
export type PresenceStatus = 'active' | 'idle' | 'away';

/** A viewer currently present in a video session. */
export interface PresenceUser {
  id: Uuid;
  displayName: string;
  avatarUrl?: string;
  status: PresenceStatus;
  joinedAt: IsoTimestamp;
  /** Whether the user is currently typing a comment. */
  isTyping?: boolean;
}

/** Configuration for the presence indicators component. */
export interface PresenceIndicatorsOptions {
  /** The video ID this presence session is for. */
  videoId: Uuid;
  /** The current user's ID (excluded from the viewer list). */
  currentUserId: Uuid;
  /** Maximum number of avatars to show before collapsing. */
  maxVisibleAvatars?: number;
  /** Whether to show typing indicators. */
  showTypingIndicators?: boolean;
  /** Whether to show the full viewers list panel. */
  showViewersList?: boolean;
}

/** Callbacks for presence events. */
export interface PresenceIndicatorsCallbacks {
  onUserClick?: (userId: Uuid) => void;
  onViewersListToggle?: (expanded: boolean) => void;
}

// --------------------------------------------------------------------------
// Utility Functions
// --------------------------------------------------------------------------

/**
 * Extracts initials from a display name for avatar fallback.
 */
export function getInitials(displayName: string): string {
  if (!displayName || displayName.trim().length === 0) return '?';
  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0]!.charAt(0).toUpperCase();
  }
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

/**
 * Generates a deterministic color from a user ID for avatar backgrounds.
 */
export function getAvatarColor(userId: string): string {
  const colors = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
    '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
    '#f97316', '#6366f1', '#14b8a6', '#e11d48',
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length]!;
}

/**
 * Validates that a PresenceUser has the required fields for display.
 */
export function isValidPresenceUser(user: unknown): user is PresenceUser {
  if (!user || typeof user !== 'object') return false;
  const u = user as Record<string, unknown>;
  return (
    typeof u.id === 'string' && u.id.length > 0 &&
    typeof u.displayName === 'string' && u.displayName.length > 0 &&
    typeof u.status === 'string' &&
    ['active', 'idle', 'away'].includes(u.status) &&
    typeof u.joinedAt === 'string'
  );
}

// --------------------------------------------------------------------------
// PresenceTracker - Core presence state management
// --------------------------------------------------------------------------

/**
 * PresenceTracker manages the list of active viewers and their states.
 * It provides the core logic for presence display, independent of rendering.
 */
export class PresenceTracker {
  private viewers: Map<Uuid, PresenceUser> = new Map();
  private currentUserId: Uuid;

  constructor(currentUserId: Uuid) {
    this.currentUserId = currentUserId;
  }

  /**
   * Adds or updates a user in the presence list.
   * Returns true if the list changed.
   */
  public upsertUser(user: PresenceUser): boolean {
    if (!isValidPresenceUser(user)) return false;
    // Don't track the current user in the viewers list
    if (user.id === this.currentUserId) return false;

    const existing = this.viewers.get(user.id);
    this.viewers.set(user.id, { ...user });

    // Return whether the list actually changed
    return !existing ||
      existing.displayName !== user.displayName ||
      existing.avatarUrl !== user.avatarUrl ||
      existing.status !== user.status ||
      existing.isTyping !== user.isTyping;
  }

  /**
   * Removes a user from the presence list.
   * Returns true if a user was actually removed.
   */
  public removeUser(userId: Uuid): boolean {
    return this.viewers.delete(userId);
  }

  /**
   * Sets the full list of active viewers, replacing any existing state.
   */
  public setViewers(users: PresenceUser[]): void {
    this.viewers.clear();
    for (const user of users) {
      if (isValidPresenceUser(user) && user.id !== this.currentUserId) {
        this.viewers.set(user.id, { ...user });
      }
    }
  }

  /**
   * Returns the current list of active viewers sorted by join time.
   */
  public getViewers(): PresenceUser[] {
    return Array.from(this.viewers.values())
      .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
  }

  /**
   * Returns only viewers who are currently typing.
   */
  public getTypingUsers(): PresenceUser[] {
    return this.getViewers().filter(u => u.isTyping === true);
  }

  /**
   * Returns the total number of active viewers (excluding current user).
   */
  public getViewerCount(): number {
    return this.viewers.size;
  }

  /**
   * Updates a user's typing status.
   */
  public setTypingStatus(userId: Uuid, isTyping: boolean): boolean {
    const user = this.viewers.get(userId);
    if (!user) return false;
    if (user.isTyping === isTyping) return false;
    user.isTyping = isTyping;
    return true;
  }

  /**
   * Updates a user's presence status.
   */
  public setUserStatus(userId: Uuid, status: PresenceStatus): boolean {
    const user = this.viewers.get(userId);
    if (!user) return false;
    if (user.status === status) return false;
    user.status = status;
    return true;
  }

  /**
   * Checks if a specific user is currently present.
   */
  public hasUser(userId: Uuid): boolean {
    return this.viewers.has(userId);
  }

  /**
   * Clears all presence data.
   */
  public clear(): void {
    this.viewers.clear();
  }
}

// --------------------------------------------------------------------------
// PresenceIndicators - UI Component
// --------------------------------------------------------------------------

/**
 * PresenceIndicators renders presence information for a video session.
 * Displays avatar thumbnails, user information, typing indicators,
 * and an expandable viewers list.
 */
export class PresenceIndicators {
  private container: HTMLElement;
  private options: PresenceIndicatorsOptions;
  private callbacks: PresenceIndicatorsCallbacks;
  private tracker: PresenceTracker;
  private isListExpanded = false;

  constructor(
    container: HTMLElement,
    options: PresenceIndicatorsOptions,
    callbacks: PresenceIndicatorsCallbacks = {}
  ) {
    this.container = container;
    this.options = {
      maxVisibleAvatars: 5,
      showTypingIndicators: true,
      showViewersList: true,
      ...options,
    };
    this.callbacks = callbacks;
    this.tracker = new PresenceTracker(options.currentUserId);
    this.render();
  }

  /**
   * Updates the full list of viewers and re-renders.
   */
  public setViewers(users: PresenceUser[]): void {
    this.tracker.setViewers(users);
    this.render();
  }

  /**
   * Adds or updates a single user's presence.
   */
  public upsertUser(user: PresenceUser): void {
    if (this.tracker.upsertUser(user)) {
      this.render();
    }
  }

  /**
   * Removes a user from presence (they left the session).
   */
  public removeUser(userId: Uuid): void {
    if (this.tracker.removeUser(userId)) {
      this.render();
    }
  }

  /**
   * Updates a user's typing status.
   */
  public setTypingStatus(userId: Uuid, isTyping: boolean): void {
    if (this.tracker.setTypingStatus(userId, isTyping)) {
      this.render();
    }
  }

  /**
   * Returns the current viewer count.
   */
  public getViewerCount(): number {
    return this.tracker.getViewerCount();
  }

  /**
   * Returns all tracked viewers.
   */
  public getViewers(): PresenceUser[] {
    return this.tracker.getViewers();
  }

  /**
   * Returns the presence tracker for direct access.
   */
  public getTracker(): PresenceTracker {
    return this.tracker;
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.className = 'presence-indicators';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Active viewers');
    this.container.setAttribute('aria-live', 'polite');

    const viewers = this.tracker.getViewers();
    const maxVisible = this.options.maxVisibleAvatars!;

    // Avatar stack
    const avatarStack = document.createElement('div');
    avatarStack.className = 'presence-avatar-stack';
    avatarStack.setAttribute('role', 'list');
    avatarStack.setAttribute('aria-label', `${viewers.length} viewer${viewers.length !== 1 ? 's' : ''}`);

    const visibleViewers = viewers.slice(0, maxVisible);
    const overflowCount = Math.max(0, viewers.length - maxVisible);

    for (const viewer of visibleViewers) {
      const avatar = this.createAvatarElement(viewer);
      avatarStack.appendChild(avatar);
    }

    // Overflow indicator
    if (overflowCount > 0) {
      const overflow = document.createElement('div');
      overflow.className = 'presence-avatar presence-overflow';
      overflow.setAttribute('role', 'listitem');
      overflow.setAttribute('aria-label', `${overflowCount} more viewer${overflowCount !== 1 ? 's' : ''}`);
      overflow.textContent = `+${overflowCount}`;
      avatarStack.appendChild(overflow);
    }

    this.container.appendChild(avatarStack);

    // Typing indicators
    if (this.options.showTypingIndicators) {
      const typingUsers = this.tracker.getTypingUsers();
      if (typingUsers.length > 0) {
        const typingEl = document.createElement('div');
        typingEl.className = 'presence-typing-indicator';
        typingEl.setAttribute('role', 'status');
        typingEl.setAttribute('aria-live', 'polite');

        const names = typingUsers.map(u => u.displayName);
        let typingText: string;
        if (names.length === 1) {
          typingText = `${names[0]} is typing...`;
        } else if (names.length === 2) {
          typingText = `${names[0]} and ${names[1]} are typing...`;
        } else {
          typingText = `${names.length} people are typing...`;
        }

        typingEl.textContent = typingText;
        this.container.appendChild(typingEl);
      }
    }

    // Viewers list toggle
    if (this.options.showViewersList && viewers.length > 0) {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'presence-viewers-toggle';
      toggleBtn.setAttribute('aria-expanded', String(this.isListExpanded));
      toggleBtn.setAttribute('aria-label', `${this.isListExpanded ? 'Hide' : 'Show'} viewers list`);
      toggleBtn.textContent = `${viewers.length} viewing`;
      toggleBtn.addEventListener('click', () => {
        this.isListExpanded = !this.isListExpanded;
        this.callbacks.onViewersListToggle?.(this.isListExpanded);
        this.render();
      });
      this.container.appendChild(toggleBtn);

      // Expanded viewers list
      if (this.isListExpanded) {
        const list = document.createElement('div');
        list.className = 'presence-viewers-list';
        list.setAttribute('role', 'list');
        list.setAttribute('aria-label', 'All viewers');

        for (const viewer of viewers) {
          const item = this.createViewerListItem(viewer);
          list.appendChild(item);
        }
        this.container.appendChild(list);
      }
    }
  }

  private createAvatarElement(viewer: PresenceUser): HTMLElement {
    const avatar = document.createElement('div');
    avatar.className = `presence-avatar status-${viewer.status}`;
    avatar.setAttribute('role', 'listitem');
    avatar.setAttribute('aria-label', `${viewer.displayName} (${viewer.status})`);
    avatar.setAttribute('data-user-id', viewer.id);

    if (viewer.avatarUrl) {
      const img = document.createElement('img');
      img.src = viewer.avatarUrl;
      img.alt = viewer.displayName;
      img.className = 'presence-avatar-img';
      avatar.appendChild(img);
    } else {
      const initials = document.createElement('span');
      initials.className = 'presence-avatar-initials';
      initials.textContent = getInitials(viewer.displayName);
      avatar.style.backgroundColor = getAvatarColor(viewer.id);
      avatar.appendChild(initials);
    }

    // Status indicator dot
    const statusDot = document.createElement('span');
    statusDot.className = `presence-status-dot status-${viewer.status}`;
    statusDot.setAttribute('aria-hidden', 'true');
    avatar.appendChild(statusDot);

    // Click handler
    if (this.callbacks.onUserClick) {
      avatar.style.cursor = 'pointer';
      avatar.setAttribute('tabindex', '0');
      avatar.addEventListener('click', () => this.callbacks.onUserClick!(viewer.id));
      avatar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.callbacks.onUserClick!(viewer.id);
        }
      });
    }

    return avatar;
  }

  private createViewerListItem(viewer: PresenceUser): HTMLElement {
    const item = document.createElement('div');
    item.className = 'presence-viewer-item';
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-user-id', viewer.id);

    // Mini avatar
    const miniAvatar = document.createElement('div');
    miniAvatar.className = 'presence-viewer-avatar';
    if (viewer.avatarUrl) {
      const img = document.createElement('img');
      img.src = viewer.avatarUrl;
      img.alt = '';
      miniAvatar.appendChild(img);
    } else {
      miniAvatar.textContent = getInitials(viewer.displayName);
      miniAvatar.style.backgroundColor = getAvatarColor(viewer.id);
    }
    item.appendChild(miniAvatar);

    // Name and status
    const info = document.createElement('div');
    info.className = 'presence-viewer-info';

    const name = document.createElement('span');
    name.className = 'presence-viewer-name';
    name.textContent = viewer.displayName;
    info.appendChild(name);

    const status = document.createElement('span');
    status.className = `presence-viewer-status status-${viewer.status}`;
    status.textContent = viewer.status;
    info.appendChild(status);

    item.appendChild(info);

    // Typing indicator
    if (viewer.isTyping) {
      const typing = document.createElement('span');
      typing.className = 'presence-viewer-typing';
      typing.textContent = 'typing...';
      typing.setAttribute('aria-label', `${viewer.displayName} is typing`);
      item.appendChild(typing);
    }

    return item;
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public destroy(): void {
    this.tracker.clear();
    this.container.innerHTML = '';
  }
}
