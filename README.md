# StreetStudio

Open-source asynchronous collaboration platform for video/screen recording, review, and knowledge sharing. StreetStudio is the flagship application built on the **StreetJS** framework.

## StreetJS consumption policy

> **StreetStudio is built exclusively on the public, versioned API surface of
> StreetJS. It does not import framework internals, use local path references, or
> depend on unpublished framework changes. If StreetStudio requires a reusable
> capability that StreetJS does not provide, that capability is developed and
> released in StreetJS first, then consumed by StreetStudio as a normal
> dependency.**

Concretely: StreetJS is consumed only as published, versioned npm packages
(`streetjs`, `@streetjs/*`) — **no symlinks, git submodules, workspace
references, `file:`/`link:` specifiers, GitHub-URL dependencies, `../streetjs`
imports, or framework-internal imports.** StreetStudio treats StreetJS exactly
like any external customer would (Laravel/Django/Spring Boot/ASP.NET Core), which
is what makes it a *credible* real-world validation of the framework rather than
an example app living inside it. The contract is enforced in CI by
`npm run streetjs:check` and the import boundary analyzer, and documented in
[`docs/DECISIONS.md`](docs/DECISIONS.md) (ADR-0011). It never modifies StreetJS
source and contains no StreetJS source in this repository.

## Monorepo layout

```
apps/
  api/       API_Service: REST + WebSocket + Webhook host (StreetJS app)
  web/       Web_Client (browser SPA)
  desktop/   Desktop_Client (wraps web + native capture)
  docs/      Documentation site
packages/
  ui/            Shared UI components (web + desktop)
  sdk/           Public client library (REST + WebSocket)
  shared/        Cross-cutting types, DTOs, errors, constants
  config/        Config schema + loading via StreetJS config
  database/      Schema, migrations, repositories, audit log
  auth/          Authentication, sessions, RBAC, API keys
  organizations/ Organizations, teams, membership, invitations, admin
  projects/      Content hierarchy: projects, folders, workspaces
  media/         Videos, assets, uploads, sharing, dev-assets, reviews
  storage/       Storage abstraction + StorageProvider contract (providers are plugins)
  knowledge/     Transcript indexing, summaries, doc links (knowledge base)
  comments/      Comments, threads, reactions, mentions
  search/        Search + transcript search (authorized scope)
  player/        Streaming/playback: ABR manifest with permission & share-credential gating
  recorder/      Recorder capture + chunked/resumable upload client
  processing/    Media pipeline: transcode, thumbnail, preview
  notifications/ Notifications + event contracts
  realtime/      Realtime gateway: presence, typing, live fan-out (Redis backplane)
  plugins/       Plugin_Manager, plugin contracts, isolation
  ai/            AI capability router (routing only; providers are plugins)
  integrations/  Integration framework: contract, registry, built-in catalog
  analytics/     View events + aggregation
```

Each package declares a single primary domain responsibility (`streetstudio.domain` in its manifest) and exposes a public surface **only** through its declared entry point (`exports["."]`). Cross-package imports must target entry points, never internal modules. The dependency graph is acyclic.

## Documentation

Start with the [**VISION**](VISION.md) — the founding vision and master plan — and [**PRODUCT**](docs/PRODUCT.md) — the experience-centric product strategy ("the asynchronous operating system for software teams").

The full documentation set lives under [`docs/`](docs/):

- [PRODUCT](docs/PRODUCT.md) — experience-centric product strategy: positioning, lifecycle, knowledge graph, roadmap.
- [ARCHITECTURE](docs/ARCHITECTURE.md) — monorepo layout, StreetJS consumption, boundaries, request lifecycle, runtime topology.
- [ROADMAP](docs/ROADMAP.md) — direction and planned work.
- [CONTRIBUTING](docs/CONTRIBUTING.md) — dev setup, boundary rules, test strategy, review expectations.
- [SECURITY](docs/SECURITY.md) — security model, secure defaults, vulnerability reporting.
- [API](docs/API.md) — public endpoint reference: request/response/auth/error formats, and the no-auth allow-list.
- [PLUGIN_GUIDE](docs/PLUGIN_GUIDE.md) — the plugin model and contracts (storage, AI, integrations, billing).
- [MEDIA_PIPELINE](docs/MEDIA_PIPELINE.md) — recording, chunked upload, and processing.
- [DEPLOYMENT](docs/DEPLOYMENT.md) — self-hosting, configuration, health/metrics, scaling, HA.
- [DECISIONS](docs/DECISIONS.md) — architecture decision records (ADRs).

Copy-pasteable [examples](examples/) show the public API/SDK in action (SDK quickstart, self-hosting).

## StreetJS gap register

Per the consumption policy above, StreetStudio never modifies StreetJS. Where a
required capability is missing or weak in StreetJS, StreetStudio implements it
inside its own packages (importing StreetJS only through public entry points)
and records the gap here with a reference to an external StreetJS issue
(Requirement 1.4). No entry below implies any change to StreetJS source.

> **Note:** The issue URLs below are **placeholders** in the form
> `https://github.com/streetjs/streetjs/issues/NNN`. Replace each with the real
> upstream issue once filed.

| # | Capability gap | Where StreetStudio implements it | External StreetJS issue (placeholder) |
| - | -------------- | -------------------------------- | ------------------------------------- |
| 1 | Cross-package/StreetJS import boundary and acyclic-graph enforcement is not provided by the framework's plugin loader. | `packages/config` build tooling (`boundary:check`, `graph:check`). | https://github.com/streetjs/streetjs/issues/101 (placeholder) |
| 2 | Resumable, integrity-checked chunked upload sessions (resume-from-last-acknowledged, 24h expiry) are not offered by the storage interface. | `apps/api` upload controller + `packages/media`. | https://github.com/streetjs/streetjs/issues/102 (placeholder) |
| 3 | Media processing pipeline (transcode, thumbnail, preview, ABR renditions) with bounded retries is domain-specific and absent from the framework. | `packages/processing` workers. | https://github.com/streetjs/streetjs/issues/103 (placeholder) |
| 4 | Vendor-neutral AI capability routing with graceful `AI_UNAVAILABLE` fallback is not a framework primitive. | `packages/plugins` AI capability router. | https://github.com/streetjs/streetjs/issues/104 (placeholder) |
| 5 | Signed webhook delivery with bounded exponential-backoff retries beyond the base queue/resilience primitives. | `apps/api` webhooks + worker delivery. | https://github.com/streetjs/streetjs/issues/105 (placeholder) |

When you discover a new StreetJS weakness, add a row here (with an external issue
reference) rather than patching StreetJS.

## Development

```bash
npm install       # install workspaces + dev tooling
npm run build     # tsc -b across all project references
npm test          # vitest run (property tests use fast-check, >=100 iterations)
```

Requires Node.js >= 20.
