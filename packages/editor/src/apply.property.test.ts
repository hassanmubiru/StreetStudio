import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { clipCount, type Timeline } from "@streetstudio/timeline";
import { applyEdit } from "./apply.js";

/**
 * Property-based checks for the editor reducer (client model — not one of the
 * 88 spec correctness properties). Verifies structural invariants hold for any
 * contiguous single-track timeline: trims stay in bounds, and speed scales time
 * linearly while preserving clip count.
 */

/** A contiguous single-track timeline of integer duration `D` in [10, 1000]. */
const timelineArb: fc.Arbitrary<{ D: number; tl: Timeline }> = fc
  .integer({ min: 10, max: 1000 })
  .chain((D) =>
    fc
      .uniqueArray(fc.integer({ min: 1, max: D - 1 }), { maxLength: 5 })
      .map((cutsRaw) => {
        const bounds = [0, ...[...cutsRaw].sort((a, b) => a - b), D];
        const clips = [];
        for (let i = 0; i < bounds.length - 1; i += 1) {
          clips.push({ id: `c${i}`, startSeconds: bounds[i]!, endSeconds: bounds[i + 1]! });
        }
        const tl: Timeline = {
          durationSeconds: D,
          tracks: [{ id: "s", kind: "screen", clips }],
          markers: [],
        };
        return { D, tl };
      }),
  );

describe("editor reducer — structural invariants", () => {
  it("trim keeps duration and clips within bounds", () => {
    fc.assert(
      fc.property(
        timelineArb,
        fc.double({ min: 0, max: 0.99, noNaN: true }),
        fc.double({ min: 0.01, max: 1, noNaN: true }),
        ({ D, tl }, a, b) => {
          const start = Math.min(D - 1, Math.floor(a * D));
          const end = Math.max(start + 1, Math.ceil(start + b * (D - start)));
          const out = applyEdit(tl, { op: "trim", startSeconds: start, endSeconds: end });
          const nd = out.durationSeconds;
          expect(nd).toBeGreaterThanOrEqual(0);
          expect(nd).toBeLessThanOrEqual(D);
          for (const c of out.tracks[0]!.clips) {
            expect(c.startSeconds).toBeGreaterThanOrEqual(0);
            expect(c.endSeconds).toBeGreaterThan(c.startSeconds);
            expect(c.endSeconds).toBeLessThanOrEqual(nd + 1e-9);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("speed scales duration by 1/factor and preserves clip count", () => {
    fc.assert(
      fc.property(
        timelineArb,
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        ({ D, tl }, factor) => {
          const out = applyEdit(tl, { op: "speed", factor });
          expect(out.durationSeconds).toBeCloseTo(D / factor, 6);
          expect(clipCount(out)).toBe(clipCount(tl));
        },
      ),
      { numRuns: 200 },
    );
  });
});
