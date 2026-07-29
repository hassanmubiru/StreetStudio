/**
 * Property-Based Tests for Timeline Controller Frame Accuracy
 *
 * **Validates: Requirements 6.1**
 *
 * Property 6: Timeline Frame Accuracy - For any video content, the timeline editor
 * SHALL provide frame-accurate positioning and the playback position indicator
 * SHALL correspond exactly to the displayed frame.
 *
 * These tests verify the frame-accuracy utilities in timeline-controller.ts:
 * snapToFrame, frameToTime, timeToFrame, and formatTimecode across random
 * durations, frame rates, and time positions.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  snapToFrame,
  frameToTime,
  timeToFrame,
  formatTimecode,
  TimelineController,
} from './timeline-controller.js';

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Standard video frame rates used in production */
const arbFrameRate = fc.oneof(
  fc.constant(23.976),
  fc.constant(24),
  fc.constant(25),
  fc.constant(29.97),
  fc.constant(30),
  fc.constant(50),
  fc.constant(59.94),
  fc.constant(60),
  fc.double({ min: 1, max: 120, noNaN: true })
);

/** Video durations from very short clips to long-form content (seconds) */
const arbDuration = fc.double({ min: 0.1, max: 7200, noNaN: true });

/** Non-negative time positions (seconds) */
const arbTime = fc.double({ min: 0, max: 7200, noNaN: true });

