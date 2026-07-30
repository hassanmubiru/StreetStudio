/**
 * Typing Indicators
 *
 * Displays real-time typing indicators showing which users are currently
 * composing comments. Provides visual feedback with animated dots and
 * user attribution, with automatic expiry for stale typing states.
 *
 * Requirements: 7.3
 */

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Unique identifier (UUID string). */
export type Uuid = string;

/** ISO-8601 timestamp string. */
export type IsoTimestamp = string;

/** A user who is currently typing. */
export interface TypingUser {
  id: Uuid;
  displayName: string;
  avatarUrl?: string;
  startedAt: IsoTimestamp;
}

/** Configuration for the typing indicators component. */
export interface TypingIndicatorsOptions {
  /** Time in ms after which a typing state expires (default 5000). */
  expiryMs?: number;
  /** Maximum number of names to show before "and N others" (default 3). */
  maxNames?: number;
  /** Current user ID (excluded from typing display). */
  currentUserId?: Uuid;
}

/** Callbacks for typing indicator events. */
export interface TypingIndicatorCallbacks {
  /** Called when the current user starts typing. */
  onTypingStart?: () => void;
  /** Called when the current user stops typing. */
  onTypingStop?: () => void;
}

// --------------------------------------------------------------------------
// Utility Functions
// --------------------------------------------------------------------------

/**
 * Formats a list of typing user names into a readable string.
 * Examples:
 *  - ["Alice"] → "Alice is typing..."
 *  - ["Alice", "Bob"] → "Alice and Bob are typing..."
 *  - ["Alice", "Bob", "Charlie"] → "Alice, Bob, and Charlie are typing..."
 *  - ["Alice", "Bob", "Charlie", "Dave"] → "Alice, Bob, and 2 others are typing..."
 */
export function formatTypingMessage(
  users: TypingUser[],
  maxNames: number = 3
): string {
  if (users.length === 0) return '';
  if (users.length === 1) return `${users[0]!.displayName} is typing...`;

  if (users.length <= maxNames) {
    const names = users.map(u => u.displayName);
    const last = names.pop()!;
    return `${names.join(', ')}${names.length > 1 ? ',' : ''} and ${last} are typing...`;
  }

  const shown = users.slice(0, maxNames - 1).map(u => u.displayName);
  const remaining = users.length - shown.length;
  return `${shown.join(', ')}, and ${remaining} ${remaining === 1 ? 'other is' : 'others are'} typing...`;
}

/**
 * Checks if a typing state has expired based on startedAt and expiryMs.
 */
export function isTypingExpired(startedAt: IsoTimestamp, expiryMs: number, now?: Date): boolean {
  const started = new Date(startedAt).getTime();
  const current = (now || new Date()).getTime();
  return current - started > expiryMs;
}

/**
 * Filters out expired typing users from the list.
 */
export function filterExpiredTyping(
  users: TypingUser[],
  expiryMs: number,
  now?: Date
): TypingUser[] {
  return users.filter(u => !isTypingExpired(u.startedAt, expiryMs, now));
}

// --------------------------------------------------------------------------
// TypingIndicators Class
// --------------------------------------------------------------------------

/**
 * TypingIndicators renders a typing status bar showing who is currently
 * composing comments. Updates in real-time via WebSocket events.
 */
export class TypingIndicators {
  private container: HTMLElement;
  private options: Required<TypingIndicatorsOptions>;
  private callbacks: TypingIndicatorCallbacks;
  private typingUsers: Map<Uuid, TypingUser> = new Map();
  private expiryTimer: ReturnType<typeof setInterval> | null = null;
  private currentUserTyping = false;
  private typingTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    container: HTMLElement,
    options: TypingIndicatorsOptions = {},
    callbacks: TypingIndicatorCallbacks = {}
  ) {
    this.container = container;
    this.options = {
      expiryMs: options.expiryMs ?? 5000,
      maxNames: options.maxNames ?? 3,
      currentUserId: options.currentUserId ?? undefined as any,
    };
    this.callbacks = callbacks;
    this.setupContainer();
    this.startExpiryCheck();
    this.render();
  }

  private setupContainer(): void {
    this.container.className = 'typing-indicators';
    this.container.setAttribute('role', 'status');
    this.container.setAttribute('aria-live', 'polite');
    this.container.setAttribute('aria-atomic', 'true');
  }

  private startExpiryCheck(): void {
    this.expiryTimer = setInterval(() => {
      this.removeExpired();
    }, 1000);
  }

  private removeExpired(): void {
    const now = new Date();
    let changed = false;

    const entries = Array.from(this.typingUsers.entries());
    for (const [id, user] of entries) {
      if (isTypingExpired(user.startedAt, this.options.expiryMs, now)) {
        this.typingUsers.delete(id);
        changed = true;
      }
    }

    if (changed) {
      this.render();
    }
  }

  private render(): void {
    this.container.innerHTML = '';

    const users = this.getFilteredUsers();

    if (users.length === 0) {
      this.container.style.display = 'none';
      return;
    }

    this.container.style.display = 'flex';

    // Animated dots
    const dots = document.createElement('span');
    dots.className = 'typing-dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    this.container.appendChild(dots);

    // Message text
    const message = document.createElement('span');
    message.className = 'typing-message';
    message.textContent = formatTypingMessage(users, this.options.maxNames);
    this.container.appendChild(message);
  }

  private getFilteredUsers(): TypingUser[] {
    return Array.from(this.typingUsers.values()).filter(
      user => user.id !== this.options.currentUserId
    );
  }

  /**
   * Set a user as typing.
   */
  public setUserTyping(user: TypingUser): void {
    this.typingUsers.set(user.id, {
      ...user,
      startedAt: new Date().toISOString(),
    });
    this.render();
  }

  /**
   * Clear a user's typing state.
   */
  public clearUserTyping(userId: Uuid): void {
    if (this.typingUsers.delete(userId)) {
      this.render();
    }
  }

  /**
   * Handle a typing event from WebSocket (sets or refreshes typing state).
   */
  public handleTypingEvent(user: TypingUser): void {
    this.setUserTyping(user);
  }

  /**
   * Handle the current user typing (debounced emit).
   * Call this on each keystroke in the comment input.
   */
  public handleLocalTyping(): void {
    if (!this.currentUserTyping) {
      this.currentUserTyping = true;
      this.callbacks.onTypingStart?.();
    }

    // Reset the stop timer
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    this.typingTimeout = setTimeout(() => {
      this.currentUserTyping = false;
      this.callbacks.onTypingStop?.();
    }, this.options.expiryMs);
  }

  /**
   * Force stop the current user's typing state.
   */
  public stopLocalTyping(): void {
    if (this.currentUserTyping) {
      this.currentUserTyping = false;
      if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
        this.typingTimeout = null;
      }
      this.callbacks.onTypingStop?.();
    }
  }

  /**
   * Get all currently typing users (excluding current user).
   */
  public getTypingUsers(): TypingUser[] {
    return this.getFilteredUsers();
  }

  /**
   * Check if any users are currently typing.
   */
  public hasTypingUsers(): boolean {
    return this.getFilteredUsers().length > 0;
  }

  /**
   * Clean up timers and state.
   */
  public destroy(): void {
    if (this.expiryTimer) {
      clearInterval(this.expiryTimer);
      this.expiryTimer = null;
    }
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
    this.typingUsers.clear();
  }

  public getElement(): HTMLElement {
    return this.container;
  }
}
