/**
 * Injectable time source for the security middleware.
 *
 * The rate limiter's rolling window is time-dependent, so the current instant
 * is injected rather than read from the ambient environment. Tests provide a
 * deterministic clock; production wires {@link systemClock}.
 */
export interface Clock {
  /** The current time, in epoch milliseconds. */
  nowMs(): number;
}

/** The default clock, backed by the host system time. */
export const systemClock: Clock = {
  nowMs(): number {
    return Date.now();
  },
};
