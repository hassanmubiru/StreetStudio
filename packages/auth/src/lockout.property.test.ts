import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Clock } from "./clock.js";
import {
  InMemoryLockoutPolicy,
  DEFAULT_MAX_FAILURES,
  DEFAULT_WINDOW_MS,
  DEFAULT_LOCK_MS,
} from "./lockout.js";

/**
 * Property 7: Account lockout after repeated failures.
 *
 * Feature: streetstudio, Property 7: Account lockout after repeated failures
 *
 * Validates: Requirements 3.9
 *
 * For any sequence of authentication attempts against a single account, once
 * DEFAULT_MAX_FAILURES (5) failures occur within a DEFAULT_WINDOW_MS (15-minute)
 * rolling window the account becomes locked and stays locked for at least
 * DEFAULT_LOCK_MS (15 minutes), rejecting every further attempt during the lock.
 * Conversely, failures spread far enough apart that no 5 ever fall inside the
 * rolling window never trigger a lock.
 */

/** A controllable clock so time-dependent behavior is deterministic under test. */
class FakeClock implements Clock {
  constructor(private ms: number) {}
  now(): Date {
    return new Date(this.ms);
  }
  set(ms: number): void {
    this.ms = ms;
  }
  advance(deltaMs: number): void {
    this.ms += deltaMs;
  }
}

const EMAIL = "user@example.com";

describe("Feature: streetstudio, Property 7: Account lockout after repeated failures", () => {
  // Sub-property A: 5 failures inside a 15-minute window lock the account, and
  // it stays locked (rejecting further attempts) for at least 15 minutes.
  it("locks after 5 failures within the window and stays locked for at least the lock duration", async () => {
    // Gaps between the 5 consecutive failures. Keeping each gap strictly below
    // windowMs / (maxFailures - 1) guarantees all 5 fall inside one rolling
    // window, so the lock must trigger on the 5th failure.
    const maxGap = Math.floor(DEFAULT_WINDOW_MS / (DEFAULT_MAX_FAILURES - 1)) - 1;
    const gap = fc.integer({ min: 0, max: maxGap });

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 5_000_000 }), // arbitrary absolute start time
        fc.array(gap, {
          minLength: DEFAULT_MAX_FAILURES - 1,
          maxLength: DEFAULT_MAX_FAILURES - 1,
        }),
        // A probe offset within the guaranteed lock window [0, DEFAULT_LOCK_MS).
        fc.integer({ min: 0, max: DEFAULT_LOCK_MS - 1 }),
        async (start, gaps, probeOffset) => {
          const clock = new FakeClock(start);
          const policy = new InMemoryLockoutPolicy({ clock });

          // Record the first failure, then the remaining failures spaced by gaps.
          await policy.recordFailure(EMAIL);
          for (const g of gaps) {
            clock.advance(g);
            await policy.recordFailure(EMAIL);
          }

          const lockStart = clock.now().getTime();

          // Immediately after the 5th failure the account must be locked.
          expect(await policy.isLocked(EMAIL)).toBe(true);

          // At any instant strictly before lockStart + DEFAULT_LOCK_MS the
          // account remains locked — even the last possible instant.
          clock.set(lockStart + probeOffset);
          expect(await policy.isLocked(EMAIL)).toBe(true);

          // Further failed attempts during the lock are rejected: the account
          // stays locked and the standing lock is not shortened.
          await policy.recordFailure(EMAIL);
          expect(await policy.isLocked(EMAIL)).toBe(true);

          clock.set(lockStart + DEFAULT_LOCK_MS - 1);
          expect(await policy.isLocked(EMAIL)).toBe(true);

          // Once the full lock duration has elapsed the account is eligible again.
          clock.set(lockStart + DEFAULT_LOCK_MS);
          expect(await policy.isLocked(EMAIL)).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  // Sub-property B: failures spread so that no 5 ever fall inside the rolling
  // window never trigger a lock, regardless of how many occur.
  it("never locks when failures are spread beyond the rolling window", async () => {
    // Spacing strictly greater than windowMs / (maxFailures - 1) guarantees at
    // most (maxFailures - 1) failures can coexist inside any window of length
    // windowMs, so the threshold is never reached.
    const minGap = Math.floor(DEFAULT_WINDOW_MS / (DEFAULT_MAX_FAILURES - 1)) + 1;
    const gap = fc.integer({ min: minGap, max: minGap + DEFAULT_WINDOW_MS });

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.array(gap, { minLength: 1, maxLength: 30 }),
        async (start, gaps) => {
          const clock = new FakeClock(start);
          const policy = new InMemoryLockoutPolicy({ clock });

          // First failure, then each subsequent one spaced beyond the window.
          await policy.recordFailure(EMAIL);
          expect(await policy.isLocked(EMAIL)).toBe(false);

          for (const g of gaps) {
            clock.advance(g);
            await policy.recordFailure(EMAIL);
            // The account is never locked after any spread-out failure.
            expect(await policy.isLocked(EMAIL)).toBe(false);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
