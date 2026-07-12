/**
 * A monotonic-enough source of the current time.
 *
 * Authentication logic (token expiry, session lifetime, lockout windows) is
 * time-dependent, so the clock is injected rather than read from the ambient
 * environment. Tests provide a deterministic clock; production wires
 * {@link systemClock}.
 */
export interface Clock {
  /** The current instant. */
  now(): Date;
}

/** The default clock, backed by the host system time. */
export const systemClock: Clock = {
  now(): Date {
    return new Date();
  },
};
