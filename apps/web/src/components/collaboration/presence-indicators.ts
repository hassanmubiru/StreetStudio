/**
 * Presence Indicators
 *
 * Displays user avatars and online status for users currently viewing
 * a video or project. Shows presence changes with smooth animations
 * and provides real-time awareness of who is actively collaborating.
 *
 * Requirements: 7.1, 7.4
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

/** Information about a present user. */
export interface PresenceUser {
  id: Uuid;
  displayName: string;
  avatarUrl?: string;
  status: PresenceStatus;
  lastActiveAt: IsoTimestamp;
}

/** Configuration for the presence indicators component. */
export interface PresenceIndicatorsOptions {
  /** Maximum number of avatars to display before showing "+N" overflow. */
  maxVisible?: number;
  /** Whether to show status dots on avatars. */
  showStatusDots?: boolean;
  /** Whether to animate join/leave transitions. */
  animateTransitions?: boolean;
  /** Current user ID (excluded from presence display). */
  currentUserId?: Uuid;
}

/** Callbacks for presence events. */
export interface PresenceCallbacks {
  onUserClick?: (user: PresenceUser) => void;
}

// --------------------------------------------------------------------------
// Utility Functions
// --------------------------------------------------------------------------

/**
 * Determines the CSS class for a user's status.
 */
export function getStatusClass(status: PresenceStatus): string {
  switch (status) {
    case 'active':
      return 'presence-status-active';
    case 'idle':
      return 'presence-status-idle';
    case 'away':
      return 'presence-status-away';
    default:
      return 'presence-status-away';
  }
}

/**
 * Generates initials from a display name (first letter of first and last word).
 */
export function getInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Filters presence users, excluding the current user and sorting by status.
 * Active users come first, then idle, then away.
 */
export function filterAndSortUsers(
  users: PresenceUser[],
  currentUserId?: Uuid
): PresenceUser[] {
  const statusOrder: Record<PresenceStatus, number> = {
    active: 0,
    idle: 1,
    away: 2,
  };

  return users
    .filter(u => u.id !== currentUserId)
    .sort((a, b) => {
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
    });
}

/**
 * Splits the user list into visible users and overflow count.
 */
export function splitVisibleUsers(
  users: PresenceUser[],
  maxVisible: number
): { visible: PresenceUser[]; overflowCount: number } {
  if (users.length <= maxVisible) {
    return { visible: users, overflowCount: 0 };
  }
  return {
    visible: users.slice(0, maxVisible),
    overflowCount: users.length - maxVisible,
  };
}

// --------------------------------------------------------------------------
// PresenceIndicators Class
// --------------------------------------------------------------------------

/**
 * PresenceIndicators renders a row of user avatars showing who is currently
 * viewing the same resource. It updates in real-time as users join/leave.
 */
export class PresenceIndicators {
  private container: HTMLElement;
  private options: Required<PresenceIndicatorsOptions>;
  private callbacks: PresenceCallbacks;
  private users: PresenceUser[] = [];

  constructor(
    container: HTMLElement,
    options: PresenceIndicatorsOptions = {},
    callbacks: PresenceCallbacks = {}
  ) {
    this.container = container;
    this.options = {
      maxVisible: options.maxVisible ?? 5,
      showStatusDots: options.showStatusDots ?? true,
      animateTransitions: options.animateTransitions ?? true,
      currentUserId: options.currentUserId ?? undefined as any,
    };
    this.callbacks = callbacks;
    this.setupContainer();
    this.render();
  }

  private setupContainer(): void {
    this.container.className = 'presence-indicators';
    this.container.setAttribute('role', 'group');
    this.container.setAttribute('aria-label', 'Users currently viewing');
  }

  private render(): void {
    this.container.innerHTML = '';

    const sorted = filterAndSortUsers(this.users, this.options.currentUserId);
    const { visible, overflowCount } = splitVisibleUsers(sorted, this.options.maxVisible);

    if (sorted.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'presence-empty';
      empty.textContent = 'No other viewers';
      empty.setAttribute('aria-label', 'No other users viewing');
      this.container.appendChild(empty);
      return;
    }

    // Avatar stack
    const stack = document.createElement('div');
    stack.className = 'presence-avatar-stack';

    for (const user of visible) {
      stack.appendChild(this.renderAvatar(user));
    }

    // Overflow indicator
    if (overflowCount > 0) {
      const overflow = document.createElement('div');
      overflow.className = 'presence-avatar presence-overflow';
      overflow.setAttribute('aria-label', `${overflowCount} more viewers`);
      overflow.textContent = `+${overflowCount}`;
      stack.appendChild(overflow);
    }

    this.container.appendChild(stack);

    // Viewer count label
    const label = document.createElement('span');
    label.className = 'presence-count-label';
    label.textContent = `${sorted.length} ${sorted.length === 1 ? 'viewer' : 'viewers'}`;
    label.setAttribute('aria-live', 'polite');
    this.container.appendChild(label);
  }

  private renderAvatar(user: PresenceUser): HTMLElement {
    const wrapper = document.createElement('button');
    wrapper.type = 'button';
    wrapper.className = 'presence-avatar';
    if (this.options.animateTransitions) {
      wrapper.classList.add('presence-animate');
    }
    wrapper.setAttribute('aria-label', `${user.displayName} (${user.status})`);
    wrapper.title = user.displayName;

    if (user.avatarUrl) {
      const img = document.createElement('img');
      img.src = user.avatarUrl;
      img.alt = user.displayName;
      img.className = 'presence-avatar-img';
      wrapper.appendChild(img);
    } else {
      const initials = document.createElement('span');
      initials.className = 'presence-avatar-initials';
      initials.textContent = getInitials(user.displayName);
      initials.setAttribute('aria-hidden', 'true');
      wrapper.appendChild(initials);
    }

    // Status dot
    if (this.options.showStatusDots) {
      const dot = document.createElement('span');
      dot.className = `presence-status-dot ${getStatusClass(user.status)}`;
      dot.setAttribute('aria-hidden', 'true');
      wrapper.appendChild(dot);
    }

    wrapper.addEventListener('click', () => {
      this.callbacks.onUserClick?.(user);
    });

    return wrapper;
  }

  /**
   * Update the list of present users and re-render.
   */
  public setUsers(users: PresenceUser[]): void {
    this.users = [...users];
    this.render();
  }

  /**
   * Add a user who just joined.
   */
  public addUser(user: PresenceUser): void {
    const existing = this.users.findIndex(u => u.id === user.id);
    if (existing >= 0) {
      this.users[existing] = user;
    } else {
      this.users.push(user);
    }
    this.render();
  }

  /**
   * Remove a user who left.
   */
  public removeUser(userId: Uuid): void {
    this.users = this.users.filter(u => u.id !== userId);
    this.render();
  }

  /**
   * Update a specific user's status.
   */
  public updateUserStatus(userId: Uuid, status: PresenceStatus): void {
    const user = this.users.find(u => u.id === userId);
    if (user) {
      user.status = status;
      user.lastActiveAt = new Date().toISOString();
      this.render();
    }
  }

  /**
   * Get the current list of users.
   */
  public getUsers(): PresenceUser[] {
    return [...this.users];
  }

  /**
   * Get the visible user count (excluding current user).
   */
  public getVisibleCount(): number {
    return filterAndSortUsers(this.users, this.options.currentUserId).length;
  }

  public getElement(): HTMLElement {
    return this.container;
  }
}
