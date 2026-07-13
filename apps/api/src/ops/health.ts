/**
 * API_Service health checking (Requirements 30.2, 30.4).
 *
 * The health check reports a passing status only when every required dependency
 * is reachable, and a failing status as soon as any one of them is unreachable
 * (R30.4). Each dependency is probed behind a narrow structural seam
 * ({@link DependencyProbe}) so the checker can be exercised with in-memory fakes
 * and no real network, database, or clock — the concrete PostgreSQL, Redis, and
 * storage adapters supply their probes at composition time.
 *
 * The result is surfaced to operators through the StreetJS health check
 * interface. To avoid a hard dependency on the optional `@streetjs/core` peer,
 * the checker is written against a minimal structural
 * {@link StreetHealthInterface}; the composition root adapts the concrete
 * StreetJS health object and registers the checker with
 * {@link exposeHealthCheck}.
 */

/** Whether the service (or a single dependency) is healthy. */
export type HealthState = "passing" | "failing";

/**
 * A single dependency's reachability probe. `check` resolves when the
 * dependency is reachable and rejects (or throws) when it is not. Probes are
 * the only seam the checker touches, keeping it free of concrete clients.
 */
export interface DependencyProbe {
  /** Human-readable name reported in the health report (e.g. `"database"`). */
  readonly name: string;
  /** Resolve when reachable; reject/throw when unreachable. */
  check(): Promise<void>;
}

/** The reachability outcome for one dependency. */
export interface DependencyHealth {
  /** The dependency's name, as declared by its {@link DependencyProbe}. */
  readonly name: string;
  /** True when the probe resolved; false when it rejected. */
  readonly reachable: boolean;
  /** Non-disclosing explanation when unreachable; omitted when reachable. */
  readonly detail?: string;
}

/** The aggregate health report produced by {@link HealthChecker.check}. */
export interface HealthReport {
  /** `"passing"` iff every required dependency is reachable (R30.4). */
  readonly status: HealthState;
  /** Per-dependency reachability, in probe declaration order. */
  readonly dependencies: readonly DependencyHealth[];
  /** Epoch milliseconds the report was produced (from the injected clock). */
  readonly checkedAt: number;
}

/** Injectable time source so health timestamps are deterministic in tests. */
export interface HealthClock {
  /** Current time in epoch milliseconds. */
  now(): number;
}

const systemClock: HealthClock = { now: () => Date.now() };

/**
 * Build a {@link DependencyProbe} from any dependency exposing the storage-style
 * `healthCheck(): Promise<void>` connectivity seam (e.g. the media
 * {@link StorageProvider}, or a database/Redis adapter that mirrors it). The
 * probe simply delegates to `healthCheck`, so the same connectivity contract
 * used on activation (R9.4) drives the live health report.
 */
export function probeFromHealthCheck(
  name: string,
  dependency: { healthCheck(): Promise<void> },
): DependencyProbe {
  return { name, check: () => dependency.healthCheck() };
}

/** Reduce an unknown thrown value to a short, non-disclosing detail string. */
function toDetail(reason: unknown): string {
  if (reason instanceof Error && reason.message) {
    return reason.message;
  }
  if (typeof reason === "string" && reason.length > 0) {
    return reason;
  }
  return "unreachable";
}

/**
 * Aggregates dependency reachability into a single {@link HealthReport}.
 *
 * Probes are evaluated concurrently and independently: one unreachable
 * dependency does not mask the status of the others, and the overall status is
 * `"passing"` only when they all resolve (R30.4). With no probes registered the
 * report is `"passing"` — there is nothing that could be unreachable.
 */
export class HealthChecker {
  private readonly probes: readonly DependencyProbe[];
  private readonly clock: HealthClock;

  constructor(probes: readonly DependencyProbe[] = [], clock: HealthClock = systemClock) {
    this.probes = [...probes];
    this.clock = clock;
  }

  /** The names of the dependencies this checker probes, in order. */
  dependencyNames(): readonly string[] {
    return this.probes.map((p) => p.name);
  }

  /**
   * Probe every dependency and produce the aggregate report. Never throws for a
   * dependency failure — an unreachable dependency is reported as
   * `reachable: false`, and the overall status becomes `"failing"`.
   */
  async check(): Promise<HealthReport> {
    const dependencies = await Promise.all(
      this.probes.map(async (probe): Promise<DependencyHealth> => {
        try {
          await probe.check();
          return { name: probe.name, reachable: true };
        } catch (reason) {
          return { name: probe.name, reachable: false, detail: toDetail(reason) };
        }
      }),
    );

    const status: HealthState = dependencies.every((d) => d.reachable)
      ? "passing"
      : "failing";

    return { status, dependencies, checkedAt: this.clock.now() };
  }
}

/**
 * The subset of the StreetJS health check interface this host relies on. The
 * concrete object is obtained by the composition root through the
 * `@streetjs/core` public entry point; this structural view keeps the host
 * free of a hard peer dependency.
 */
export interface StreetHealthInterface {
  /**
   * Register a named health check whose callback resolves to `true` when the
   * subject is healthy and `false` otherwise. StreetJS invokes the callback to
   * back the health check endpoint.
   */
  registerHealthCheck(name: string, check: () => Promise<boolean>): void;
}

/**
 * Expose a {@link HealthChecker} through the StreetJS health check interface so
 * its result backs the platform health endpoint (R30.4). The registered
 * callback reports healthy exactly when the aggregate status is `"passing"`.
 */
export function exposeHealthCheck(
  street: StreetHealthInterface,
  checker: HealthChecker,
  name = "api",
): void {
  street.registerHealthCheck(name, async () => {
    const report = await checker.check();
    return report.status === "passing";
  });
}
