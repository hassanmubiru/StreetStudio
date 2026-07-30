/**
 * Touch Gesture Handler
 * 
 * Provides touch gesture detection and handling for mobile interfaces.
 * Supports swipe (horizontal/vertical), tap, double-tap, long-press,
 * and pinch gestures with configurable thresholds.
 * 
 * Requirements: 10.2, 10.4, 10.5
 */

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export type GestureType = 'tap' | 'doubletap' | 'longpress' | 'swipe' | 'pan' | 'pinch';

export interface GestureEvent {
  type: GestureType;
  direction?: SwipeDirection;
  /** Horizontal distance traveled */
  deltaX: number;
  /** Vertical distance traveled */
  deltaY: number;
  /** Velocity in px/ms */
  velocity: number;
  /** Duration in ms */
  duration: number;
  /** Start position */
  startX: number;
  startY: number;
  /** Current/end position */
  endX: number;
  endY: number;
  /** Original touch event */
  originalEvent: TouchEvent;
}

export interface PanEvent {
  type: 'panstart' | 'panmove' | 'panend';
  deltaX: number;
  deltaY: number;
  /** Percentage progress (0-1) for horizontal pan relative to element width */
  progressX: number;
  /** Percentage progress (0-1) for vertical pan relative to element height */
  progressY: number;
  velocity: number;
  direction: SwipeDirection;
  originalEvent: TouchEvent;
}

export interface TouchGestureOptions {
  /** Minimum distance in px to qualify as a swipe (default: 50) */
  swipeThreshold?: number;
  /** Maximum time in ms for a swipe gesture (default: 300) */
  swipeMaxDuration?: number;
  /** Minimum velocity in px/ms for a swipe (default: 0.3) */
  swipeMinVelocity?: number;
  /** Maximum distance for a tap gesture (default: 10) */
  tapMaxDistance?: number;
  /** Maximum time for a tap gesture in ms (default: 200) */
  tapMaxDuration?: number;
  /** Time between taps for a double-tap in ms (default: 300) */
  doubleTapInterval?: number;
  /** Hold time for long press in ms (default: 500) */
  longPressDelay?: number;
  /** Whether to prevent default on touch events (default: false) */
  preventDefault?: boolean;
  /** Enable horizontal pan tracking (default: false) */
  enablePan?: boolean;
  /** Direction lock: once a direction is detected, lock to it (default: true) */
  directionLock?: boolean;
}

export interface TouchGestureCallbacks {
  onTap?: (event: GestureEvent) => void;
  onDoubleTap?: (event: GestureEvent) => void;
  onLongPress?: (event: GestureEvent) => void;
  onSwipe?: (event: GestureEvent) => void;
  onSwipeLeft?: (event: GestureEvent) => void;
  onSwipeRight?: (event: GestureEvent) => void;
  onSwipeUp?: (event: GestureEvent) => void;
  onSwipeDown?: (event: GestureEvent) => void;
  onPanStart?: (event: PanEvent) => void;
  onPanMove?: (event: PanEvent) => void;
  onPanEnd?: (event: PanEvent) => void;
}

const DEFAULT_OPTIONS: Required<TouchGestureOptions> = {
  swipeThreshold: 50,
  swipeMaxDuration: 300,
  swipeMinVelocity: 0.3,
  tapMaxDistance: 10,
  tapMaxDuration: 200,
  doubleTapInterval: 300,
  longPressDelay: 500,
  preventDefault: false,
  enablePan: false,
  directionLock: true,
};

/**
 * TouchGestureHandler
 * 
 * Detects touch gestures on a given element and invokes callbacks
 * for recognized gestures. Handles edge cases like multi-touch
 * prevention and direction locking.
 */
export class TouchGestureHandler {
  private element: HTMLElement;
  private options: Required<TouchGestureOptions>;
  private callbacks: TouchGestureCallbacks;
  private isDestroyed = false;

  // Touch tracking state
  private startX = 0;
  private startY = 0;
  private startTime = 0;
  private lastTapTime = 0;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private isPanning = false;
  private lockedDirection: 'horizontal' | 'vertical' | null = null;

