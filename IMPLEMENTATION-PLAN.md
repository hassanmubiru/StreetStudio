# StreetStudio — Implementation Plan

This is the **master implementation specification and phased plan**. It is the
source of truth for *what will be built and in what order*; measured progress
lives in [`STATUS.md`](STATUS.md), and the *why* lives in [`VISION.md`](VISION.md)
and [`docs/PRODUCT.md`](docs/PRODUCT.md).

Sections are marked **Planned**, **In reference build** (implemented & tested in
this workspace behind StreetJS adapter seams), or **Shipped** (built against
published `@streetjs/*` packages in the real StreetStudio repository). Nothing is
marked "Shipped" until it is true in the published product.

## Relationship with StreetJS (non-negotiable)

- StreetJS remains an **independent framework repository** and must not contain
  StreetStudio code.
- StreetStudio is an **independent application repository** built entirely on the
  **public APIs of published StreetJS packages**.
- StreetStudio must never import StreetJS source files or use relative/path
  references into the StreetJS repository (enforced by `npm run streetjs:check`).
- Any missing framework capability discovered while building StreetStudio is
  first added to StreetJS, released to npm, then consumed here as a versioned
  dependency (promotion-first — ADR-0011/0012).

This keeps StreetStudio both a production application and a real-world validation
of StreetJS.

## Build strategy

Build incrementally — never all 40 packages at once. Each phase lands a thin,
tested vertical slice, updates `STATUS.md` from measured results, and only then
moves on.

## Reference-build phases (high level)

Phases 1–9 are the reference build (complete in this workspace); phases 10–14
are productionization, detailed in the **Productionization roadmap** below.

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 1  | Repository, monorepo, CI, boundary/graph/streetjs gates, config | In reference build |
| 2  | Auth, organizations, projects, database, storage abstraction | In reference build |
| 3  | Recording, chunked/resumable upload, processing pipeline, player | In reference build |
| 4  | Comments, notifications, realtime, search | In reference build |
| 5  | Sharing, content permissions, RBAC, audit log | In reference build |
| 6  | Plugins, AI router, billing abstraction, integrations framework | In reference build |
| 7  | Public API surface + auto-mirrored SDK, webhooks, security defaults | In reference build |
| 8  | Analytics, knowledge base, developer mode, engineering reviews | In reference build |
| 9  | Self-hosting: startup/health/metrics, PostgreSQL HA, Redis Cluster | In reference build |
| 10 | **Real StreetJS integration** — swap seams for published `@streetjs/*` | Planned (blocked on publishing) |
| 11 | Dashboard web UI (browse, record, play, comment, search) | Planned |
| 12 | Desktop client + recorder extension (native capture, offline queue) | Planned |
| 13 | Browser editor + timeline UI (trim/split/annotate/markers) | Planned |
| 14 | Production release: hardening, docs, self-hosted installer, v1.0.0 | Planned |

> The phases marked "In reference build" are implemented and pass the suite in
> **this workspace** against in-memory fakes. They become "Shipped" only when
> running in the published repository against released `@streetjs/*` packages and
> real infrastructure (Phase 10 onward).

## Package status (start empty, fill as implemented)

| Package / app | Purpose | Status |
| ------------- | ------- | ------ |
| `packages/shared`, `config`, `database` | Foundations, tooling, persistence | In reference build |
| `packages/auth`, `organizations`, `projects` | Identity, tenancy, content hierarchy | In reference build |
| `packages/media`, `storage`, `recorder`, `processing`, `player` | Media path | In reference build |
| `packages/comments`, `search`, `notifications`, `realtime`, `knowledge` | Collaboration + knowledge | In reference build |
| `packages/plugins`, `ai`, `integrations`, `storage-*`, `integration-*` | Extensibility | In reference build |
| `packages/analytics`, `sdk` | Analytics + client library | In reference build |
| `packages/timeline`, `editor` | Client models (timeline + edit reducer) | Implemented & tested (no UI) |
| `packages/ui`, `types` | Shared UI components / product type aliases | Model/scaffold only |
| `apps/api` | API_Service host | In reference build (seam-level) |
| `apps/dashboard`, `apps/desktop`, `apps/recorder-extension` | Clients | Scaffold only |
| `apps/docs` | Documentation site | Scaffold only |
| `apps/mobile` | Mobile client | Planned (not scaffolded) |

