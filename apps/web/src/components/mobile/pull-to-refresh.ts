/**
 * Pull-to-Refresh Component
 * 
 * Implements pull-to-refresh functionality for content lists and activity feeds.
 * Uses touch events to detect pull gestures and triggers refresh callbacks.
 * Only activates on touch devices when content is scrolled to the top.
 * 
 * Requirements: 10.6
 */

import { isTouchDevice } from '../../styles/responsive.js';

export interface PullToRefreshOptions {
  /** The container element to attach pull-to-refresh to */
  container: HTMLElement;
  /** Callback invoked when refresh is triggered. Should return a promise that resolves when refresh is complete. */
  onRefresh: () => Promise<void>;
  /** Distance in pixels needed to trigger refresh (default: 80) */
  threshold?: number;
  /** Maximum pull distance in pixels (default: 150) */
  maxPull?: number;
  /** Whether pull-to-refresh is enabled (default: true) */
  enabled?: boolean;
  /** Custom spinner element (optional) */
  spinnerElement?: HTMLElement;
  /** Resistance factor for the pull (default: 0.5 — 50% of actual finger movement) */
  resistance?: number;
}

export type PullToRefreshState = 'idle' | 'pulling' | 'threshold-reached' | 'refreshing';

export class PullToRefresh {
  private container: HTMLElement;
  private onRefresh: () => Promise<void>;
  private threshold: number;
  private maxPull: number;
  private enabled: boolean;
  private resistance: number;

  private state: PullToRefreshState = 'idle';
  private startY = 0;
  private currentY = 0;
  private pullDistance = 0;
  private indicatorElement: HTMLElement | null = null;
  private isAtTop = true;

  private boundTouchStart: (e: TouchEvent) => void;
  private boundTouchMove: (e: TouchEvent) => void;
  private boundTouchEnd: (e: TouchEvent) => void;
  private boundScroll: () => void;

  constructor(options: PullToRefreshOptions) {
    this.container = options.container;
    this.onRefresh = options.onRefresh;
    this.threshold = options.threshold ?? 80;
    this.maxPull = options.maxPull ?? 150;
    this.enabled = options.enabled ?? true;
    this.resistance = options.resistance ?? 0.5;

    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundTouchMove = this.handleTouchMove.bind(this);
    this.boundTouchEnd = this.handleTouchEnd.bind(this);
    this.boundScroll = this.handleScroll.bind(this);

    this.createIndicator(options.spinnerElement);
    this.attach();
  }

  /** Get the current pull-to-refresh state */
  public getState(): PullToRefreshState {
    return this.state;
  }

  /** Get the current pull distance in pixels */
  public getPullDistance(): number {
    return this.pullDistance;
  }

  /** Enable pull-to-refresh */
  public enable(): void {
    this.enabled = true;
  }

  /** Disable pull-to-refresh */
  public disable(): void {
    this.enabled = false;
    this.reset();
  }

  /** Attach event listeners */
  public attach(): void {
    this.container.addEventListener('touchstart', this.boundTouchStart, { passive: true });
    this.container.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    this.container.addEventListener('touchend', this.boundTouchEnd, { passive: true });
    this.container.addEventListener('scroll', this.boundScroll, { passive: true });
  }

  /** Detach event listeners and clean up */
  public destroy(): void {
    this.container.removeEventListener('touchstart', this.boundTouchStart);
    this.container.removeEventListener('touchmove', this.boundTouchMove);
    this.container.removeEventListener('touchend', this.boundTouchEnd);
    this.container.removeEventListener('scroll', this.boundScroll);

    if (this.indicatorElement && this.indicatorElement.parentNode) {
      this.indicatorElement.parentNode.removeChild(this.indicatorElement);
    }
    this.indicatorElement = null;
  }

