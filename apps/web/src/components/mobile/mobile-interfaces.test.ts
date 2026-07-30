/**
 * Unit tests for Mobile-Optimized Interfaces
 * 
 * Tests touch gesture handling, mobile video player controls,
 * mobile comment input with keyboard optimization, and swipe actions.
 * 
 * Requirements: 10.4, 10.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TouchGestureHandler } from './touch-gesture-handler.js';
import { MobileVideoPlayer } from './mobile-video-player.js';
import { MobileCommentInput } from './mobile-comment-input.js';
import { SwipeableItem, SwipeActionsList } from './swipe-actions.js';

// --- Helper functions ---

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

function simulateSwipe(
  element: HTMLElement,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  duration = 100
): void {
  const start = createTouchEvent('touchstart', [{ clientX: startX, clientY: startY }]);
  element.dispatchEvent(start);

  // Simulate passage of time (fast swipe)
  vi.advanceTimersByTime(duration);

  const end = createTouchEvent('touchend', [], [{ clientX: endX, clientY: endY }]);
  element.dispatchEvent(end);
}

// ===========================================================================
// TouchGestureHandler Tests
// ===========================================================================

describe('TouchGestureHandler', () => {
  let container: HTMLElement;
  let handler: TouchGestureHandler;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    container.style.width = '375px';
    container.style.height = '667px';
    document.body.appendChild(container);
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 375, height: 667, right: 375, bottom: 667, x: 0, y: 0, toJSON: () => {} }),
    });
  });

  afterEach(() => {
    handler?.destroy();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('should detect tap gestures', () => {
    const onTap = vi.fn();
    handler = new TouchGestureHandler(container, { onTap }, { tapMaxDuration: 200 });

    const start = createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]);
    container.dispatchEvent(start);
    vi.advanceTimersByTime(50);
    const end = createTouchEvent('touchend', [], [{ clientX: 101, clientY: 101 }]);
    container.dispatchEvent(end);

    // Tap fires immediately when no double-tap listener
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onTap.mock.calls[0][0].type).toBe('tap');
  });