## Definition of done (per phase)

1. Code implemented behind StreetJS adapter seams (or against published
   `@streetjs/*` once available).
2. Tests written and passing (`npm test`); property tests where a correctness
   property applies.
3. `build`, `graph:check`, `boundary:check`, `streetjs:check` all green.
4. Coverage ≥ 80% lines.
5. `STATUS.md` regenerated from measured results; `CHANGELOG.md` updated.

## Productionization roadmap (post-reference-build)

The reference implementation implements and verifies every item in its
specification. Work now shifts from *specification implementation* to *product
development*. The phases below expand phases 10–14 above into the delivery
sequence; most execute in the **standalone repository**, not this workspace.

### Phase 1 — Split into a real project

Create the standalone StreetStudio repository (preserve git history if possible);
set up independent CI/CD; publish `v0.1.0-dev`; establish releases, issue
tracking, and project boards.
**Deliverable:** StreetStudio exists as an independent project.

### Phase 2 — Complete the StreetJS integration

Replace every compatibility adapter with published StreetJS packages as they
become available, subsystem by subsystem: Core, Configuration, HTTP, Routing,
Auth, RBAC, Storage, Realtime, WebSocket, Jobs, Metrics, Health, Plugin runtime.
Then remove the compatibility layer entirely.
**Deliverable:** no compatibility adapters remain (`streetjs:check` still green).

### Phase 3 — Build the Dashboard

The largest remaining feature. Implement, using the SDK exclusively:
authentication, organization selector, projects, folder tree, upload UI, video
browser, player, comments, search, notifications, admin pages, settings, plugin
management, analytics, responsive layout.
**Deliverable:** a usable web application.

### Phase 4 — Recorder

Browser extension: screen/window/tab capture, microphone, camera, offline queue,
chunk uploads, resume uploads. Desktop: native capture, system audio, background
recording, auto-update, crash recovery.
**Deliverable:** real recording clients.

### Phase 5 — Media

Replace the reference (in-memory) implementations with a production pipeline:
FFmpeg pipeline, thumbnail generation, preview generation, HLS/DASH, adaptive
bitrate, waveforms, metadata extraction, processing queues.
**Deliverable:** production media pipeline.

### Phase 6 — Infrastructure

Deploy against real services: PostgreSQL, Redis, S3/R2/MinIO, background workers,
reverse proxy, TLS, Docker, Kubernetes, backup/restore, monitoring, logging,
tracing.
**Deliverable:** self-hostable production deployment.

### Phase 7 — Plugin ecosystem

Finish the plugin model: storage plugins, AI providers, billing providers,
integrations, developer SDK, marketplace, plugin documentation, version
compatibility, isolation, signing, permissions.
**Deliverable:** a complete, extensible plugin ecosystem.

### Phase 8 — Mobile

Native client: view recordings, upload, notifications, comments, sharing,
offline mode.
**Deliverable:** mobile client.

### Phase 9 — UX

The biggest remaining risk. User testing, usability studies, performance
optimization, accessibility, keyboard shortcuts, onboarding, documentation
videos.
**Deliverable:** validated, accessible user experience.

### Phase 10 — Public preview

With the above in place: release Developer Preview, collect issues, iterate →
Beta → v1.0 → hosted cloud offering.
**Deliverable:** public releases along the maturity ladder.

## Governing rule: specification-complete → product development

From this point forward, the project is treated as **specification-complete for
the reference build**. Therefore:

- Do **not** invent new backend work unless it is driven by **real usage** or by
  **StreetJS evolution**.
- Future effort is primarily: building the clients, integrating published
  `@streetjs/*` packages, validating against real infrastructure, and improving
  the user experience based on testing.
- New reusable framework capabilities are promoted into StreetJS first, released,
  then consumed here (ADR-0011/0012) — never re-implemented as StreetStudio
  backend.

This shifts the project from specification implementation to product
development, which is the natural next stage.
