/**
 * Property-Based Tests for Timeline Frame Accuracy
 *
 * **Validates: Requirements 6.1**
 *
 * Property 6: Timeline Frame Accuracy - For any video content, the timeline editor
 * SHALL provide frame-accurate positioning and the playback position indicator
 * SHALL correspond exactly to the displayed frame.
 *
 * Tests verify:
 * - Seeking to any frame results in exact frame positioning
 * - Trim operations maintain frame-aligned boundaries
 * - Split operations produce clips with correct frame boundaries
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  TimelineEditor,
  frameToTimecode,
  timecodeToFrame,
  frameToSeconds,
  secondsToFrame,
  frameToPixel,
  pixelToFrame,
  DEFAULT_FRAME_RATE,
  PIXELS_PER_FRAME_BASE,
  MIN_CLIP_FRAMES,
} from './timeline-editor.js';
import type {
  TimelineClip,
  TimelineEditorCallbacks,
} from './timeline-editor.js';

// ─── Test Environment Mocks ───────────────────────────────────────────────────

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })) as any;
}

HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  fillStyle: '',
}) as any;

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Common frame rates used in video production */
const arbFrameRate = fc.oneof(
  fc.constant(24),
  fc.constant(25),
  fc.constant(30),
  fc.constant(48),
  fc.constant(60),
  fc.integer({ min: 1, max: 120 })
);

/** A non-negative integer frame number within reasonable bounds */
const arbFrame = fc.integer({ min: 0, max: 1_000_000 });

/** A positive zoom level within supported range */
const arbZoom = fc.double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true });

