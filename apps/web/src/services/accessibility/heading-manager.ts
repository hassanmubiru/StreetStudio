/**
 * Heading Manager and Screen Reader Announcements
 * 
 * Ensures proper h1-h6 heading hierarchy throughout the application and provides
 * a system for screen reader announcements on route changes and dynamic content updates.
 * 
 * Requirements: 11.3 - Support screen readers with proper headings structure,
 * landmark navigation, and descriptive text for media content
 * Requirements: 11.10 - Provide appropriate announcements to screen readers
 * without overwhelming users
 */

/** Priority levels for screen reader announcements */
export type AnnouncementPriority = 'polite' | 'assertive';

/** Heading level (1–6) */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** Configuration for a heading context */
interface HeadingContext {
  level: HeadingLevel;
  label: string;
}

/**
 * Manages heading hierarchy to ensure proper document structure.
 * Tracks the current heading level in nested contexts and validates
 * that headings don't skip levels.
 */
export class HeadingManager {
  private contextStack: HeadingContext[] = [];
  private rootLevel: HeadingLevel;

  constructor(rootLevel: HeadingLevel = 1) {
    this.rootLevel = rootLevel;
  }

  /**
   * Get the current heading level based on nesting depth.
   */
  getCurrentLevel(): HeadingLevel {
    if (this.contextStack.length === 0) {
      return this.rootLevel;
    }
    return this.contextStack[this.contextStack.length - 1].level;
  }

  /**
   * Get the next appropriate heading level for a child section.
   */
  getNextLevel(): HeadingLevel {
    const current = this.getCurrentLevel();
    const next = Math.min(current + 1, 6) as HeadingLevel;
    return next;
  }

  /**
   * Push a new heading context onto the stack (entering a section).
   */
  pushContext(label: string): HeadingLevel {
    const level = this.contextStack.length === 0 ? this.rootLevel : this.getNextLevel();
    this.contextStack.push({ level, label });
    return level;
  }

  /**
   * Pop the current heading context (leaving a section).
   */
  popContext(): HeadingContext | undefined {
    return this.contextStack.pop();
  }

  /**
   * Reset the heading manager to its initial state.
   */
  reset(): void {
    this.contextStack = [];
  }

  /**
   * Get the full context stack (for debugging/testing).
   */
  getContextStack(): ReadonlyArray<HeadingContext> {
    return [...this.contextStack];
  }

  /**
   * Validate that a heading level follows the proper hierarchy.
   * Returns true if the level is valid (does not skip levels).
   */
  validateLevel(level: HeadingLevel): boolean {
    const current = this.getCurrentLevel();
    // Valid if it's the same, one more, or any level less than or equal to current
    return level <= current + 1;
  }

  /**
   * Create a heading element with the correct level and content.
   */
  createHeading(text: string, options?: { id?: string; className?: string }): HTMLElement {
    const level = this.getCurrentLevel();
    const heading = document.createElement(`h${level}`);
    heading.textContent = text;

    if (options?.id) {
      heading.id = options.id;
    }
    if (options?.className) {
      heading.className = options.className;
    }

    return heading;
  }

  /**
   * Create a section with a properly leveled heading.
   * Automatically pushes a new context.
   */
  createSection(headingText: string, options?: { id?: string; className?: string; role?: string }): {
    section: HTMLElement;
    heading: HTMLElement;
    level: HeadingLevel;
  } {
    const level = this.pushContext(headingText);
    
    const section = document.createElement('section');
    if (options?.id) {
      section.id = options.id;
    }
    if (options?.className) {
      section.className = options.className;
    }
    if (options?.role) {
      section.setAttribute('role', options.role);
    }
    section.setAttribute('aria-labelledby', `heading-${headingText.toLowerCase().replace(/\s+/g, '-')}`);

    const heading = document.createElement(`h${level}`);
    heading.id = `heading-${headingText.toLowerCase().replace(/\s+/g, '-')}`;
    heading.textContent = headingText;

    section.appendChild(heading);

    return { section, heading, level };
  }
}

/**
 * Screen reader announcement system that manages announcements for route changes,
 * dynamic content updates, and other important state changes without overwhelming users.
 */
export class ScreenReaderAnnouncer {
  private politeRegion: HTMLElement | null = null;
  private assertiveRegion: HTMLElement | null = null;
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private announcementQueue: Array<{ message: string; priority: AnnouncementPriority }> = [];
  private isProcessingQueue: boolean = false;
  private mounted: boolean = false;

