# @streetjs/metrics — metrics & telemetry (OpenTelemetry/Prometheus)

- **Package:** `@streetjs/metrics`
- **Consumers (StreetStudio):** API request metrics, processing/queue metrics, analytics substrate
- **Depends on:** `@streetjs/core`
- **Wave:** 1 (kernel)

## Motivation

StreetStudio needs production observability — counters, gauges, histograms and
trace context — exported to standard collectors. Generic platform capability.

## Required API surface

- Instrument constructors: `counter`, `gauge`, `histogram` with labels/attributes.
- Timing helpers (e.g. `startTimer()`/`record`) for latency histograms.
- `MetricsModule` providing a registry to the DI container.
- OpenTelemetry-compatible export (OTLP) and Prometheus scrape endpoint/exposition.
- Trace/span context propagation hooks usable by `@streetjs/http`.

## Acceptance criteria

- [ ] Instruments record values with labels and export in OTLP and Prometheus formats.
- [ ] A Prometheus exposition endpoint returns registered metrics in text format.
- [ ] Histograms produce correct bucket counts/sum under concurrent updates.
- [ ] No measurable overhead when metrics are disabled/no-op configured.

## Non-goals

- No dashboards/alerting (external); no log shipping (separate concern).
