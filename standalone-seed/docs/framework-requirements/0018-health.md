# @streetjs/health — health & readiness checks

- **Package:** `@streetjs/health`
- **Consumers (StreetStudio):** API health/readiness endpoints, self-hosting/HA operation
- **Depends on:** `@streetjs/core`
- **Wave:** 1 (kernel)

## Motivation

StreetStudio must expose liveness/readiness that reflect real dependency
reachability (PostgreSQL, Redis, object storage) so orchestrators can route and
restart correctly. Generic platform capability.

## Required API surface

- `registerHealthCheck(name, check)` where `check` reports `up`/`down` + optional detail.
- Aggregated `liveness()` and `readiness()` results (readiness = all critical deps up).
- `HealthModule` providing HTTP-mountable handlers for `@streetjs/http`.
- Timeouts per check so a hung dependency cannot hang the probe.

## Acceptance criteria

- [ ] Readiness reports `down` when any critical dependency check fails, `up` when all pass.
- [ ] A check exceeding its timeout is reported `down` (never hangs the endpoint).
- [ ] Liveness is independent of downstream dependency state.
- [ ] Results are structured and testable with injected check functions.

## Non-goals

- No auto-remediation; no metrics (use `@streetjs/metrics`).
