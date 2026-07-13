/**
 * Per-client rate limiting (Requirement 29.1, Property 85).
 *
 * The API_Service enforces a default limit of 100 requests per 60-second
 * rolling window per client. Requests up to the limit within any 60-second
 * window are admitted; each request beyond the limit is rejected with the
 * shared `RATE_LIMITED` error, which carries a `retryAfterSeconds` hint telling
 * the client when it may retry (the taxonomy maps this to HTTP 429).
 *
 * The window is genuinely rolling: on each check the limiter discards the
 * timestamps of admitted requests that have aged out of the window, so a client
 * regains capacity continuously as its oldest in-window request expires — not
 * in fixed resets. Rejected requests are not recorded, so a client that keeps
 * hammering a saturated window does not push its own retry time outward.
 *
 * Time is injected via {@link Clock} so the rolling behavior is deterministic
 * under test.
 */
import { AppError } from "@streetstudio/shared";
import { systemClock, type Clock } from "./clock.js";

/** Default requests admitted per rolling window (R29.1). */
export const DEFAULT_RATE_LIMIT = 100;

/** Default rolling-window length in seconds (R29.1). */
export const DEFAULT_WINDOW_SECONDS = 60;

/** Options controlling a {@link RateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum admitted requests per window per client. Defaults to 100. */
  readonly limit?: number;
  /** Rolling-window length in seconds. Defaults to 60. */
  readonly windowSeconds?: number;
  /** Time source; defaults to the system clock. */
  readonly clock?: Clock;
}

/** The outcome of consulting the limiter for a single request. */
export interface RateLimitDecision {
  /** Whether the request is admitted. */
  readonly allowed: boolean;
  /** The configured limit, echoed for response headers. */
  readonly limit: number;
  /** Requests still admissible in the current window (0 when rejected). */
  readonly remaining: number;
  /**
   * When rejected, the whole seconds after which the client may retry (i.e.
   * when its oldest in-window request will age out). Present only when
   * {@link allowed} is false.
   */
  readonly retryAfterSeconds?: number;
}

/**
 * A per-client sliding-window rate limiter. Not safe across processes on its
 * own; a multi-node deployment backs the same algorithm with a shared store,
 * but the admission logic and its rolling-window semantics are identical.
 */
export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly clock: Clock;
  /** Epoch-ms timestamps of admitted requests, per client, oldest first. */
  private readonly hits = new Map<string, number[]>();

  constructor(options: RateLimiterOptions = {}) {
    this.limit = options.limit ?? DEFAULT_RATE_LIMIT;
    this.windowSeconds(options.windowSeconds ?? DEFAULT_WINDOW_SECONDS);
    this.windowMs = (options.windowSeconds ?? DEFAULT_WINDOW_SECONDS) * 1000;
    this.clock = options.clock ?? systemClock;
  }

  private windowSeconds(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new AppError("CONFIGURATION_INVALID", {
        details: { reason: "rate-limit window must be a positive number of seconds" },
      });
    }
  }

  /**
   * Consult the limiter for `clientKey` without throwing, returning the
   * admission {@link RateLimitDecision}. An admitted request is recorded
   * against the window; a rejected request is not.
   */
  check(clientKey: string): RateLimitDecision {
    const now = this.clock.nowMs();
    const cutoff = now - this.windowMs;
    const timestamps = this.prune(clientKey, cutoff);

    if (timestamps.length >= this.limit) {
      const oldest = timestamps[0] as number;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest + this.windowMs - now) / 1000)
      );
      return {
        allowed: false,
        limit: this.limit,
        remaining: 0,
        retryAfterSeconds,
      };
    }

    timestamps.push(now);
    return {
      allowed: true,
      limit: this.limit,
      remaining: this.limit - timestamps.length,
    };
  }

  /**
   * Admit or reject `clientKey`'s request. On rejection, throws the shared
   * `RATE_LIMITED` error carrying the retry-after hint (R29.1); on admission,
   * returns the decision so callers can surface `remaining`/limit headers.
   */
  enforce(clientKey: string): RateLimitDecision {
    const decision = this.check(clientKey);
    if (!decision.allowed) {
      throw new AppError("RATE_LIMITED", {
        retryAfterSeconds: decision.retryAfterSeconds,
        details: { limit: decision.limit },
      });
    }
    return decision;
  }

  /** Drop this client's timestamps at/older than `cutoff`, returning the live list. */
  private prune(clientKey: string, cutoff: number): number[] {
    const existing = this.hits.get(clientKey);
    if (!existing) {
      const fresh: number[] = [];
      this.hits.set(clientKey, fresh);
      return fresh;
    }
    // Timestamps are appended in non-decreasing order, so a single leading
    // slice removes exactly the aged-out entries.
    let firstLive = 0;
    while (firstLive < existing.length && (existing[firstLive] as number) <= cutoff) {
      firstLive++;
    }
    if (firstLive > 0) {
      existing.splice(0, firstLive);
    }
    return existing;
  }
}
