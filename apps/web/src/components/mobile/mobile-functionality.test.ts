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
