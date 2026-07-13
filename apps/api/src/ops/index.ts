/**
 * Operational surface of the API_Service (Requirements 30.2, 30.3, 30.4).
 *
 * Bundles the three operator-facing concerns that make the service safe to
 * self-host:
 *
 *  - {@link startApiService}: validates required configuration and aborts with
 *    a named error on any missing/invalid value (R30.3), then activates
 *    dependencies within the 60-second startup budget (R30.2).
 *  - {@link HealthChecker} / {@link exposeHealthCheck}: aggregate dependency
 *    reachability into a passing/failing status and expose it through the
 *    StreetJS health check interface (R30.2, R30.4).
 *  - {@link MetricsRegistry} / {@link exposeMetrics}: record counters/gauges and
 *    publish them through the StreetJS metrics interface (R30.4).
 *
 * Every StreetJS touchpoint is a structural adapter seam, so the host never
 * imports framework internals.
 */
export {
  DEFAULT_STARTUP_DEADLINE_MS,
  startApiService,
} from "./startup.js";
export type {
  ActivateDependencies,
  StartupClock,
  StartupOptions,
  StartupResult,
} from "./startup.js";

export {
  HealthChecker,
  exposeHealthCheck,
  probeFromHealthCheck,
} from "./health.js";
export type {
  DependencyHealth,
  DependencyProbe,
  HealthClock,
  HealthReport,
  HealthState,
  StreetHealthInterface,
} from "./health.js";

export {
  MetricsRegistry,
  exposeMetrics,
} from "./metrics.js";
export type {
  MetricSnapshot,
  StreetMetricsInterface,
} from "./metrics.js";
