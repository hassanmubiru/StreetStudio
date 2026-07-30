/**
 * Skip Links
 * 
 * Implements skip navigation that appears on focus with links to main content,
 * navigation, and search areas. Allows keyboard users to bypass repetitive
 * navigation elements.
 * 
 * Requirements: 11.5 - Skip links for main navigation, allowing keyboard users
 * to bypass repetitive navigation elements
 */

/** Configuration for a single skip link */
export interface SkipLinkConfig {
  /** Target element ID (without #) */
  targetId: string;
  /** Display text for the skip link */
  label: string;
  /** Optional: priority for ordering (lower = first) */
  priority?: number;
}

/** Default skip link targets */
const DEFAULT_SKIP_LINKS: SkipLinkConfig[] = [
  { targetId: 'main-content', label: 'Skip to main content', priority: 1 },
  { targetId: 'navigation', label: 'Skip to navigation', priority: 2 },
  { targetId: 'search', label: 'Skip to search', priority: 3 },
];

/**
 * Skip links component that creates an accessible skip navigation system.
 * Links are visually hidden until focused, then appear at the top of the viewport.
 */
export class SkipLinks {
  private container: HTMLElement | null = null;
  private links: SkipLinkConfig[];
  private styleElement: HTMLStyleElement | null = null;

  constructor(links: SkipLinkConfig[] = DEFAULT_SKIP_LINKS) {
    this.links = [...links].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  }

  /**
   * Render skip links and inject them at the beginning of the document body.
   */
  render(): HTMLElement {
    this.container = document.createElement('nav');
    this.container.className = 'skip-links';
    this.container.setAttribute('aria-label', 'Skip navigation');

    this.links.forEach((link) => {
      const anchor = document.createElement('a');
      anchor.href = `#${link.targetId}`;
      anchor.className = 'skip-link';
      anchor.textContent = link.label;

      anchor.addEventListener('click', (event) => {
        event.preventDefault();
        this.navigateToTarget(link.targetId);
      });

      this.container!.appendChild(anchor);
    });

    this.injectStyles();
    return this.container;
  }

  /**
   * Insert the skip links at the start of the body element.
   */
  mount(): void {
    const element = this.render();
    if (document.body.firstChild) {
      document.body.insertBefore(element, document.body.firstChild);
    } else {
      document.body.appendChild(element);
    }
  }

  /**
   * Remove skip links from the DOM.
   */
  unmount(): void {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    if (this.styleElement && this.styleElement.parentNode) {
      this.styleElement.parentNode.removeChild(this.styleElement);
    }
    this.container = null;
    this.styleElement = null;
  }

  /**
   * Add a new skip link to the set.
   */
  addLink(config: SkipLinkConfig): void {
    this.links.push(config);
    this.links.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

    // Re-render if already mounted
    if (this.container && this.container.parentNode) {
      const parent = this.container.parentNode;
      const nextSibling = this.container.nextSibling;
      parent.removeChild(this.container);
      const newElement = this.render();
      if (nextSibling) {
        parent.insertBefore(newElement, nextSibling);
      } else {
        parent.appendChild(newElement);
      }
    }
  }

  /**
   * Remove a skip link by target ID.
   */
  removeLink(targetId: string): void {
    this.links = this.links.filter((link) => link.targetId !== targetId);

    // Re-render if already mounted
    if (this.container && this.container.parentNode) {
      const parent = this.container.parentNode;
      const nextSibling = this.container.nextSibling;
      parent.removeChild(this.container);
      const newElement = this.render();
      if (nextSibling) {
        parent.insertBefore(newElement, nextSibling);
      } else {
        parent.appendChild(newElement);
      }
    }
  }

  /**
   * Get the current list of configured skip links.
   */
  getLinks(): ReadonlyArray<SkipLinkConfig> {
    return this.links;
  }

  /**
   * Navigate focus to the target element.
   */
  private navigateToTarget(targetId: string): void {
    const target = document.getElementById(targetId);
    if (target) {
      // Ensure element is focusable
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
      }
      target.focus();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Inject CSS styles for skip links.
   */
  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.setAttribute('data-skip-links', 'true');
    this.styleElement.textContent = `
      .skip-links {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 2px;
        pointer-events: none;
      }

      .skip-link {
        position: absolute;
        top: -100%;
        left: 4px;
        padding: 8px 16px;
        background-color: #000000;
        color: #ffffff;
        text-decoration: none;
        font-size: 14px;
        font-weight: 600;
        border-radius: 0 0 4px 4px;
        pointer-events: auto;
        outline: 2px solid transparent;
        outline-offset: 2px;
        transition: top 0.15s ease-in-out;
        white-space: nowrap;
      }

      .skip-link:focus {
        position: relative;
        top: 0;
        outline: 2px solid #4f46e5;
        outline-offset: 2px;
      }

      .skip-link:focus-visible {
        outline: 2px solid #4f46e5;
        outline-offset: 2px;
      }

      /* High contrast mode support */
      @media (forced-colors: active) {
        .skip-link {
          border: 2px solid ButtonText;
          background-color: Canvas;
          color: ButtonText;
        }

        .skip-link:focus {
          outline: 3px solid Highlight;
        }
      }

      /* Respect reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .skip-link {
          transition: none;
        }
      }
    `;
    document.head.appendChild(this.styleElement);
  }
}