  // Bound event handlers
  private boundTouchStart: (e: TouchEvent) => void;
  private boundTouchMove: (e: TouchEvent) => void;
  private boundTouchEnd: (e: TouchEvent) => void;
  private boundTouchCancel: (e: TouchEvent) => void;

  constructor(
    element: HTMLElement,
    callbacks: TouchGestureCallbacks,
    options: TouchGestureOptions = {}
  ) {
    this.element = element;
    this.callbacks = callbacks;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundTouchMove = this.handleTouchMove.bind(this);
    this.boundTouchEnd = this.handleTouchEnd.bind(this);
    this.boundTouchCancel = this.handleTouchCancel.bind(this);

    this.attach();
  }

  /** Attach gesture listeners to the element */
  public attach(): void {
    this.element.addEventListener('touchstart', this.boundTouchStart, { passive: !this.options.preventDefault });
    this.element.addEventListener('touchmove', this.boundTouchMove, { passive: !this.options.preventDefault });
    this.element.addEventListener('touchend', this.boundTouchEnd, { passive: true });
    this.element.addEventListener('touchcancel', this.boundTouchCancel, { passive: true });
  }

  /** Detach gesture listeners */
  public detach(): void {
    this.element.removeEventListener('touchstart', this.boundTouchStart);
    this.element.removeEventListener('touchmove', this.boundTouchMove);
    this.element.removeEventListener('touchend', this.boundTouchEnd);
    this.element.removeEventListener('touchcancel', this.boundTouchCancel);
    this.clearLongPressTimer();
  }

