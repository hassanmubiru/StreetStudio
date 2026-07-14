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

## Phases

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
| `packages/ui`, `types`, `timeline`, `editor` | Client models / shared UI | Model/scaffold only |
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
