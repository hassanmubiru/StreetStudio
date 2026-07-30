/**
 * Unit tests for Pull-to-Refresh Component
 * 
 * Requirements: 10.6
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PullToRefresh, setupPullToRefreshCSS } from './pull-to-refresh.js';

// Mock matchMedia for touch device detection
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: query.includes('pointer: coarse'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

function createTouchEvent(type: string, clientY: number): TouchEvent {
  return new TouchEvent(type, {
    touches: type === 'touchend' ? [] : [{ clientY, clientX: 100, identifier: 0 } as Touch],
    changedTouches: [{ clientY, clientX: 100, identifier: 0 } as Touch],
    bubbles: true,
    cancelable: true,
  });
}

describe('PullToRefresh', () => {
  let container: HTMLElement;
  let onRefresh: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.height = '400px';
    container.style.overflow = 'auto';
    Object.defineProperty(container, 'scrollTop', { value: 0, writable: true });
    document.body.appendChild(container);
    onRefresh = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('initialization', () => {
    it('creates the pull-to-refresh instance', () => {
      const ptr = new PullToRefresh({ container, onRefresh });
      expect(ptr).toBeDefined();
      expect(ptr.getState()).toBe('idle');
      ptr.destroy();
    });

    it('creates an indicator element in the container', () => {
      const ptr = new PullToRefresh({ container, onRefresh });
      const indicator = container.querySelector('.pull-to-refresh-indicator');
      expect(indicator).not.toBeNull();
      ptr.destroy();
    });

    it('sets the container position to relative if static', () => {
      container.style.position = 'static';
      const ptr = new PullToRefresh({ container, onRefresh });
      expect(container.style.position).toBe('relative');
      ptr.destroy();
    });

    it('does not override non-static position', () => {
      container.style.position = 'absolute';
      const ptr = new PullToRefresh({ container, onRefresh });
      expect(container.style.position).toBe('absolute');
      ptr.destroy();
    });

    it('indicator has role=status and aria-live=polite', () => {
      const ptr = new PullToRefresh({ container, onRefresh });
      const indicator = container.querySelector('.pull-to-refresh-indicator');
      expect(indicator?.getAttribute('role')).toBe('status');
      expect(indicator?.getAttribute('aria-live')).toBe('polite');
      ptr.destroy();
    });
  });

  describe('state management', () => {
    it('starts in idle state', () => {
      const ptr = new PullToRefresh({ container, onRefresh });
      expect(ptr.getState()).toBe('idle');
      ptr.destroy();
    });

    it('returns 0 pull distance when idle', () => {
      const ptr = new PullToRefresh({ container, onRefresh });
      expect(ptr.getPullDistance()).toBe(0);
      ptr.destroy();
    });

    it('transitions to pulling state on touch move down', () => {
      const ptr = new PullToRefresh({ container, onRefresh });

      container.dispatchEvent(createTouchEvent('touchstart', 100));
      container.dispatchEvent(createTouchEvent('touchmove', 140));

      expect(ptr.getState()).toBe('pulling');
      ptr.destroy();
    });

    it('transitions to threshold-reached when pulled far enough', () => {
      const ptr = new PullToRefresh({ container, onRefresh, threshold: 40 });

      container.dispatchEvent(createTouchEvent('touchstart', 100));
      // With default resistance of 0.5, need to move 80px to get 40px pull distance
      container.dispatchEvent(createTouchEvent('touchmove', 200));

      expect(ptr.getState()).toBe('threshold-reached');
      ptr.destroy();
    });

    it('does not activate when pulling up', () => {
      const ptr = new PullToRefresh({ container, onRefresh });

      container.dispatchEvent(createTouchEvent('touchstart', 200));
      container.dispatchEvent(createTouchEvent('touchmove', 100));

      expect(ptr.getState()).toBe('idle');
      ptr.destroy();
    });
  });

  describe('refresh triggering', () => {
    it('calls onRefresh when released after threshold', async () => {
      const ptr = new PullToRefresh({ container, onRefresh, threshold: 40 });

      container.dispatchEvent(createTouchEvent('touchstart', 100));
      container.dispatchEvent(createTouchEvent('touchmove', 200));
      container.dispatchEvent(createTouchEvent('touchend', 200));

      // Allow the async refresh to process
      await vi.waitFor(() => {
        expect(onRefresh).toHaveBeenCalledTimes(1);
      });

      ptr.destroy();
    });

    it('does not call onRefresh when released before threshold', () => {
      const ptr = new PullToRefresh({ container, onRefresh, threshold: 80 });

      container.dispatchEvent(createTouchEvent('touchstart', 100));
      container.dispatchEvent(createTouchEvent('touchmove', 120)); // small pull
      container.dispatchEvent(createTouchEvent('touchend', 120));

      expect(onRefresh).not.toHaveBeenCalled();
      ptr.destroy();
    });

    it('resets to idle after refresh completes', async () => {
      const ptr = new PullToRefresh({ container, onRefresh, threshold: 40 });

      container.dispatchEvent(createTouchEvent('touchstart', 100));
      container.dispatchEvent(createTouchEvent('touchmove', 200));
      container.dispatchEvent(createTouchEvent('touchend', 200));

      await vi.waitFor(() => {
        expect(ptr.getState()).toBe('idle');
      });

      ptr.destroy();
    });

    it('handles refresh errors gracefully', async () => {
      const failingRefresh = vi.fn().mockRejectedValue(new Error('Network error'));
      const ptr = new PullToRefresh({ container, onRefresh: failingRefresh, threshold: 40 });

      container.dispatchEvent(createTouchEvent('touchstart', 100));
      container.dispatchEvent(createTouchEvent('touchmove', 200));
      container.dispatchEvent(createTouchEvent('touchend', 200));

      await vi.waitFor(() => {
        expect(ptr.getState()).toBe('idle');
      });

      ptr.destroy();
    });
  });

  describe('enable/disable', () => {
    it('does not respond to touches when disabled', () => {
      const ptr = new PullToRefresh({ container, onRefresh });
      ptr.disable();

      container.dispatchEvent(createTouchEvent('touchstart', 100));
      container.dispatchEvent(createTouchEvent('touchmove', 200));

      expect(ptr.getState()).toBe('idle');
      ptr.destroy();
    });

    it('responds to touches after re-enabling', () => {
      const ptr = new PullToRefresh({ container, onRefresh, threshold: 40 });
      ptr.disable();
      ptr.enable();

      container.dispatchEvent(createTouchEvent('touchstart', 100));
      container.dispatchEvent(createTouchEvent('touchmove', 200));

      expect(ptr.getState()).toBe('threshold-reached');
      ptr.destroy();
    });

    it('can be initialized as disabled', () => {
      const ptr = new PullToRefresh({ container, onRefresh, enabled: false });

      container.dispatchEvent(createTouchEvent('touchstart', 100));
      container.dispatchEvent(createTouchEvent('touchmove', 200));

      expect(ptr.getState()).toBe('idle');
      ptr.destroy();
    });
  });

  describe('scroll position', () => {
    it('does not activate when container is scrolled down', () => {
      const ptr = new PullToRefresh({ container, onRefresh });

      // Simulate scrolled state
      Object.defineProperty(container, 'scrollTop', { value: 100, writable: true });
      container.dispatchEvent(new Event('scroll'));

      container.dispatchEvent(createTouchEvent('touchstart', 100));
      container.dispatchEvent(createTouchEvent('touchmove', 200));

      expect(ptr.getState()).toBe('idle');
      ptr.destroy();
    });

    it('activates when scrolled back to top', () => {
      const ptr = new PullToRefresh({ container, onRefresh, threshold: 40 });

      // Scroll down first
      Object.defineProperty(container, 'scrollTop', { value: 100, writable: true });
      container.dispatchEvent(new Event('scroll'));

      // Then scroll back to top
      Object.defineProperty(container, 'scrollTop', { value: 0, writable: true });
      container.dispatchEvent(new Event('scroll'));

      container.dispatchEvent(createTouchEvent('touchstart', 100));
      container.dispatchEvent(createTouchEvent('touchmove', 200));

      expect(ptr.getState()).toBe('threshold-reached');
      ptr.destroy();
    });
  });

  describe('destroy', () => {
    it('removes the indicator element', () => {
      const ptr = new PullToRefresh({ container, onRefresh });
      expect(container.querySelector('.pull-to-refresh-indicator')).not.toBeNull();

      ptr.destroy();
      expect(container.querySelector('.pull-to-refresh-indicator')).toBeNull();
    });

    it('stops responding to touch events after destroy', () => {
      const ptr = new PullToRefresh({ container, onRefresh });
      ptr.destroy();

      container.dispatchEvent(createTouchEvent('touchstart', 100));
      container.dispatchEvent(createTouchEvent('touchmove', 200));

      expect(ptr.getState()).toBe('idle');
    });
  });

  describe('setupPullToRefreshCSS', () => {
    it('injects CSS into the document head', () => {
      setupPullToRefreshCSS();
      const style = document.getElementById('streetstudio-pull-to-refresh-styles');
      expect(style).not.toBeNull();
      expect(style?.tagName).toBe('STYLE');
    });

    it('does not duplicate styles on multiple calls', () => {
      setupPullToRefreshCSS();
      setupPullToRefreshCSS();
      const styles = document.querySelectorAll('#streetstudio-pull-to-refresh-styles');
      expect(styles.length).toBe(1);
    });
  });

  describe('resistance', () => {
    it('applies resistance factor to pull distance', () => {
      const ptr = new PullToRefresh({ container, onRefresh, resistance: 0.5 });

      container.dispatchEvent(createTouchEvent('touchstart', 100));
      container.dispatchEvent(createTouchEvent('touchmove', 200));

      // 100px raw * 0.5 resistance = 50px pull distance
      expect(ptr.getPullDistance()).toBe(50);
      ptr.destroy();
    });

    it('caps pull distance at maxPull', () => {
      const ptr = new PullToRefresh({ container, onRefresh, resistance: 1, maxPull: 100 });

      container.dispatchEvent(createTouchEvent('touchstart', 100));
      container.dispatchEvent(createTouchEvent('touchmove', 400)); // 300px raw

      expect(ptr.getPullDistance()).toBe(100); // capped
      ptr.destroy();
    });
  });
});
