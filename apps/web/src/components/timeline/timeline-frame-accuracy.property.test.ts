/**
 * Property-Based Tests for Timeline Frame Accuracy
 *
 * Property 6: Timeline Frame Accuracy - For any video content, the timeline editor
 * SHALL provide frame-accurate positioning and the playback position indicator
 * SHALL correspond exactly to the displayed frame.
 *
 * **Validates: Requirements 6.1**
 *
 * Uses fast-check with minimum 100 iterations to verify frame-accuracy
 * across random durations, frame rates, and time positions.
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

/**
 * Arbitrary for standard video frame rates used in production.
 */
const arbitraryFrameRate = fc.oneof(
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

/**
 * Arbitrary for video durations (in seconds) from very short to long-form content.
 */
const arbitraryDuration = fc.double({ min: 0.1, max: 7200, noNaN: true });

/**
 * Arbitrary for time positions within a video (non-negative seconds).
 */
const arbitraryTime = fc.double({ min: 0, max: 7200, noNaN: true });

/**
 * Arbitrary for non-negative frame numbers.
 */
const arbitraryFrame = fc.integer({ min: 0, max: 216000 }); // up to 1 hour at 60fps

describe('Property 6: Timeline Frame Accuracy', () => {
  describe('snapToFrame round-trip consistency', () => {
    it('snapping a time to a frame boundary is idempotent', () => {
      fc.assert(
        fc.property(arbitraryTime, arbitraryFrameRate, (time, frameRate) => {
          const snapped = snapToFrame(time, frameRate);
          const doubleSnapped = snapToFrame(snapped, frameRate);

          // Snapping an already-snapped value should not change it
          expect(doubleSnapped).toBeCloseTo(snapped, 10);
        }),
        { numRuns: 200 }
      );
    });

    it('snapped time always lies on a frame boundary', () => {
      fc.assert(
        fc.property(arbitraryTime, arbitraryFrameRate, (time, frameRate) => {
          const snapped = snapToFrame(time, frameRate);
          const frameDuration = 1 / frameRate;

          // The snapped time divided by frame duration should be very close to an integer
          const frameIndex = snapped / frameDuration;
          expect(Math.abs(frameIndex - Math.round(frameIndex))).toBeLessThan(1e-9);
        }),
        { numRuns: 200 }
      );
    });

    it('snapped time is within half a frame of the original time', () => {
      fc.assert(
        fc.property(arbitraryTime, arbitraryFrameRate, (time, frameRate) => {
          const snapped = snapToFrame(time, frameRate);
          const frameDuration = 1 / frameRate;

          // Rounding to nearest frame means the displacement should be at most half a frame
          expect(Math.abs(snapped - time)).toBeLessThanOrEqual(frameDuration / 2 + 1e-10);
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('frameToTime and timeToFrame inverse relationship', () => {
    it('timeToFrame(frameToTime(frame)) returns the original frame', () => {
      fc.assert(
        fc.property(arbitraryFrame, arbitraryFrameRate, (frame, frameRate) => {
          const time = frameToTime(frame, frameRate);
          const recoveredFrame = timeToFrame(time, frameRate);

          expect(recoveredFrame).toBe(frame);
        }),
        { numRuns: 200 }
      );
    });

    it('frameToTime(timeToFrame(t)) produces a time on a frame boundary', () => {
      fc.assert(
        fc.property(arbitraryTime, arbitraryFrameRate, (time, frameRate) => {
          const frame = timeToFrame(time, frameRate);
          const roundTrippedTime = frameToTime(frame, frameRate);

          // The result should be exactly representable as frame / frameRate
          expect(roundTrippedTime).toBeCloseTo(frame / frameRate, 10);
        }),
        { numRuns: 200 }
      );
    });

    it('frameToTime is monotonically increasing', () => {
      fc.assert(
        fc.property(
          arbitraryFrame,
          fc.integer({ min: 1, max: 1000 }),
          arbitraryFrameRate,
          (frame, offset, frameRate) => {
            const t1 = frameToTime(frame, frameRate);
            const t2 = frameToTime(frame + offset, frameRate);

            expect(t2).toBeGreaterThan(t1);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('timeToFrame is monotonically non-decreasing', () => {
      fc.assert(
        fc.property(
          arbitraryTime,
          fc.double({ min: 0.001, max: 100, noNaN: true }),
          arbitraryFrameRate,
          (time, increment, frameRate) => {
            const f1 = timeToFrame(time, frameRate);
            const f2 = timeToFrame(time + increment, frameRate);

            expect(f2).toBeGreaterThanOrEqual(f1);
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('formatTimecode correctness', () => {
    it('timecode components are within valid ranges', () => {
      fc.assert(
        fc.property(arbitraryTime, arbitraryFrameRate, (time, frameRate) => {
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

    it('timecode reconstructs to the correct total frame count', () => {
      fc.assert(
        fc.property(arbitraryTime, arbitraryFrameRate, (time, frameRate) => {
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

    it('formatTimecode returns 00:00:00:00 for negative and non-finite inputs', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.double({ min: -10000, max: -0.001, noNaN: true }),
            fc.constant(NaN),
            fc.constant(Infinity),
            fc.constant(-Infinity)
          ),
          arbitraryFrameRate,
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
    it('seek always lands on a frame boundary', () => {
      fc.assert(
        fc.property(arbitraryDuration, arbitraryTime, arbitraryFrameRate, (duration, seekTime, frameRate) => {
          const controller = new TimelineController({ frameRate });
          controller.setDuration(duration);
          controller.seek(seekTime);

          const state = controller.getState();
          const frameDuration = 1 / frameRate;
          const frameIndex = state.currentTime / frameDuration;

          // The current time must be on a frame boundary
          expect(Math.abs(frameIndex - Math.round(frameIndex))).toBeLessThan(1e-9);

          controller.destroy();
        }),
        { numRuns: 200 }
      );
    });

    it('seek is clamped within [0, duration]', () => {
      fc.assert(
        fc.property(arbitraryDuration, arbitraryFrameRate, (duration, frameRate) => {
          const controller = new TimelineController({ frameRate });
          controller.setDuration(duration);

          // Try seeking beyond duration
          controller.seek(duration + 100);
          let state = controller.getState();
          expect(state.currentTime).toBeLessThanOrEqual(duration + 1e-10);

          // Try seeking before zero
          controller.seek(-100);
          state = controller.getState();
          expect(state.currentTime).toBeGreaterThanOrEqual(0);

          controller.destroy();
        }),
        { numRuns: 200 }
      );
    });

    it('getCurrentFrame and getTimecode are consistent with currentTime', () => {
      fc.assert(
        fc.property(arbitraryDuration, arbitraryTime, arbitraryFrameRate, (duration, seekTime, frameRate) => {
          const controller = new TimelineController({ frameRate });
          controller.setDuration(duration);
          controller.seek(seekTime);

          const state = controller.getState();
          const currentFrame = controller.getCurrentFrame();
          const timecode = controller.getTimecode();

          // getCurrentFrame should match timeToFrame of current time
          expect(currentFrame).toBe(timeToFrame(state.currentTime, frameRate));

          // getTimecode should match formatTimecode of current time
          expect(timecode).toBe(formatTimecode(state.currentTime, frameRate));

          controller.destroy();
        }),
        { numRuns: 200 }
      );
    });

    it('seekToFrame positions exactly at the frame boundary', () => {
      fc.assert(
        fc.property(
          arbitraryDuration,
          arbitraryFrameRate,
          (duration, frameRate) => {
            const controller = new TimelineController({ frameRate });
            controller.setDuration(duration);

            const totalFrames = controller.getTotalFrames();
            if (totalFrames === 0) {
              controller.destroy();
              return;
            }

            // Pick a random frame within the valid range
            const targetFrame = Math.floor(Math.random() * totalFrames);
            controller.seekToFrame(targetFrame);

            const currentFrame = controller.getCurrentFrame();
            expect(currentFrame).toBe(targetFrame);

            controller.destroy();
          }
        ),
        { numRuns: 200 }
      );
    });

    it('seekRelativeFrames advances by exactly the specified number of frames', () => {
      fc.assert(
        fc.property(
          arbitraryDuration,
          arbitraryFrameRate,
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

            // End frame should be start + offset (clamped to valid range)
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
