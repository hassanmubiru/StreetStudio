import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { RateLimiter } from "./rate-limiter.js";
import type { Clock } from "./clock.js";

/**
 * Property 85: Rate limiting rejects excess requests with retry guidance.
 *
 * Feature: streetstudio, Property 85: Rate limiting rejects excess requests with retry guidance
 *
 * Validates: Requirements 29.1
 *
 * For any stream of requests from a single client within a rolling window of
 * the configured length, requests up to the configured limit are admitted and
 * each request beyond the limit is rejected with a rate-limit decision that
 * carries a positive retry-after hint. The window is genuinely rolling: once
 * time advances past the point where the oldest in-window request ages out, the
 * client regains capacity (it is not a fixed periodic reset).
 */

/** A controllable clock so the rolling-window behavior is deterministic under test. */
class FakeClock implements Clock {
  constructor(private ms: number) {}
  nowMs(): number {
    return this.ms;
  }
  set(ms: number): void {
    this.ms = ms;
  }
  advance(deltaMs: number): void {
    this.ms += deltaMs;
  }
}

const CLIENT = "client-a";

describe("Feature: streetstudio, Property 85: Rate limiting rejects excess requests with retry guidance", () => {
  // Sub-property A: within a single rolling window, exactly `limit` requests are
  // admitted and every request beyond the limit is rejected with a positive
  // retry-after hint that never exceeds the window length.
  it("admits up to the limit and rejects excess with a retry-after hint within one window", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }), // limit
        fc.integer({ min: 1, max: 300 }), // windowSeconds
        fc.integer({ min: 0, max: 10_000_000 }), // absolute start time (ms)
        // Small forward time steps between requests, all kept strictly inside
        // the window so no admitted request can age out mid-burst.
        fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 0, maxLength: 80 }),
        (limit, windowSeconds, start, tinyGaps) => {
          const windowMs = windowSeconds * 1000;
          const clock = new FakeClock(start);
          const limiter = new RateLimiter({ limit, windowSeconds, clock });

          // Send limit + a handful of excess requests, advancing by tiny gaps
          // that are bounded so the whole burst stays within one window.
          const totalRequests = limit + 5;
          // Cap cumulative advance well under the window length.
          const maxCumulative = Math.max(0, windowMs - 1);
          let cumulative = 0;
          let admitted = 0;

          for (let i = 0; i < totalRequests; i++) {
            const gap = tinyGaps[i % Math.max(1, tinyGaps.length)] ?? 0;
            if (cumulative + gap <= maxCumulative) {
              cumulative += gap;
              clock.advance(gap);
            }

            const decision = limiter.check(CLIENT);
            if (decision.allowed) {
              admitted++;
              // While admitting, the count never exceeds the limit.
              expect(admitted).toBeLessThanOrEqual(limit);
            } else {
              // Rejections carry a bounded, positive retry-after hint.
              expect(decision.remaining).toBe(0);
              expect(decision.retryAfterSeconds).toBeGreaterThan(0);
              expect(decision.retryAfterSeconds).toBeLessThanOrEqual(windowSeconds);
            }
            expect(decision.limit).toBe(limit);
          }

          // Exactly `limit` requests were admitted within the single window;
          // the remaining (excess) requests were all rejected.
          expect(admitted).toBe(limit);
        }
      ),
      { numRuns: 200 }
    );
  });

  // Sub-property B: the window is rolling, not a fixed reset. After saturating
  // the limit, advancing time strictly past the window length from the first
  // admitted request lets the client through again.
  it("regains capacity as the oldest request rolls out of the window", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }), // limit
        fc.integer({ min: 1, max: 300 }), // windowSeconds
        fc.integer({ min: 0, max: 10_000_000 }), // absolute start time (ms)
        (limit, windowSeconds, start) => {
          const windowMs = windowSeconds * 1000;
          const clock = new FakeClock(start);
          const limiter = new RateLimiter({ limit, windowSeconds, clock });

          const firstAdmittedAt = clock.nowMs();

          // Saturate the window at t=start (all admitted at the same instant).
          for (let i = 0; i < limit; i++) {
            expect(limiter.check(CLIENT).allowed).toBe(true);
          }

          // The very next request within the window is rejected.
          const rejected = limiter.check(CLIENT);
          expect(rejected.allowed).toBe(false);
          expect(rejected.retryAfterSeconds).toBeGreaterThan(0);

          // Still saturated one millisecond before the oldest request ages out.
          clock.set(firstAdmittedAt + windowMs - 1);
          expect(limiter.check(CLIENT).allowed).toBe(false);

          // Once time reaches firstAdmittedAt + windowMs, the oldest request has
          // aged out and the client regains capacity — rolling, not fixed reset.
          clock.set(firstAdmittedAt + windowMs);
          expect(limiter.check(CLIENT).allowed).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });
});
