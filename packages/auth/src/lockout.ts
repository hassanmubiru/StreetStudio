/**
 * Account-lockout policy (Requirement 3.9, design "Authentication & Session").
 *
 * Implements the {@link LockoutPolicy} port consulted by {@link AuthService}:
 * once a single account accumulates a threshold number of failed
 * authentication attempts inside a rolling time window, the account is locked
 * for at least a fixed duration and every further attempt is rejected until the
 * lock expires. A successful authentication clears the accumulated failure
 * state via {@link InMemoryLockoutPolicy.reset}.
 *
 * The default thresholds encode Requirement 3.9 exactly: 5 failures within a
 * 15-minute rolling window trigger a lock lasting at least 15 minutes. Time is
 * read from an injectable {@link Clock} so the policy is deterministic under
 * test.
 *
 * The failure ledger is held in process memory keyed by normalized email. This
 * is sufficient for a single-node deployment and for the property/unit tests;
 * a distributed deployment would supply a shared-store implementation of the
 * same {@link LockoutPolicy} port without changing the auth core.
 */
import { systemClock, type Clock } from "./clock.js";
import type { LockoutPolicy } from "./service.js";
import { normalizeEmail } from "./stores.js";

/** Number of failures within the window that triggers a lock (Requirement 3.9). */
export const DEFAULT_MAX_FAILURES = 5;

/** Rolling window in which failures are counted, in milliseconds (15 minutes). */
export const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

/** Minimum lock duration once triggered, in milliseconds (15 minutes). */
export const DEFAULT_LOCK_MS = 15 * 60 * 1000;

/** Tuning knobs for {@link InMemoryLockoutPolicy}; all optional. */
export interface LockoutOptions {
  /** Time source; defaults to {@link systemClock}. */
  readonly clock?: Clock;
  /**
   * Failures within {@link windowMs} required to lock. Defaults to
   * {@link DEFAULT_MAX_FAILURES}. Must be a positive integer.
   */
  readonly maxFailures?: number;
  /**
   * Rolling window (ms) over which failures are counted. Defaults to
   * {@link DEFAULT_WINDOW_MS}. Must be positive.
   */
  readonly windowMs?: number;
  /**
   * How long (ms) an account stays locked once triggered. Defaults to
   * {@link DEFAULT_LOCK_MS}. Must be positive.
   */
  readonly lockMs?: number;
}

/** Per-account failure ledger. */
interface AccountState {
  /** Epoch-ms timestamps of failures still inside the rolling window. */
  failures: number[];
  /** Epoch-ms instant until which the account is locked, if any. */
  lockedUntil: number | undefined;
}

/**
 * In-memory {@link LockoutPolicy}: counts recent failures per account within a
 * rolling window and locks the account for a fixed minimum duration once the
 * threshold is reached (Requirement 3.9).
 */
export class InMemoryLockoutPolicy implements LockoutPolicy {
  private readonly clock: Clock;
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly lockMs: number;
  private readonly accounts = new Map<string, AccountState>();

  constructor(options: LockoutOptions = {}) {
    this.clock = options.clock ?? systemClock;
    this.maxFailures = options.maxFailures ?? DEFAULT_MAX_FAILURES;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.lockMs = options.lockMs ?? DEFAULT_LOCK_MS;

    if (!Number.isInteger(this.maxFailures) || this.maxFailures <= 0) {
      throw new Error("maxFailures must be a positive integer");
    }
    if (this.windowMs <= 0) {
      throw new Error("windowMs must be positive");
    }
    if (this.lockMs <= 0) {
      throw new Error("lockMs must be positive");
    }
  }

  /**
   * True while `email` is within an active lock. Expired locks are cleared
   * lazily so an account automatically becomes eligible again once the lock
   * period elapses.
   */
  async isLocked(email: string): Promise<boolean> {
    const key = normalizeEmail(email);
    const state = this.accounts.get(key);
    if (!state) return false;

    const now = this.clock.now().getTime();
    if (state.lockedUntil !== undefined) {
      if (now < state.lockedUntil) return true;
      // Lock has elapsed: reset the ledger so counting starts fresh.
      this.accounts.delete(key);
    }
    return false;
  }

  /**
   * Record a failed authentication attempt for `email`. Failures older than the
   * rolling window are discarded before the new one is counted; reaching
   * {@link maxFailures} within the window arms a lock lasting at least
   * {@link lockMs}. Recording a failure while already locked extends nothing —
   * the existing lock stands.
   */
  async recordFailure(email: string): Promise<void> {
    const key = normalizeEmail(email);
    const now = this.clock.now().getTime();
    const state = this.accounts.get(key) ?? {
      failures: [],
      lockedUntil: undefined,
    };

    // If a prior lock has elapsed, start a fresh ledger.
    if (state.lockedUntil !== undefined && now >= state.lockedUntil) {
      state.failures = [];
      state.lockedUntil = undefined;
    }

    // Already locked: keep the standing lock, don't accumulate further.
    if (state.lockedUntil !== undefined) {
      this.accounts.set(key, state);
      return;
    }

    // Drop failures that have aged out of the rolling window, then count this one.
    const windowStart = now - this.windowMs;
    state.failures = state.failures.filter((t) => t > windowStart);
    state.failures.push(now);

    if (state.failures.length >= this.maxFailures) {
      state.lockedUntil = now + this.lockMs;
      state.failures = [];
    }

    this.accounts.set(key, state);
  }

  /** Clear all failure/lock state for `email` after a successful login. */
  async reset(email: string): Promise<void> {
    this.accounts.delete(normalizeEmail(email));
  }
}
