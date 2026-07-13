/**
 * API_Service operational metrics (Requirement 30.4).
 *
 * A tiny, dependency-free metrics registry that the host increments/sets as it
 * serves requests, exposed to operators through the StreetJS metrics interface.
 * As with configuration and health, the registry is written against a minimal
 * structural {@link StreetMetricsInterface} so this package needs no hard
 * dependency on the optional `@streetjs/core` peer; the composition root adapts
 * the concrete StreetJS metrics object and publishes with {@link exposeMetrics}.
 *
 * Only two metric kinds are modelled — monotonic counters and point-in-time
 * gauges — which is enough to surface request/error counts and live resource
 * levels through the endpoint without pulling in a metrics framework.
 */

/** An immutable point-in-time view of every recorded metric. */
export interface MetricSnapshot {
  /** Monotonically increasing counters, keyed by metric name. */
  readonly counters: Readonly<Record<string, number>>;
  /** Last-set gauge values, keyed by metric name. */
  readonly gauges: Readonly<Record<string, number>>;
}

/**
 * In-memory registry of counters and gauges. Counters only ever increase;
 * gauges hold the most recently set value. The registry is safe to share across
 * the host and is read via {@link MetricsRegistry.snapshot}.
 */
export class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();

  /**
   * Increase counter `name` by `amount` (default 1). Negative amounts are
   * rejected so counters remain monotonic.
   */
  increment(name: string, amount = 1): void {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new RangeError(`Counter increment must be a non-negative finite number: ${amount}`);
    }
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }

  /** Set gauge `name` to `value`, replacing any prior reading. */
  setGauge(name: string, value: number): void {
    if (!Number.isFinite(value)) {
      throw new RangeError(`Gauge value must be a finite number: ${value}`);
    }
    this.gauges.set(name, value);
  }

  /** Current value of counter `name`, or 0 if it has never been incremented. */
  counter(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  /** Current value of gauge `name`, or `undefined` if it has never been set. */
  gauge(name: string): number | undefined {
    return this.gauges.get(name);
  }

  /** An immutable snapshot of all counters and gauges. */
  snapshot(): MetricSnapshot {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
    };
  }
}

/**
 * The subset of the StreetJS metrics interface this host relies on. The
 * concrete object is obtained by the composition root through the
 * `@streetjs/core` public entry point; this structural view keeps the host free
 * of a hard peer dependency.
 */
export interface StreetMetricsInterface {
  /** Report a counter's current value under `name`. */
  counter(name: string, value: number): void;
  /** Report a gauge's current value under `name`. */
  gauge(name: string, value: number): void;
}

/**
 * Publish a {@link MetricsRegistry} snapshot through the StreetJS metrics
 * interface so it backs the platform metrics endpoint (R30.4). Returns the
 * snapshot that was published for convenience/testing.
 */
export function exposeMetrics(
  street: StreetMetricsInterface,
  registry: MetricsRegistry,
): MetricSnapshot {
  const snapshot = registry.snapshot();
  for (const [name, value] of Object.entries(snapshot.counters)) {
    street.counter(name, value);
  }
  for (const [name, value] of Object.entries(snapshot.gauges)) {
    street.gauge(name, value);
  }
  return snapshot;
}
