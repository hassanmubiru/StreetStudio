import { describe, expect, it } from "vitest";
import { AppError } from "@streetstudio/shared";
import { RateLimiter } from "./rate-limiter.js";
import type { Clock } from "./clock.js";

/** A hand-advanced clock for deterministic rolling-window assertions. */
function fakeClock(startMs = 0): Clock & { advance(ms: number): void } {
  let current = startMs;
  return {
    nowMs: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe("RateLimiter", () => {
  it("admits requests up to the limit and rejects the next with retry-after", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ limit: 3, windowSeconds: 60, clock });

    for (let i = 0; i < 3; i++) {
      expect(limiter.check("client-a").allowed).toBe(true);
    }
    const rejected = limiter.check("client-a");
    expect(rejected.allowed).toBe(false);
    expect(rejected.remaining).toBe(0);
    expect(rejected.retryAfterSeconds).toBe(60);
  });

  it("tracks clients independently", () => {
    const limiter = new RateLimiter({ limit: 1, windowSeconds: 60, clock: fakeClock() });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
  });

  it("regains capacity as the oldest request rolls out of the window", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ limit: 2, windowSeconds: 60, clock });

    limiter.check("a"); // t=0
    clock.advance(30_000);
    limiter.check("a"); // t=30s
    expect(limiter.check("a").allowed).toBe(false); // full

    // At t=60s the first request (t=0) ages out; capacity returns.
    clock.advance(30_000);
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("enforce throws RATE_LIMITED carrying the retry-after hint", () => {
    const limiter = new RateLimiter({ limit: 1, windowSeconds: 60, clock: fakeClock() });
    limiter.enforce("a");
    try {
      limiter.enforce("a");
      expect.unreachable("expected RATE_LIMITED");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("RATE_LIMITED");
      expect((err as AppError).retryAfterSeconds).toBe(60);
    }
  });

  it("rejects invalid configuration", () => {
    expect(() => new RateLimiter({ windowSeconds: 0 })).toThrow(AppError);
    expect(() => new RateLimiter({ limit: 0 })).toThrow(AppError);
  });
});
