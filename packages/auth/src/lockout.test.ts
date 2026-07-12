import { describe, it, expect } from "vitest";
import type { Clock } from "./clock.js";
import { InMemoryLockoutPolicy } from "./lockout.js";

/** A controllable clock for deterministic time-dependent assertions. */
class FakeClock implements Clock {
  constructor(private ms: number) {}
  now(): Date {
    return new Date(this.ms);
  }
  advance(deltaMs: number): void {
    this.ms += deltaMs;
  }
}

const MINUTE = 60 * 1000;

describe("InMemoryLockoutPolicy (Requirement 3.9)", () => {
  it("is not locked before any failures", async () => {
    const policy = new InMemoryLockoutPolicy({ clock: new FakeClock(0) });
    expect(await policy.isLocked("user@example.com")).toBe(false);
  });

  it("does not lock before the 5th failure in the window", async () => {
    const clock = new FakeClock(0);
    const policy = new InMemoryLockoutPolicy({ clock });
    for (let i = 0; i < 4; i++) {
      await policy.recordFailure("user@example.com");
      clock.advance(MINUTE);
    }
    expect(await policy.isLocked("user@example.com")).toBe(false);
  });

  it("locks after 5 failures within a 15-minute window", async () => {
    const clock = new FakeClock(0);
    const policy = new InMemoryLockoutPolicy({ clock });
    for (let i = 0; i < 5; i++) {
      await policy.recordFailure("user@example.com");
      clock.advance(MINUTE);
    }
    expect(await policy.isLocked("user@example.com")).toBe(true);
  });

  it("keeps the account locked for at least 15 minutes", async () => {
    const clock = new FakeClock(0);
    const policy = new InMemoryLockoutPolicy({ clock });
    for (let i = 0; i < 5; i++) await policy.recordFailure("user@example.com");

    clock.advance(15 * MINUTE - 1);
    expect(await policy.isLocked("user@example.com")).toBe(true);

    clock.advance(1);
    expect(await policy.isLocked("user@example.com")).toBe(false);
  });

  it("does not lock when failures fall outside the rolling window", async () => {
    const clock = new FakeClock(0);
    const policy = new InMemoryLockoutPolicy({ clock });
    // Four failures spread so the oldest ages out before the fifth.
    for (let i = 0; i < 4; i++) {
      await policy.recordFailure("user@example.com");
      clock.advance(5 * MINUTE);
    }
    // 20 minutes elapsed; the first failure is now outside the 15-min window.
    await policy.recordFailure("user@example.com");
    expect(await policy.isLocked("user@example.com")).toBe(false);
  });

  it("clears failure state on reset after a successful login", async () => {
    const clock = new FakeClock(0);
    const policy = new InMemoryLockoutPolicy({ clock });
    for (let i = 0; i < 4; i++) await policy.recordFailure("user@example.com");
    await policy.reset("user@example.com");
    // A single failure after reset must not immediately re-lock.
    await policy.recordFailure("user@example.com");
    expect(await policy.isLocked("user@example.com")).toBe(false);
  });

  it("tracks lockout per account independently and case-insensitively", async () => {
    const clock = new FakeClock(0);
    const policy = new InMemoryLockoutPolicy({ clock });
    for (let i = 0; i < 5; i++) await policy.recordFailure("User@Example.com");
    expect(await policy.isLocked("user@example.com")).toBe(true);
    expect(await policy.isLocked("other@example.com")).toBe(false);
  });
});
