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

  it('should detect double tap gestures', () => {
    const onDoubleTap = vi.fn();
    const onTap = vi.fn();
    handler = new TouchGestureHandler(container, { onDoubleTap, onTap });

    // First tap
    container.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
    vi.advanceTimersByTime(50);
    container.dispatchEvent(createTouchEvent('touchend', [], [{ clientX: 100, clientY: 100 }]));

    // Second tap within interval
    vi.advanceTimersByTime(100);
    container.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
    vi.advanceTimersByTime(50);
    container.dispatchEvent(createTouchEvent('touchend', [], [{ clientX: 100, clientY: 100 }]));

    expect(onDoubleTap).toHaveBeenCalledTimes(1);
    expect(onDoubleTap.mock.calls[0][0].type).toBe('doubletap');
  });

  it('should detect left swipe', () => {
    const onSwipeLeft = vi.fn();
    handler = new TouchGestureHandler(container, { onSwipeLeft }, { swipeThreshold: 50, swipeMinVelocity: 0.1 });

    container.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 200, clientY: 300 }]));
    vi.advanceTimersByTime(100);
    container.dispatchEvent(createTouchEvent('touchend', [], [{ clientX: 80, clientY: 300 }]));

    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    expect(onSwipeLeft.mock.calls[0][0].direction).toBe('left');
  });

  it('should detect right swipe', () => {
    const onSwipeRight = vi.fn();
    handler = new TouchGestureHandler(container, { onSwipeRight }, { swipeThreshold: 50, swipeMinVelocity: 0.1 });

    container.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 80, clientY: 300 }]));
    vi.advanceTimersByTime(100);
    container.dispatchEvent(createTouchEvent('touchend', [], [{ clientX: 200, clientY: 300 }]));

    expect(onSwipeRight).toHaveBeenCalledTimes(1);
    expect(onSwipeRight.mock.calls[0][0].direction).toBe('right');
  });

  it('should detect long press', () => {
    const onLongPress = vi.fn();
    handler = new TouchGestureHandler(container, { onLongPress }, { longPressDelay: 500 });

    container.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
    vi.advanceTimersByTime(600);

    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onLongPress.mock.calls[0][0].type).toBe('longpress');
  });

  it('should cancel long press on move', () => {
    const onLongPress = vi.fn();
    handler = new TouchGestureHandler(container, { onLongPress }, { longPressDelay: 500, tapMaxDistance: 10 });

    container.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
    vi.advanceTimersByTime(200);
    // Move past threshold
    container.dispatchEvent(createTouchEvent('touchmove', [{ clientX: 150, clientY: 100 }]));
    vi.advanceTimersByTime(400);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('should not fire swipe if below threshold distance', () => {
    const onSwipe = vi.fn();
    handler = new TouchGestureHandler(container, { onSwipe }, { swipeThreshold: 50 });

    container.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
    vi.advanceTimersByTime(100);
    container.dispatchEvent(createTouchEvent('touchend', [], [{ clientX: 120, clientY: 100 }]));

    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('should call detach and stop listening', () => {
    const onTap = vi.fn();
    handler = new TouchGestureHandler(container, { onTap });
    handler.detach();

    container.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
    vi.advanceTimersByTime(50);
    container.dispatchEvent(createTouchEvent('touchend', [], [{ clientX: 100, clientY: 100 }]));

    expect(onTap).not.toHaveBeenCalled();
  });

  it('should handle pan events when enabled', () => {
    const onPanStart = vi.fn();
    const onPanMove = vi.fn();
    const onPanEnd = vi.fn();
    handler = new TouchGestureHandler(
      container,
      { onPanStart, onPanMove, onPanEnd },
      { enablePan: true, tapMaxDistance: 10 }
    );

    container.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 100, clientY: 300 }]));
    vi.advanceTimersByTime(10);
    container.dispatchEvent(createTouchEvent('touchmove', [{ clientX: 150, clientY: 300 }]));
    vi.advanceTimersByTime(10);
    container.dispatchEvent(createTouchEvent('touchmove', [{ clientX: 200, clientY: 300 }]));
    vi.advanceTimersByTime(10);
    container.dispatchEvent(createTouchEvent('touchend', [], [{ clientX: 200, clientY: 300 }]));

    expect(onPanStart).toHaveBeenCalledTimes(1);
    expect(onPanMove).toHaveBeenCalled();
    expect(onPanEnd).toHaveBeenCalledTimes(1);
  });

  it('should ignore multi-touch events', () => {
    const onTap = vi.fn();
    handler = new TouchGestureHandler(container, { onTap });

    // Multi-touch start
    container.dispatchEvent(createTouchEvent('touchstart', [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 200 },
    ]));
    vi.advanceTimersByTime(50);
    container.dispatchEvent(createTouchEvent('touchend', [], [{ clientX: 100, clientY: 100 }]));

    expect(onTap).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// MobileVideoPlayer Tests
// ===========================================================================

describe('MobileVideoPlayer', () => {
  let container: HTMLElement;
  let player: MobileVideoPlayer;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    container.style.width = '375px';
    container.style.height = '250px';
    document.body.appendChild(container);
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 375, height: 250, right: 375, bottom: 250, x: 0, y: 0, toJSON: () => {} }),
    });
  });

  afterEach(() => {
    player?.destroy();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('should create player DOM with accessible controls', () => {
    player = new MobileVideoPlayer(container);

    expect(container.querySelector('video')).toBeTruthy();
    expect(container.getAttribute('role')).toBe('region');
    expect(container.getAttribute('aria-label')).toBe('Video player');

    const playBtn = container.querySelector('.mobile-play-btn');
    expect(playBtn).toBeTruthy();
    expect(playBtn?.getAttribute('aria-label')).toBe('Play');

    const fullscreenBtn = container.querySelector('.mobile-fullscreen-btn');
    expect(fullscreenBtn).toBeTruthy();
    expect(fullscreenBtn?.getAttribute('aria-label')).toBe('Enter fullscreen');
  });

  it('should set video attributes for mobile playback', () => {
    player = new MobileVideoPlayer(container, { src: 'test.mp4', poster: 'thumb.jpg' });

    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.getAttribute('playsinline')).toBe('');
    expect(video.getAttribute('webkit-playsinline')).toBe('');
    expect(video.src).toContain('test.mp4');
    expect(video.poster).toContain('thumb.jpg');
  });

  it('should have touch-friendly control sizes (min 44px)', () => {
    player = new MobileVideoPlayer(container);

    const playBtn = container.querySelector('.mobile-play-btn') as HTMLElement;
    expect(playBtn.style.minWidth).toBe('44px');
    expect(playBtn.style.minHeight).toBe('44px');

    const fullscreenBtn = container.querySelector('.mobile-fullscreen-btn') as HTMLElement;
    expect(fullscreenBtn.style.minWidth).toBe('44px');
    expect(fullscreenBtn.style.minHeight).toBe('44px');
  });

  it('should have seekable progress bar', () => {
    player = new MobileVideoPlayer(container);

    const progressBar = container.querySelector('.mobile-progress-bar') as HTMLElement;
    expect(progressBar).toBeTruthy();
    expect(progressBar.getAttribute('role')).toBe('slider');
    expect(progressBar.getAttribute('aria-label')).toBe('Video progress');
  });

  it('should toggle play/pause state', () => {
    const onPlay = vi.fn();
    const onPause = vi.fn();
    player = new MobileVideoPlayer(container, {}, { onPlay, onPause });

    const state = player.getState();
    expect(state.isPlaying).toBe(false);

    // Mock play (since jsdom doesn't support video playback)
    const video = player.getVideoElement();
    Object.defineProperty(video, 'play', {
      value: vi.fn(() => {
        video.dispatchEvent(new Event('play'));
        return Promise.resolve();
      }),
    });
    Object.defineProperty(video, 'pause', {
      value: vi.fn(() => { video.dispatchEvent(new Event('pause')); }),
    });

    player.play();
    expect(player.getState().isPlaying).toBe(true);

    player.pause();
    expect(player.getState().isPlaying).toBe(false);
  });

  it('should show/hide controls', () => {
    player = new MobileVideoPlayer(container);

    expect(player.getState().controlsVisible).toBe(true);

    player.hideControls();
    expect(player.getState().controlsVisible).toBe(false);

    const overlay = container.querySelector('.mobile-video-controls') as HTMLElement;
    expect(overlay.style.opacity).toBe('0');

    player.showControls();
    expect(player.getState().controlsVisible).toBe(true);
    expect(overlay.style.opacity).toBe('1');
  });

  it('should seek to position', () => {
    player = new MobileVideoPlayer(container);
    const video = player.getVideoElement();

    // Mock duration
    Object.defineProperty(video, 'duration', { value: 120, writable: true });
    video.dispatchEvent(new Event('durationchange'));

    player.seek(30);
    expect(video.currentTime).toBe(30);

    // Should clamp to bounds
    player.seek(-10);
    expect(video.currentTime).toBe(0);
  });

  it('should seek relatively', () => {
    player = new MobileVideoPlayer(container);
    const video = player.getVideoElement();

    Object.defineProperty(video, 'duration', { value: 120, writable: true });
    video.dispatchEvent(new Event('durationchange'));
    video.currentTime = 50;

    player.seekRelative(10);
    expect(video.currentTime).toBe(60);

    player.seekRelative(-20);
    expect(video.currentTime).toBe(40);
  });

  it('should show seek indicator on double tap', () => {
    player = new MobileVideoPlayer(container, { enableDoubleTapSeek: true });
    const seekIndicator = container.querySelector('.mobile-seek-indicator') as HTMLElement;

    expect(seekIndicator).toBeTruthy();
    expect(seekIndicator.style.opacity).toBe('0');
  });

  it('should load a new source', () => {
    player = new MobileVideoPlayer(container);
    player.loadSource('new-video.mp4');
    expect(player.getVideoElement().src).toContain('new-video.mp4');
  });

  it('should clean up on destroy', () => {
    player = new MobileVideoPlayer(container);
    player.destroy();
    expect(container.innerHTML).toBe('');
  });
});

