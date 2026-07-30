/**
 * Unit tests for Mobile Functionality
 * 
 * Comprehensive tests covering:
 * - Responsive layout behavior across breakpoints (Requirements 10.1)
 * - Touch gestures and mobile-specific interactions (Requirements 10.2)
 * - Offline capabilities and background sync (Requirements 10.6)
 * 
 * Requirements: 10.1, 10.2, 10.6
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BREAKPOINTS,
  MEDIA_QUERIES,
  MIN_TOUCH_TARGET,
  getCurrentBreakpoint,
  isBreakpointActive,
  isTouchDevice,
  BreakpointObserver,
  ResponsiveCSS,
} from '../../styles/responsive.js';
import { TouchGestureHandler } from './touch-gesture-handler.js';
import { PullToRefresh } from './pull-to-refresh.js';
import { StorageManager, StorageType } from '../../services/storage.js';

// Mock matchMedia
const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: matchMediaMock,
});

function createTouchEvent(
  type: string,
  touches: Array<{ clientX: number; clientY: number }>,
  changedTouches?: Array<{ clientX: number; clientY: number }>
): TouchEvent {
  const touchList = touches.map((t, i) => ({
    identifier: i,
    clientX: t.clientX,
    clientY: t.clientY,
    pageX: t.clientX,
    pageY: t.clientY,
    screenX: t.clientX,
    screenY: t.clientY,
    target: document.body,
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
    force: 1,
  })) as unknown as Touch[];

  const changed = (changedTouches || touches).map((t, i) => ({
    identifier: i,
    clientX: t.clientX,
    clientY: t.clientY,
    pageX: t.clientX,
    pageY: t.clientY,
    screenX: t.clientX,
    screenY: t.clientY,
    target: document.body,
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
    force: 1,
  })) as unknown as Touch[];

  return new TouchEvent(type, {
    touches: touchList,
    changedTouches: changed,
    bubbles: true,
    cancelable: true,
  });
}

// ===========================================================================
// Section 1: Responsive Layout Behavior Across Breakpoints
// ===========================================================================

describe('Responsive Layout Behavior Across Breakpoints', () => {
  describe('breakpoint transitions at boundary values', () => {
    it('transitions from mobile to tablet at exactly 640px', () => {
      Object.defineProperty(window, 'innerWidth', { value: 639, writable: true });
      expect(getCurrentBreakpoint()).toBe('mobile');

      Object.defineProperty(window, 'innerWidth', { value: 640, writable: true });
      expect(getCurrentBreakpoint()).toBe('tablet');
    });

    it('transitions from tablet to desktop at exactly 1024px', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1023, writable: true });
      expect(getCurrentBreakpoint()).toBe('tablet');

      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
      expect(getCurrentBreakpoint()).toBe('desktop');
    });

    it('handles minimum supported width of 320px', () => {
      Object.defineProperty(window, 'innerWidth', { value: 320, writable: true });
      expect(getCurrentBreakpoint()).toBe('mobile');
      expect(isBreakpointActive('mobile')).toBe(true);
      expect(isBreakpointActive('tablet')).toBe(false);
      expect(isBreakpointActive('desktop')).toBe(false);
    });

    it('handles very wide desktop widths', () => {
      Object.defineProperty(window, 'innerWidth', { value: 2560, writable: true });
      expect(getCurrentBreakpoint()).toBe('desktop');
      expect(isBreakpointActive('desktop')).toBe(true);
    });

    it('handles widths below minimum (e.g., 280px) as mobile', () => {
      Object.defineProperty(window, 'innerWidth', { value: 280, writable: true });
      expect(getCurrentBreakpoint()).toBe('mobile');
    });
  });

  describe('BreakpointObserver debounces resize events', () => {
    let observer: BreakpointObserver;

    beforeEach(() => {
      vi.useFakeTimers();
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
      observer = new BreakpointObserver();
      observer.start();
    });

    afterEach(() => {
      observer.destroy();
      vi.useRealTimers();
    });

    it('debounces rapid resize events (only fires once per 150ms)', async () => {
      const listener = vi.fn();
      observer.onChange(listener);

      // Fire multiple resize events rapidly
      Object.defineProperty(window, 'innerWidth', { value: 800, writable: true });
      window.dispatchEvent(new Event('resize'));
      Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });
      window.dispatchEvent(new Event('resize'));
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      window.dispatchEvent(new Event('resize'));

      // Should not fire until debounce completes
      expect(listener).not.toHaveBeenCalled();

      // After debounce period, uses the final width
      await vi.advanceTimersByTimeAsync(200);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('mobile', 375);
    });

    it('notifies on transition from desktop to mobile', async () => {
      const listener = vi.fn();
      observer.onChange(listener);

      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      window.dispatchEvent(new Event('resize'));
      await vi.advanceTimersByTimeAsync(200);

      expect(listener).toHaveBeenCalledWith('mobile', 375);
    });

    it('notifies on transition from mobile to tablet', async () => {
      // Start at mobile
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      window.dispatchEvent(new Event('resize'));
      await vi.advanceTimersByTimeAsync(200);

      const listener = vi.fn();
      observer.onChange(listener);

      Object.defineProperty(window, 'innerWidth', { value: 768, writable: true });
      window.dispatchEvent(new Event('resize'));
      await vi.advanceTimersByTimeAsync(200);

      expect(listener).toHaveBeenCalledWith('tablet', 768);
    });

    it('supports multiple listeners', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      observer.onChange(listener1);
      observer.onChange(listener2);

      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      window.dispatchEvent(new Event('resize'));
      await vi.advanceTimersByTimeAsync(200);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });

  describe('responsive CSS includes correct mobile-first structure', () => {
    it('mobile navigation is visible by default (bottom bar)', () => {
      expect(ResponsiveCSS).toContain('.responsive-nav--mobile');
      expect(ResponsiveCSS).toContain('position: fixed');
      expect(ResponsiveCSS).toContain('bottom: 0');
    });

    it('sidebar navigation appears on tablet and up', () => {
      expect(ResponsiveCSS).toContain('.responsive-nav--sidebar');
      expect(ResponsiveCSS).toContain('min-height: 100vh');
    });

    it('mobile layout has padding-bottom for fixed nav', () => {
      expect(ResponsiveCSS).toContain('padding-bottom: 72px');
    });

    it('responsive grid uses single column on mobile', () => {
      expect(ResponsiveCSS).toContain('grid-template-columns: 1fr');
    });

    it('responsive grid uses two columns on tablet', () => {
      expect(ResponsiveCSS).toContain('grid-template-columns: repeat(2, 1fr)');
    });

    it('responsive grid uses three columns on desktop', () => {
      expect(ResponsiveCSS).toContain('grid-template-columns: repeat(3, 1fr)');
    });

    it('touch targets enforce 44px minimum on touch devices', () => {
      expect(ResponsiveCSS).toContain(`min-width: ${MIN_TOUCH_TARGET}px`);
      expect(ResponsiveCSS).toContain(`min-height: ${MIN_TOUCH_TARGET}px`);
    });
  });

  describe('touch device detection', () => {
    it('detects touch device via coarse pointer media query', () => {
      matchMediaMock.mockImplementation((query: string) => ({
        matches: query === '(pointer: coarse)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      expect(isTouchDevice()).toBe(true);
    });

    it('returns false for non-touch devices', () => {
      matchMediaMock.mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      expect(isTouchDevice()).toBe(false);
    });
  });
});


// ===========================================================================
// Section 2: Touch Gestures and Mobile-Specific Interactions
// ===========================================================================

describe('Touch Gestures and Mobile-Specific Interactions', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    container.style.width = '375px';
    container.style.height = '667px';
    document.body.appendChild(container);
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({
        left: 0, top: 0, width: 375, height: 667,
        right: 375, bottom: 667, x: 0, y: 0, toJSON: () => {},
      }),
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  describe('vertical swipe detection', () => {
    it('detects upward swipe', () => {
      const onSwipeUp = vi.fn();
      const handler = new TouchGestureHandler(
        container,
        { onSwipeUp },
        { swipeThreshold: 50, swipeMinVelocity: 0.1 }
      );

      container.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 200, clientY: 400 }]));
      vi.advanceTimersByTime(100);
      container.dispatchEvent(createTouchEvent('touchend', [], [{ clientX: 200, clientY: 300 }]));

      expect(onSwipeUp).toHaveBeenCalledTimes(1);
      expect(onSwipeUp.mock.calls[0][0].direction).toBe('up');
      handler.destroy();
    });

    it('detects downward swipe', () => {
      const onSwipeDown = vi.fn();
      const handler = new TouchGestureHandler(
        container,
        { onSwipeDown },
        { swipeThreshold: 50, swipeMinVelocity: 0.1 }
      );

      container.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 200, clientY: 200 }]));
      vi.advanceTimersByTime(100);
      container.dispatchEvent(createTouchEvent('touchend', [], [{ clientX: 200, clientY: 320 }]));

      expect(onSwipeDown).toHaveBeenCalledTimes(1);
      expect(onSwipeDown.mock.calls[0][0].direction).toBe('down');
      handler.destroy();
    });
  });

  describe('gesture event data correctness', () => {
    it('provides accurate velocity and duration in swipe events', () => {
      const onSwipe = vi.fn();
      const handler = new TouchGestureHandler(
        container,
        { onSwipe },
        { swipeThreshold: 50, swipeMinVelocity: 0.1 }
      );

      container.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 100, clientY: 300 }]));
      vi.advanceTimersByTime(150);
      container.dispatchEvent(createTouchEvent('touchend', [], [{ clientX: 250, clientY: 300 }]));

      expect(onSwipe).toHaveBeenCalledTimes(1);
      const event = onSwipe.mock.calls[0][0];
      expect(event.deltaX).toBe(150);
      expect(event.deltaY).toBe(0);
      expect(event.startX).toBe(100);
      expect(event.startY).toBe(300);
      expect(event.endX).toBe(250);
      expect(event.endY).toBe(300);
      expect(event.duration).toBeGreaterThan(0);
      expect(event.velocity).toBeGreaterThan(0);
      handler.destroy();
    });

    it('provides correct start and end coordinates in tap events', () => {
      const onTap = vi.fn();
      const handler = new TouchGestureHandler(container, { onTap });

      container.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 150, clientY: 250 }]));
      vi.advanceTimersByTime(50);
      container.dispatchEvent(createTouchEvent('touchend', [], [{ clientX: 152, clientY: 251 }]));

      expect(onTap).toHaveBeenCalledTimes(1);
      const event = onTap.mock.calls[0][0];
      expect(event.startX).toBe(150);
      expect(event.startY).toBe(250);
      expect(event.endX).toBe(152);
      expect(event.endY).toBe(251);
      handler.destroy();
    });
  });

  describe('touch cancel handling', () => {
    it('cancels long press on touchcancel', () => {
      const onLongPress = vi.fn();
      const handler = new TouchGestureHandler(
        container,
        { onLongPress },
        { longPressDelay: 500 }
      );

      container.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
      vi.advanceTimersByTime(200);
      container.dispatchEvent(new TouchEvent('touchcancel', { bubbles: true }));
      vi.advanceTimersByTime(400);

      expect(onLongPress).not.toHaveBeenCalled();
      handler.destroy();
    });
  });

  describe('pull-to-refresh mobile interaction', () => {
    let ptrContainer: HTMLElement;

    beforeEach(() => {
      ptrContainer = document.createElement('div');
      ptrContainer.style.height = '400px';
      ptrContainer.style.overflow = 'auto';
      Object.defineProperty(ptrContainer, 'scrollTop', { value: 0, writable: true });
      document.body.appendChild(ptrContainer);
    });

    function createPtrTouchEvent(type: string, clientY: number): TouchEvent {
      return new TouchEvent(type, {
        touches: type === 'touchend' ? [] : [{ clientY, clientX: 100, identifier: 0 } as Touch],
        changedTouches: [{ clientY, clientX: 100, identifier: 0 } as Touch],
        bubbles: true,
        cancelable: true,
      });
    }

    it('applies resistance factor to pull distance', () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined);
      const ptr = new PullToRefresh({
        container: ptrContainer,
        onRefresh,
        resistance: 0.3,
      });

      ptrContainer.dispatchEvent(createPtrTouchEvent('touchstart', 100));
      ptrContainer.dispatchEvent(createPtrTouchEvent('touchmove', 200));

      // 100px raw * 0.3 resistance = 30px
      expect(ptr.getPullDistance()).toBe(30);
      ptr.destroy();
    });

    it('does not trigger refresh during refreshing state', async () => {
      let resolveRefresh: () => void;
      const refreshPromise = new Promise<void>((resolve) => {
        resolveRefresh = resolve;
      });
      const onRefresh = vi.fn().mockReturnValue(refreshPromise);

      const ptr = new PullToRefresh({
        container: ptrContainer,
        onRefresh,
        threshold: 40,
      });

      // First pull triggers refresh
      ptrContainer.dispatchEvent(createPtrTouchEvent('touchstart', 100));
      ptrContainer.dispatchEvent(createPtrTouchEvent('touchmove', 200));
      ptrContainer.dispatchEvent(createPtrTouchEvent('touchend', 200));

      expect(ptr.getState()).toBe('refreshing');

      // Second pull should not trigger
      ptrContainer.dispatchEvent(createPtrTouchEvent('touchstart', 100));
      ptrContainer.dispatchEvent(createPtrTouchEvent('touchmove', 200));