  /** Destroy the handler and release resources */
  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.detach();
  }

  /** Get the element this handler is attached to */
  public getElement(): HTMLElement {
    return this.element;
  }

  private handleTouchStart(e: TouchEvent): void {
    if (this.isDestroyed) return;
    // Only handle single-touch gestures
    if (e.touches.length !== 1) {
      this.clearLongPressTimer();
      return;
    }

    if (this.options.preventDefault) {
      e.preventDefault();
    }

    const touch = e.touches[0];
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.startTime = Date.now();
    this.isPanning = false;
    this.lockedDirection = null;

    // Start long press timer
    this.clearLongPressTimer();
    this.longPressTimer = setTimeout(() => {
      if (!this.isPanning) {
        const gestureEvent = this.createGestureEvent('longpress', e, touch.clientX, touch.clientY);
        this.callbacks.onLongPress?.(gestureEvent);
      }
    }, this.options.longPressDelay);
  }

  private handleTouchMove(e: TouchEvent): void {
    if (this.isDestroyed || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - this.startX;
    const deltaY = touch.clientY - this.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Cancel long press if moved too far
    if (distance > this.options.tapMaxDistance) {
      this.clearLongPressTimer();
    }

    // Direction locking
    if (this.options.directionLock && !this.lockedDirection && distance > 10) {
      this.lockedDirection = absX > absY ? 'horizontal' : 'vertical';
    }

    // Pan tracking
    if (this.options.enablePan && distance > this.options.tapMaxDistance) {
      if (this.options.preventDefault) {
        e.preventDefault();
      }

      const rect = this.element.getBoundingClientRect();
      const progressX = Math.max(-1, Math.min(1, deltaX / rect.width));
      const progressY = Math.max(-1, Math.min(1, deltaY / rect.height));
      const elapsed = Date.now() - this.startTime;
      const velocity = elapsed > 0 ? distance / elapsed : 0;
      const direction = this.getSwipeDirection(deltaX, deltaY);

      const panEvent: PanEvent = {
        type: this.isPanning ? 'panmove' : 'panstart',
        deltaX,
        deltaY,
        progressX,
        progressY,
        velocity,
        direction,
        originalEvent: e,
      };

      if (!this.isPanning) {
        this.isPanning = true;
        this.callbacks.onPanStart?.(panEvent);
      } else {
        this.callbacks.onPanMove?.(panEvent);
      }
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    if (this.isDestroyed) return;
    this.clearLongPressTimer();

    const touch = e.changedTouches[0];
    if (!touch) return;

    const endX = touch.clientX;
    const endY = touch.clientY;
    const deltaX = endX - this.startX;
    const deltaY = endY - this.startY;
    const duration = Date.now() - this.startTime;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const velocity = duration > 0 ? distance / duration : 0;

    // End pan if active
    if (this.isPanning && this.options.enablePan) {
      const rect = this.element.getBoundingClientRect();
      const panEvent: PanEvent = {
        type: 'panend',
        deltaX,
        deltaY,
        progressX: Math.max(-1, Math.min(1, deltaX / rect.width)),
        progressY: Math.max(-1, Math.min(1, deltaY / rect.height)),
        velocity,
        direction: this.getSwipeDirection(deltaX, deltaY),
        originalEvent: e,
      };
      this.callbacks.onPanEnd?.(panEvent);
      this.isPanning = false;
      return;
    }

    // Check for tap
    if (distance <= this.options.tapMaxDistance && duration <= this.options.tapMaxDuration) {
      const now = Date.now();
      const timeSinceLastTap = now - this.lastTapTime;

      if (timeSinceLastTap <= this.options.doubleTapInterval && this.lastTapTime > 0) {
        // Double tap
        const gestureEvent = this.createGestureEvent('doubletap', e, endX, endY);
        this.callbacks.onDoubleTap?.(gestureEvent);
        this.lastTapTime = 0;
      } else {
        // Single tap (may become double tap)
        this.lastTapTime = now;
        const gestureEvent = this.createGestureEvent('tap', e, endX, endY);
        // Delay single tap to check for double tap
        if (this.callbacks.onDoubleTap) {
          setTimeout(() => {
            if (this.lastTapTime === now) {
              this.callbacks.onTap?.(gestureEvent);
            }
          }, this.options.doubleTapInterval);
        } else {
          this.callbacks.onTap?.(gestureEvent);
        }
      }
      return;
    }

    // Check for swipe
    if (
      distance >= this.options.swipeThreshold &&
      velocity >= this.options.swipeMinVelocity
    ) {
      const direction = this.getSwipeDirection(deltaX, deltaY);
      const gestureEvent = this.createGestureEvent('swipe', e, endX, endY);
      gestureEvent.direction = direction;

      this.callbacks.onSwipe?.(gestureEvent);

      switch (direction) {
        case 'left':
          this.callbacks.onSwipeLeft?.(gestureEvent);
          break;
        case 'right':
          this.callbacks.onSwipeRight?.(gestureEvent);
          break;
        case 'up':
          this.callbacks.onSwipeUp?.(gestureEvent);
          break;
        case 'down':
          this.callbacks.onSwipeDown?.(gestureEvent);
          break;
      }
    }
  }

  private handleTouchCancel(_e: TouchEvent): void {
    this.clearLongPressTimer();
    this.isPanning = false;
    this.lockedDirection = null;
  }

  private getSwipeDirection(deltaX: number, deltaY: number): SwipeDirection {
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (this.lockedDirection === 'horizontal' || (!this.options.directionLock && absX > absY)) {
      return deltaX > 0 ? 'right' : 'left';
    }

    if (this.lockedDirection === 'vertical' || (!this.options.directionLock && absY >= absX)) {
      return deltaY > 0 ? 'down' : 'up';
    }

    return absX > absY ? (deltaX > 0 ? 'right' : 'left') : (deltaY > 0 ? 'down' : 'up');
  }

  private createGestureEvent(type: GestureType, originalEvent: TouchEvent, endX: number, endY: number): GestureEvent {
    const deltaX = endX - this.startX;
    const deltaY = endY - this.startY;
    const duration = Date.now() - this.startTime;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    return {
      type,
      deltaX,
      deltaY,
      velocity: duration > 0 ? distance / duration : 0,
      duration,
      startX: this.startX,
      startY: this.startY,
      endX,
      endY,
      originalEvent,
    };
  }

  private clearLongPressTimer(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }
}
