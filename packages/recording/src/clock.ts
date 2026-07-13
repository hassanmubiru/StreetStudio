/**
 * A source of the current time for the Recorder.
 *
 * Recorder behavior is time-dependent — finalizing captured media within a
 * bounded deadline on stop (R6.9) and stamping locally stored offline
 * recordings (R6.10) — so the clock is injected rather than read from the
 * ambient environment. Tests provide a deterministic clock; production wires
 * {@link systemClock}. Kept local to the recording package so the package
 * depends only on `@streetstudio/shared`.
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