/** Generate a valid clip with frame-aligned boundaries */
const arbClip = fc.record({
  startFrame: fc.integer({ min: 0, max: 10000 }),
  clipLength: fc.integer({ min: 10, max: 5000 }),
}).map(({ startFrame, clipLength }) => {
  const endFrame = startFrame + clipLength;
  return {
    id: `clip-${startFrame}-${endFrame}`,
    startFrame,
    endFrame,
    inPoint: startFrame,
    outPoint: endFrame,
    duration: clipLength,
    sourceUrl: 'test.mp4',
    type: 'video' as const,
  } satisfies TimelineClip;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
  document.body.appendChild(container);
  return container;
}

function createEditorWithClip(clip: TimelineClip): {
  editor: TimelineEditor;
  container: HTMLElement;
  callbacks: TimelineEditorCallbacks;
} {
  const container = createContainer();
  const callbacks: TimelineEditorCallbacks = {
    onPlayheadChange: vi.fn(),
    onTrimEnd: vi.fn(),
    onSplit: vi.fn(),
    onStateChange: vi.fn(),
  };
  const editor = new TimelineEditor(container, {}, callbacks);
  editor.addClip(clip);
  return { editor, container, callbacks };
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Timeline Frame Accuracy Properties', () => {
  describe('Frame-accurate seeking', () => {
    let container: HTMLElement;
    let editor: TimelineEditor;
    let callbacks: TimelineEditorCallbacks;

    beforeEach(() => {
      container = createContainer();
      callbacks = {
        onPlayheadChange: vi.fn(),
        onStateChange: vi.fn(),
      };
      editor = new TimelineEditor(container, {}, callbacks);
    });

    afterEach(() => {
      editor.destroy();
      document.body.innerHTML = '';
    });

    /**
     * **Validates: Requirements 6.1**
     *
     * Property 6: For any frame within the clip duration, seeking to that frame
     * SHALL result in the playhead being positioned exactly at that integer frame.
     */
    it('Property 6: Seeking to any valid frame results in exact frame positioning', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5000 }),
          fc.integer({ min: 1, max: 5000 }),
          (clipDuration, targetFrame) => {
            // Set up a clip with the given duration
            const clip: TimelineClip = {
              id: 'test-clip',
              startFrame: 0,
              endFrame: clipDuration,
              inPoint: 0,
              outPoint: clipDuration,
              duration: clipDuration,
              sourceUrl: 'test.mp4',
              type: 'video',
            };

            editor.loadClips([clip]);

            // Seek to target frame (will be clamped to valid range)
            editor.seekToFrame(targetFrame);

            const state = editor.getState();
            const expectedFrame = Math.max(0, Math.min(Math.round(targetFrame), clipDuration));

            // Playhead MUST be at an exact integer frame
            expect(state.playheadFrame).toBe(expectedFrame);
            expect(Number.isInteger(state.playheadFrame)).toBe(true);
          }
        ),
        { numRuns: 100, seed: 100 }
      );
    });

    /**
     * **Validates: Requirements 6.1**
     *
     * Property 6: For any fractional frame position, seeking SHALL snap to the
     * nearest integer frame (frame-accurate positioning).
     */
    it('Property 6: Fractional frame positions snap to nearest integer frame', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
          (fractionalFrame) => {
            const clip: TimelineClip = {
              id: 'test-clip',
              startFrame: 0,
              endFrame: 1000,
              inPoint: 0,
              outPoint: 1000,
              duration: 1000,
              sourceUrl: 'test.mp4',
              type: 'video',
            };

            editor.loadClips([clip]);
            editor.seekToFrame(fractionalFrame);

            const state = editor.getState();

            // Frame must be an integer (frame-accurate)
            expect(Number.isInteger(state.playheadFrame)).toBe(true);
            // Must be the rounded value
            expect(state.playheadFrame).toBe(
              Math.max(0, Math.min(Math.round(fractionalFrame), 1000))
            );
          }
        ),
        { numRuns: 100, seed: 101 }
      );
    });
  });

  describe('Frame conversion round-trip accuracy', () => {
    /**
     * **Validates: Requirements 6.1**
     *
     * Property 6: For any valid frame and frame rate, converting frame → timecode → frame
     * SHALL yield the original frame number (lossless round-trip).
     */
    it('Property 6: frameToTimecode → timecodeToFrame round-trips exactly', () => {
      fc.assert(
        fc.property(
          arbFrame,
          arbFrameRate,
          (frame, frameRate) => {
            const timecode = frameToTimecode(frame, frameRate);
            const recovered = timecodeToFrame(timecode, frameRate);
            expect(recovered).toBe(frame);
          }
        ),
        { numRuns: 200, seed: 102 }
      );
    });

    /**
     * **Validates: Requirements 6.1**
     *
     * Property 6: For any valid frame and frame rate, converting frame → seconds → frame
     * SHALL yield the original frame number (lossless round-trip).
     */
    it('Property 6: frameToSeconds → secondsToFrame round-trips exactly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100000 }),
          arbFrameRate,
          (frame, frameRate) => {
            const seconds = frameToSeconds(frame, frameRate);
            const recovered = secondsToFrame(seconds, frameRate);
            expect(recovered).toBe(frame);
          }
        ),
        { numRuns: 200, seed: 103 }
      );
    });

    /**
     * **Validates: Requirements 6.1**
     *
     * Property 6: For any valid frame and zoom level, converting frame → pixel → frame
     * SHALL yield the original frame number (lossless round-trip).
     */
    it('Property 6: frameToPixel → pixelToFrame round-trips exactly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10000 }),
          arbZoom,
          (frame, zoom) => {
            const pixel = frameToPixel(frame, zoom);
            const recovered = pixelToFrame(pixel, zoom);
            expect(recovered).toBe(frame);
          }
        ),
        { numRuns: 200, seed: 104 }
      );
    });
  });

  describe('Trim operations maintain frame-aligned boundaries', () => {
    /**
     * **Validates: Requirements 6.1**
     *
     * Property 6: For any valid trim in-point, the resulting clip boundaries SHALL
     * remain at exact integer frames and the duration SHALL be correctly updated.
     */
    it('Property 6: Setting in-point maintains frame-aligned boundaries', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 5000 }),
          fc.nat(),
          (clipDuration, seed) => {
            const container = createContainer();
            const callbacks: TimelineEditorCallbacks = { onTrimEnd: vi.fn(), onStateChange: vi.fn() };
            const editor = new TimelineEditor(container, {}, callbacks);

            const clip: TimelineClip = {
              id: 'trim-clip',
              startFrame: 0,
              endFrame: clipDuration,
              inPoint: 0,
              outPoint: clipDuration,
              duration: clipDuration,
              sourceUrl: 'test.mp4',
              type: 'video',
            };
            editor.addClip(clip);
            editor.selectClip('trim-clip');

            // Generate a valid in-point (must be less than outPoint)
            const inPoint = seed % (clipDuration - MIN_CLIP_FRAMES);
            editor.seekToFrame(inPoint);
            editor.setInPoint();

            const trimmedClip = editor.getClip('trim-clip');
            if (trimmedClip) {
              // In-point must be integer (frame-aligned)
              expect(Number.isInteger(trimmedClip.inPoint)).toBe(true);
              // Out-point must remain unchanged and integer
              expect(Number.isInteger(trimmedClip.outPoint)).toBe(true);
              expect(trimmedClip.outPoint).toBe(clipDuration);
              // Duration must be exactly outPoint - inPoint
              expect(trimmedClip.duration).toBe(trimmedClip.outPoint - trimmedClip.inPoint);
              // In-point must be less than out-point
              expect(trimmedClip.inPoint).toBeLessThan(trimmedClip.outPoint);
            }

            editor.destroy();
            container.remove();
          }
        ),
        { numRuns: 100, seed: 105 }
      );
    });

    /**
     * **Validates: Requirements 6.1**
     *
     * Property 6: For any valid trim out-point, the resulting clip boundaries SHALL
     * remain at exact integer frames and the duration SHALL be correctly updated.
     */
    it('Property 6: Setting out-point maintains frame-aligned boundaries', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 5000 }),
          fc.nat(),
          (clipDuration, seed) => {
            const container = createContainer();
            const callbacks: TimelineEditorCallbacks = { onTrimEnd: vi.fn(), onStateChange: vi.fn() };
            const editor = new TimelineEditor(container, {}, callbacks);

            const clip: TimelineClip = {
              id: 'trim-clip',
              startFrame: 0,
              endFrame: clipDuration,
              inPoint: 0,
              outPoint: clipDuration,
              duration: clipDuration,
              sourceUrl: 'test.mp4',
              type: 'video',
            };
            editor.addClip(clip);
            editor.selectClip('trim-clip');

            // Generate a valid out-point (must be greater than inPoint = 0)
            const outPoint = (seed % (clipDuration - MIN_CLIP_FRAMES)) + MIN_CLIP_FRAMES;
            editor.seekToFrame(outPoint);
            editor.setOutPoint();

            const trimmedClip = editor.getClip('trim-clip');
            if (trimmedClip) {
              // Out-point must be integer (frame-aligned)
              expect(Number.isInteger(trimmedClip.outPoint)).toBe(true);
              // In-point must remain unchanged and integer
              expect(Number.isInteger(trimmedClip.inPoint)).toBe(true);
              expect(trimmedClip.inPoint).toBe(0);
              // Duration must be exactly outPoint - inPoint
              expect(trimmedClip.duration).toBe(trimmedClip.outPoint - trimmedClip.inPoint);
              // Out-point must be greater than in-point
              expect(trimmedClip.outPoint).toBeGreaterThan(trimmedClip.inPoint);
            }

            editor.destroy();
            container.remove();
          }
        ),
        { numRuns: 100, seed: 106 }
      );
    });
  });

  describe('Split operations produce clips with correct frame boundaries', () => {
    /**
     * **Validates: Requirements 6.1**
     *
     * Property 6: For any split point within a clip, the resulting two clips SHALL
     * have exact frame-aligned boundaries that together cover the original clip range.
     */
    it('Property 6: Split produces two clips with correct frame boundaries', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 5000 }),
          fc.nat(),
          (clipDuration, seed) => {
            const container = createContainer();
            const callbacks: TimelineEditorCallbacks = { onSplit: vi.fn(), onStateChange: vi.fn() };
            const editor = new TimelineEditor(container, {}, callbacks);

            const clip: TimelineClip = {
              id: 'split-clip',
              startFrame: 0,
              endFrame: clipDuration,
              inPoint: 0,
              outPoint: clipDuration,
              duration: clipDuration,
              sourceUrl: 'test.mp4',
              type: 'video',
            };
            editor.addClip(clip);

            // Generate a valid split point (must be > inPoint and < outPoint)
            const splitFrame = (seed % (clipDuration - 2)) + 1;
            editor.seekToFrame(splitFrame);

            const result = editor.splitAtPlayhead();

            if (result) {
              const state = editor.getState();
              expect(state.clips).toHaveLength(2);

              const leftClip = state.clips[0];
              const rightClip = state.clips[1];

              // Both clips must have integer frame boundaries
              expect(Number.isInteger(leftClip.inPoint)).toBe(true);
              expect(Number.isInteger(leftClip.outPoint)).toBe(true);
              expect(Number.isInteger(rightClip.inPoint)).toBe(true);
              expect(Number.isInteger(rightClip.outPoint)).toBe(true);

              // Left clip: starts at original in-point, ends at split frame
              expect(leftClip.inPoint).toBe(0);
              expect(leftClip.outPoint).toBe(splitFrame);
              expect(leftClip.duration).toBe(splitFrame);

              // Right clip: starts at split frame, ends at original out-point
              expect(rightClip.inPoint).toBe(splitFrame);
              expect(rightClip.outPoint).toBe(clipDuration);
              expect(rightClip.duration).toBe(clipDuration - splitFrame);

              // Combined duration equals original
              expect(leftClip.duration + rightClip.duration).toBe(clipDuration);

              // No gap or overlap between clips
              expect(leftClip.outPoint).toBe(rightClip.inPoint);
            }

            editor.destroy();
            container.remove();
          }
        ),
        { numRuns: 100, seed: 107 }
      );
    });

    /**
     * **Validates: Requirements 6.1**
     *
     * Property 6: For any split point, the playhead position indicator SHALL
     * remain at the exact split frame after the operation.
     */
    it('Property 6: Playhead remains at exact split frame after split', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 5000 }),
          fc.nat(),
          (clipDuration, seed) => {
            const container = createContainer();
            const editor = new TimelineEditor(container, {}, {});

            const clip: TimelineClip = {
              id: 'split-clip',
              startFrame: 0,
              endFrame: clipDuration,
              inPoint: 0,
              outPoint: clipDuration,
              duration: clipDuration,
              sourceUrl: 'test.mp4',
              type: 'video',
            };
            editor.addClip(clip);

            const splitFrame = (seed % (clipDuration - 2)) + 1;
            editor.seekToFrame(splitFrame);
            editor.splitAtPlayhead();

            const state = editor.getState();
            // Playhead must remain at the exact split frame
            expect(state.playheadFrame).toBe(splitFrame);

            editor.destroy();
            container.remove();
          }
        ),
        { numRuns: 100, seed: 108 }
      );
    });
  });

  describe('Playback position indicator corresponds to displayed frame', () => {
    /**
     * **Validates: Requirements 6.1**
     *
     * Property 6: For any seek operation, the timecode display SHALL correspond
     * exactly to the playhead frame position.
     */
    it('Property 6: Timecode display matches playhead frame position exactly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5000 }),
          arbFrameRate,
          (targetFrame, frameRate) => {
            const container = createContainer();
            const editor = new TimelineEditor(container, { frameRate }, {});

            const clipDuration = Math.max(targetFrame + 1, 100);
            const clip: TimelineClip = {
              id: 'display-clip',
              startFrame: 0,
              endFrame: clipDuration,
              inPoint: 0,
              outPoint: clipDuration,
              duration: clipDuration,
              sourceUrl: 'test.mp4',
              type: 'video',
            };
            editor.addClip(clip);
            editor.seekToFrame(targetFrame);

            const state = editor.getState();
            const expectedTimecode = frameToTimecode(state.playheadFrame, frameRate);

            // The timecode display in the DOM should match
            const display = container.querySelector('.timecode-display');
            expect(display?.textContent?.trim()).toBe(expectedTimecode);

            editor.destroy();
            container.remove();
          }
        ),
        { numRuns: 100, seed: 109 }
      );
    });
  });
});