/** Non-negative frame numbers (up to 1 hour at 60fps) */
const arbFrame = fc.integer({ min: 0, max: 216000 });

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 6: Timeline Controller Frame Accuracy', () => {
  describe('snapToFrame idempotency and correctness', () => {
    /**
     * **Validates: Requirements 6.1**
     *
     * Snapping an already-snapped value must not change it (idempotency).
     */
    it('snapToFrame is idempotent', () => {
      fc.assert(
        fc.property(arbTime, arbFrameRate, (time, frameRate) => {
          const snapped = snapToFrame(time, frameRate);
          const doubleSnapped = snapToFrame(snapped, frameRate);
          expect(doubleSnapped).toBeCloseTo(snapped, 10);
        }),
        { numRuns: 200 }
      );
    });

    /**
     * **Validates: Requirements 6.1**
     *
     * The snapped time must lie exactly on a frame boundary.
     */
    it('snapped time always lies on a frame boundary', () => {
      fc.assert(
        fc.property(arbTime, arbFrameRate, (time, frameRate) => {
          const snapped = snapToFrame(time, frameRate);
          const frameDuration = 1 / frameRate;
          const frameIndex = snapped / frameDuration;
          expect(Math.abs(frameIndex - Math.round(frameIndex))).toBeLessThan(1e-9);
        }),
        { numRuns: 200 }
      );
    });

    /**
     * **Validates: Requirements 6.1**
     *
     * Snapping rounds to nearest frame, so displacement is at most half a frame.
     */
    it('snapped time is within half a frame of the original time', () => {
      fc.assert(
        fc.property(arbTime, arbFrameRate, (time, frameRate) => {
          const snapped = snapToFrame(time, frameRate);
          const frameDuration = 1 / frameRate;
          expect(Math.abs(snapped - time)).toBeLessThanOrEqual(frameDuration / 2 + 1e-10);
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('frameToTime and timeToFrame inverse relationship', () => {
    /**
     * **Validates: Requirements 6.1**
     *
     * Converting frame → time → frame must recover the original frame number.
     */
    it('timeToFrame(frameToTime(frame)) returns the original frame', () => {
      fc.assert(
        fc.property(arbFrame, arbFrameRate, (frame, frameRate) => {
          const time = frameToTime(frame, frameRate);
          const recoveredFrame = timeToFrame(time, frameRate);
          expect(recoveredFrame).toBe(frame);
        }),
        { numRuns: 200 }
      );
    });

    /**
     * **Validates: Requirements 6.1**
     *
     * frameToTime must produce monotonically increasing results.
     */
    it('frameToTime is monotonically increasing', () => {
      fc.assert(
        fc.property(
          arbFrame,
          fc.integer({ min: 1, max: 1000 }),
          arbFrameRate,
          (frame, offset, frameRate) => {
            const t1 = frameToTime(frame, frameRate);
            const t2 = frameToTime(frame + offset, frameRate);
            expect(t2).toBeGreaterThan(t1);
          }
        ),
        { numRuns: 200 }
      );
    });

    /**
     * **Validates: Requirements 6.1**
     *
     * timeToFrame must be monotonically non-decreasing.
     */
    it('timeToFrame is monotonically non-decreasing', () => {
      fc.assert(
        fc.property(
          arbTime,
          fc.double({ min: 0.001, max: 100, noNaN: true }),
          arbFrameRate,
          (time, increment, frameRate) => {
            const f1 = timeToFrame(time, frameRate);
            const f2 = timeToFrame(time + increment, frameRate);
            expect(f2).toBeGreaterThanOrEqual(f1);
          }
        ),
        { numRuns: 200 }
      );
    });

    /**
     * **Validates: Requirements 6.1**
     *
     * frameToTime(timeToFrame(t)) must produce a time on a frame boundary.
     */
    it('frameToTime(timeToFrame(t)) produces a time on a frame boundary', () => {
      fc.assert(
        fc.property(arbTime, arbFrameRate, (time, frameRate) => {
          const frame = timeToFrame(time, frameRate);
          const roundTrippedTime = frameToTime(frame, frameRate);
          expect(roundTrippedTime).toBeCloseTo(frame / frameRate, 10);
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('formatTimecode correctness', () => {
    /**
     * **Validates: Requirements 6.1**
     *
     * Timecode components must be within valid ranges (HH:MM:SS:FF).
     */
    it('timecode components are within valid ranges', () => {
      fc.assert(
        fc.property(arbTime, arbFrameRate, (time, frameRate) => {
          const timecode = formatTimecode(time, frameRate);
          const parts = timecode.split(':');
          expect(parts).toHaveLength(4);

          const [hours, minutes, seconds, frames] = parts.map(Number);
          const fps = Math.round(frameRate);

          expect(hours).toBeGreaterThanOrEqual(0);
          expect(minutes).toBeGreaterThanOrEqual(0);
          expect(minutes).toBeLessThan(60);
          expect(seconds).toBeGreaterThanOrEqual(0);
          expect(seconds).toBeLessThan(60);
          expect(frames).toBeGreaterThanOrEqual(0);
          expect(frames).toBeLessThan(fps);
        }),
        { numRuns: 200 }
      );
    });

    /**
     * **Validates: Requirements 6.1**
     *
     * The timecode must reconstruct to the correct total frame count.
     */
    it('timecode reconstructs to the correct total frame count', () => {
      fc.assert(
        fc.property(arbTime, arbFrameRate, (time, frameRate) => {
          const timecode = formatTimecode(time, frameRate);
          const [hours, minutes, seconds, frames] = timecode.split(':').map(Number);
          const fps = Math.round(frameRate);

          const reconstructedFrames =
            hours * 3600 * fps + minutes * 60 * fps + seconds * fps + frames;
          const expectedFrames = Math.round(time * frameRate);

          expect(reconstructedFrames).toBe(expectedFrames);
        }),
        { numRuns: 200 }
      );
    });

    /**
     * **Validates: Requirements 6.1**
     *
     * Negative and non-finite inputs must return the zero timecode.
     */
    it('formatTimecode returns 00:00:00:00 for negative and non-finite inputs', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.double({ min: -10000, max: -0.001, noNaN: true }),
            fc.constant(NaN),
            fc.constant(Infinity),
            fc.constant(-Infinity)
          ),
          arbFrameRate,
          (time, frameRate) => {
            const timecode = formatTimecode(time, frameRate);
            expect(timecode).toBe('00:00:00:00');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('TimelineController frame-accurate seeking', () => {
    /**
     * **Validates: Requirements 6.1**
     *
     * Seek must always land on a frame boundary regardless of input time.
     */
    it('seek always lands on a frame boundary', () => {
      fc.assert(
        fc.property(arbDuration, arbTime, arbFrameRate, (duration, seekTime, frameRate) => {
          const controller = new TimelineController({ frameRate });
          controller.setDuration(duration);
          controller.seek(seekTime);

          const state = controller.getState();
          const frameDuration = 1 / frameRate;
          const frameIndex = state.currentTime / frameDuration;

          expect(Math.abs(frameIndex - Math.round(frameIndex))).toBeLessThan(1e-9);
          controller.destroy();
        }),
        { numRuns: 200 }
      );
    });

    /**
     * **Validates: Requirements 6.1**
     *
     * getCurrentFrame and getTimecode must be consistent with the current time.
     */
    it('getCurrentFrame and getTimecode are consistent with currentTime', () => {
      fc.assert(
        fc.property(arbDuration, arbTime, arbFrameRate, (duration, seekTime, frameRate) => {
          const controller = new TimelineController({ frameRate });
          controller.setDuration(duration);
          controller.seek(seekTime);

          const state = controller.getState();
          const currentFrame = controller.getCurrentFrame();
          const timecode = controller.getTimecode();

          expect(currentFrame).toBe(timeToFrame(state.currentTime, frameRate));
          expect(timecode).toBe(formatTimecode(state.currentTime, frameRate));
          controller.destroy();
        }),
        { numRuns: 200 }
      );
    });

    /**
     * **Validates: Requirements 6.1**
     *
     * seekToFrame must position exactly at the specified frame boundary.
     */
    it('seekToFrame positions exactly at the frame boundary', () => {
      fc.assert(
        fc.property(
          arbDuration,
          arbFrameRate,
          fc.nat({ max: 50000 }),
          (duration, frameRate, rawFrame) => {
            const controller = new TimelineController({ frameRate });
            controller.setDuration(duration);

            const totalFrames = controller.getTotalFrames();
            if (totalFrames === 0) {
              controller.destroy();
              return;
            }

            const targetFrame = rawFrame % (totalFrames + 1);
            controller.seekToFrame(targetFrame);

            const currentFrame = controller.getCurrentFrame();
            // Clamped to valid frame range
            const expected = Math.min(targetFrame, totalFrames);
            expect(currentFrame).toBe(expected);
            controller.destroy();
          }
        ),
        { numRuns: 200 }
      );
    });

    /**
     * **Validates: Requirements 6.1**
     *
     * seekRelativeFrames must advance by exactly the specified frame count.
     */
    it('seekRelativeFrames advances by exactly the specified number of frames', () => {
      fc.assert(
        fc.property(
          arbDuration,
          arbFrameRate,
          fc.integer({ min: -10, max: 10 }),
          (duration, frameRate, frameOffset) => {
            const controller = new TimelineController({ frameRate });
            controller.setDuration(duration);

            // Start from the midpoint
            const midTime = duration / 2;
            controller.seek(midTime);
            const startFrame = controller.getCurrentFrame();

            controller.seekRelativeFrames(frameOffset);
            const endFrame = controller.getCurrentFrame();

            const expectedFrame = Math.max(0, Math.min(controller.getTotalFrames(), startFrame + frameOffset));
            expect(endFrame).toBe(expectedFrame);
            controller.destroy();
          }
        ),
        { numRuns: 200 }
      );
    });
  });
});