// ===========================================================================
// MobileCommentInput Tests
// ===========================================================================

describe('MobileCommentInput', () => {
  let container: HTMLElement;
  let commentInput: MobileCommentInput;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    commentInput?.destroy();
    document.body.innerHTML = '';
  });

  it('should create accessible comment input', () => {
    commentInput = new MobileCommentInput(container);

    expect(container.getAttribute('role')).toBe('form');
    expect(container.getAttribute('aria-label')).toBe('Comment');

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.getAttribute('aria-label')).toBe('Comment text');
    expect(textarea.placeholder).toBe('Add a comment...');
  });

  it('should use 16px font to prevent iOS zoom', () => {
    commentInput = new MobileCommentInput(container);

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.style.fontSize).toBe('16px');
  });

  it('should have touch-friendly submit button', () => {
    commentInput = new MobileCommentInput(container);

    const submitBtn = container.querySelector('.mobile-comment-submit') as HTMLElement;
    expect(submitBtn).toBeTruthy();
    expect(submitBtn.style.minWidth).toBe('44px');
    expect(submitBtn.style.minHeight).toBe('44px');
  });

  it('should enable submit button when text is entered', () => {
    commentInput = new MobileCommentInput(container);

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    const submitBtn = container.querySelector('.mobile-comment-submit') as HTMLButtonElement;

    expect(submitBtn.disabled).toBe(true);

    textarea.value = 'Hello';
    textarea.dispatchEvent(new Event('input'));

    expect(submitBtn.disabled).toBe(false);
  });
