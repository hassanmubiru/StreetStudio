# Architecture

StreetStudio is an independent, open-source screen-recording and
knowledge-sharing platform built **on top of** the StreetJS framework. StreetJS
is consumed only through its public package entry points (HTTP, routing,
validation, config, DI, auth/JWT, PostgreSQL + PG-HA, Redis + Cluster, cache,
queue, events, scheduler, WebSockets, storage, metrics, health, resilience,
security, OpenAPI). StreetStudio never modifies the framework; missing
capabilities are handled with adapters and recorded as gaps with an external
issue reference.

This root file is the top-level entry point. The full, maintained architecture
document lives at **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** and covers:

- Monorepo layout and package boundaries (build-time enforced, acyclic graph).
- How each StreetJS package is used and where adapter seams sit.
- The single request lifecycle: rate limit → authenticate → validate → RBAC →
  service → audit.
- Runtime topology: stateless API tier, background workers, realtime backplane,
  scheduler, PostgreSQL/Redis/object-storage state.
- The data model overview.

Related documents:

- [`docs/API.md`](docs/API.md) — public endpoint reference (request/response/auth/errors).
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — architecture decision records (ADRs).
- [`docs/SECURITY.md`](docs/SECURITY.md) — security model and secure defaults.
- [`docs/MEDIA_PIPELINE.md`](docs/MEDIA_PIPELINE.md) — recording, chunked upload, processing.
- [`docs/PLUGIN_GUIDE.md`](docs/PLUGIN_GUIDE.md) — the plugin model and contracts.
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — self-hosting, scaling, HA.
- [`docs/IMPLEMENTATION_REPORT.md`](docs/IMPLEMENTATION_REPORT.md) — current build status.