  private createIndicator(customElement?: HTMLElement): void {
    if (customElement) {
      this.indicatorElement = customElement;
    } else {
      this.indicatorElement = document.createElement('div');
      this.indicatorElement.className = 'pull-to-refresh-indicator';
      this.indicatorElement.setAttribute('role', 'status');
      this.indicatorElement.setAttribute('aria-live', 'polite');
      this.indicatorElement.innerHTML = `
        <div class="pull-to-refresh-spinner" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 4v6h6" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </div>
        <span class="pull-to-refresh-text">Pull to refresh</span>
      `;
      this.indicatorElement.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 0;
        overflow: hidden;
        transition: none;
        z-index: 10;
        color: #6b7280;
        font-size: 0.875rem;
      `;
    }

    // Ensure container is positioned for the indicator
    const containerPosition = getComputedStyle(this.container).position;
    if (containerPosition === 'static') {
      this.container.style.position = 'relative';
    }

    this.container.insertBefore(this.indicatorElement, this.container.firstChild);
  }

  private handleScroll(): void {
    this.isAtTop = this.container.scrollTop <= 0;
  }

  private handleTouchStart(e: TouchEvent): void {
    if (!this.enabled || this.state === 'refreshing') return;
    if (!this.isAtTop) return;

    const touch = e.touches[0];
    if (!touch) return;

    this.startY = touch.clientY;
    this.currentY = touch.clientY;
    this.state = 'idle';
  }

  private handleTouchMove(e: TouchEvent): void {
    if (!this.enabled || this.state === 'refreshing') return;
    if (!this.isAtTop) return;
    if (this.startY === 0) return;

    const touch = e.touches[0];
    if (!touch) return;

    this.currentY = touch.clientY;
    const rawDistance = this.currentY - this.startY;

    // Only activate on downward pull
    if (rawDistance <= 0) {
      this.reset();
      return;
    }

    // Prevent default scrolling behavior when pulling
    e.preventDefault();

    // Apply resistance
    this.pullDistance = Math.min(rawDistance * this.resistance, this.maxPull);

    if (this.pullDistance >= this.threshold) {
      this.state = 'threshold-reached';
      this.updateIndicator('Release to refresh');
    } else {
      this.state = 'pulling';
      this.updateIndicator('Pull to refresh');
    }

    this.applyPullTransform();
  }

  private handleTouchEnd(_e: TouchEvent): void {
    if (!this.enabled) return;

    if (this.state === 'threshold-reached') {
      this.triggerRefresh();
    } else {
      this.reset();
    }
  }

  private async triggerRefresh(): Promise<void> {
    this.state = 'refreshing';
    this.updateIndicator('Refreshing...');
    this.applyRefreshingTransform();

    try {
      await this.onRefresh();
    } catch (error) {
      // Silently handle refresh errors — the caller's UI should reflect the failure
    } finally {
      this.reset();
    }
  }

  private updateIndicator(text: string): void {
    if (!this.indicatorElement) return;

    const textEl = this.indicatorElement.querySelector('.pull-to-refresh-text');
    if (textEl) {
      textEl.textContent = text;
    }

    // Rotate spinner based on progress
    const spinner = this.indicatorElement.querySelector('.pull-to-refresh-spinner');
    if (spinner) {
      const progress = Math.min(this.pullDistance / this.threshold, 1);
      const rotation = progress * 360;
      (spinner as HTMLElement).style.transform = `rotate(${rotation}deg)`;

      if (this.state === 'refreshing') {
        (spinner as HTMLElement).style.animation = 'spin 1s linear infinite';
      } else {
        (spinner as HTMLElement).style.animation = 'none';
      }
    }
  }

  private applyPullTransform(): void {
    if (!this.indicatorElement) return;
    this.indicatorElement.style.height = `${this.pullDistance}px`;
    this.indicatorElement.style.transition = 'none';
  }

  private applyRefreshingTransform(): void {
    if (!this.indicatorElement) return;
    this.indicatorElement.style.height = `${this.threshold}px`;
    this.indicatorElement.style.transition = 'height 0.2s ease';
  }

  private reset(): void {
    this.state = 'idle';
    this.startY = 0;
    this.currentY = 0;
    this.pullDistance = 0;

    if (this.indicatorElement) {
      this.indicatorElement.style.height = '0';
      this.indicatorElement.style.transition = 'height 0.3s ease';
    }
  }
}

/**
 * CSS for pull-to-refresh spinner animation.
 * Should be injected once into the document.
 */
export const PullToRefreshCSS = `
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.pull-to-refresh-indicator {
  pointer-events: none;
  user-select: none;
}

.pull-to-refresh-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
}
`;

/**
 * Injects pull-to-refresh CSS styles into the document.
 */
export function setupPullToRefreshCSS(): void {
  let styleElement = document.getElementById('streetstudio-pull-to-refresh-styles') as HTMLStyleElement;
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = 'streetstudio-pull-to-refresh-styles';
    document.head.appendChild(styleElement);
  }
  styleElement.textContent = PullToRefreshCSS;
}