  /**
   * Mount the announcer by creating live regions in the DOM.
   */
  mount(): void {
    if (this.mounted) return;

    this.politeRegion = this.createLiveRegion('polite');
    this.politeRegion.id = 'sr-announcer-polite';
    document.body.appendChild(this.politeRegion);

    this.assertiveRegion = this.createLiveRegion('assertive');
    this.assertiveRegion.id = 'sr-announcer-assertive';
    document.body.appendChild(this.assertiveRegion);

    this.mounted = true;
  }

  /**
   * Unmount the announcer and clean up DOM elements and timers.
   */
  unmount(): void {
    if (this.politeRegion?.parentNode) {
      this.politeRegion.parentNode.removeChild(this.politeRegion);
    }
    if (this.assertiveRegion?.parentNode) {
      this.assertiveRegion.parentNode.removeChild(this.assertiveRegion);
    }
    this.politeRegion = null;
    this.assertiveRegion = null;
    this.mounted = false;

    // Clean up timers
    this.debounceTimers.forEach((timer) => clearTimeout(timer));
    this.debounceTimers.clear();
    this.announcementQueue = [];
  }

  /**
   * Announce a message to screen readers.
   */
  announce(message: string, priority: AnnouncementPriority = 'polite'): void {
    if (!this.mounted) {
      this.mount();
    }

    const region = priority === 'assertive' ? this.assertiveRegion : this.politeRegion;
    if (!region) return;

    // Clear and set content to trigger announcement
    region.textContent = '';
    // Use requestAnimationFrame to ensure the DOM update triggers the announcement
    requestAnimationFrame(() => {
      region.textContent = message;
    });
  }

  /**
   * Announce a route change with the page title.
   */
  announceRouteChange(pageTitle: string): void {
    this.announceDebounced('route', `Navigated to ${pageTitle}`, 'polite', 100);
  }

  /**
   * Announce a loading state.
   */
  announceLoading(context?: string): void {
    const message = context ? `Loading ${context}` : 'Loading';
    this.announce(message, 'polite');
  }

  /**
   * Announce that content has finished loading.
   */
  announceLoaded(context?: string): void {
    const message = context ? `${context} loaded` : 'Content loaded';
    this.announceDebounced('loaded', message, 'polite', 200);
  }

  /**
   * Announce an error to screen readers.
   */
  announceError(message: string): void {
    this.announce(message, 'assertive');
  }

  /**
   * Announce a form validation result.
   */
  announceValidation(fieldLabel: string, errorMessage: string | null): void {
    if (errorMessage) {
      this.announce(`${fieldLabel}: ${errorMessage}`, 'assertive');
    } else {
      this.announce(`${fieldLabel}: Valid`, 'polite');
    }
  }

  /**
   * Announce dynamic content updates without overwhelming the user.
   * Uses debouncing with a key to coalesce rapid updates.
   */
  announceDebounced(key: string, message: string, priority: AnnouncementPriority = 'polite', delayMs: number = 300): void {
    // Cancel previous debounced announcement for this key
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.announce(message, priority);
      this.debounceTimers.delete(key);
    }, delayMs);

    this.debounceTimers.set(key, timer);
  }

  /**
   * Queue an announcement to be delivered sequentially.
   * Useful when multiple announcements need to be read in order.
   */
  queueAnnouncement(message: string, priority: AnnouncementPriority = 'polite'): void {
    this.announcementQueue.push({ message, priority });
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  /**
   * Clear all pending announcements.
   */
  clearQueue(): void {
    this.announcementQueue = [];
    this.debounceTimers.forEach((timer) => clearTimeout(timer));
    this.debounceTimers.clear();
  }

  /**
   * Process the announcement queue sequentially with delays between messages.
   */
  private processQueue(): void {
    if (this.announcementQueue.length === 0) {
      this.isProcessingQueue = false;
      return;
    }

    this.isProcessingQueue = true;
    const { message, priority } = this.announcementQueue.shift()!;
    this.announce(message, priority);

    // Wait before processing next announcement to avoid overwhelming screen readers
    setTimeout(() => {
      this.processQueue();
    }, 1000);
  }

  /**
   * Create a visually hidden live region element.
   */
  private createLiveRegion(politeness: 'polite' | 'assertive'): HTMLElement {
    const region = document.createElement('div');
    region.setAttribute('aria-live', politeness);
    region.setAttribute('aria-atomic', 'true');
    region.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
    region.className = 'sr-only';
    region.style.position = 'absolute';
    region.style.width = '1px';
    region.style.height = '1px';
    region.style.padding = '0';
    region.style.margin = '-1px';
    region.style.overflow = 'hidden';
    region.style.clip = 'rect(0, 0, 0, 0)';
    region.style.whiteSpace = 'nowrap';
    region.style.border = '0';
    return region;
  }
}
