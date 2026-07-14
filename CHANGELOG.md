# Changelog

All notable changes to StreetStudio are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- ADR-0012 (Proposed) — target framework-consumption map and promotion backlog:
  the granular `@streetjs/*` packages StreetStudio will consume as StreetJS
  publishes them, the product-specific packages that stay, the refined app/package
  layout, and the independent release strategy. Migration is incremental and
  gated on each `@streetjs/*` package being published.
- StreetJS consumption contract (ADR-0011) codified and **enforced**: a new
  `npm run streetjs:check` gate (`scripts/check-streetjs-consumption.mjs`) fails
  the build on any non-registry StreetJS dependency specifier
  (`file:`/`link:`/`workspace:`/`git`/url) or any path/deep-scoped StreetJS
  import. Wired into `scripts/check.sh` and CI; the README consumption policy was
  tightened (no local package links) and the promotion-first rule documented.
- `docs/PRODUCT.md` — experience-centric product strategy addressing the
  lead-architect review: positioning ("the asynchronous operating system for
  software teams"), the Capture→Explain→Collaborate→Track→Resolve→Archive
  lifecycle, the engineering knowledge graph, recorder markers, whole-workflow
  engineering reviews, Developer Mode diagnostics, outcome-based analytics, and
  an experience-based roadmap. Linked from README/VISION; the report now points
  to it for the "why".
- ADR-0010 (Proposed) — separate `knowledge`/`projects`/`storage` from `media`
  and reserve a future `apps/mobile`, per the review's recommended layout.


- Top-level project meta files: `LICENSE` (Apache-2.0), root `ARCHITECTURE.md`,
  `ROADMAP.md`, `CONTRIBUTING.md`, this `CHANGELOG.md`, and a `scripts/`
  directory (`scripts/check.sh` local CI gate).
- New `@streetstudio/player` package: streaming/playback (`PlaybackService`)
  extracted from `@streetstudio/media` into an independently-consumable package
  (ADR-0008).
- `VISION.md` — founding vision, product strategy, and master development plan,
  with a reconciliation appendix mapping the target package sketch to the
  implemented layout.
- `examples/` directory — SDK quickstart and Docker Compose self-hosting guide,
  both driven exclusively through the public API/SDK surface.
- Split `@streetstudio/projects`, `@streetstudio/storage`, and
  `@streetstudio/knowledge` out of `@streetstudio/media` (ADR-0010) — knowledge
  evolves independently of media bytes. The six `storage-*` provider plugins and
  the conformance suite now import the `StorageProvider` contract from
  `@streetstudio/storage`. Monorepo is now 37 packages.
- Six standalone domain packages extracted to match the vision sketch (ADR-0009):
  `@streetstudio/organizations`, `@streetstudio/comments`, `@streetstudio/search`,
  `@streetstudio/realtime`, `@streetstudio/ai`, and a new
  `@streetstudio/integrations` framework (integration-plugin contract, registry,
  built-in catalog). The monorepo package layout now matches VISION.md one-to-one.

### Changed

- Renamed `@streetstudio/recording` → `@streetstudio/recorder`
  (`packages/recording` → `packages/recorder`); updated `apps/web` and
  `apps/desktop` project references and manifests (ADR-0008).
- `@streetstudio/media` no longer contains playback; the `VIEW_VIDEO_PERMISSION`
  contract moved to `packages/media/src/permissions.ts` (still exported from the
  media entry point and re-exported by `@streetstudio/player`).

- CI (`.github/workflows/ci.yml`): removed the unpullable `bitnami/minio` service
  container (the public Bitnami catalog was moved to a legacy archive) and wired
  the reachability-gated integration tests to the official PostgreSQL/Redis
  service containers via `STREETSTUDIO_IT_*` env vars.

## [0.1.0] — Unreleased

Initial implementation of the StreetStudio platform on the StreetJS framework.

### Added

- Monorepo scaffold with build-time boundary and acyclic-dependency-graph
  enforcement (`packages/config`).
- Shared foundation: error taxonomy, wire DTOs, fast-check generators
  (`packages/shared`).
- Configuration loading and startup validation (`packages/config`).
- Database layer with repositories and an append-only audit log
  (`packages/database`).
- Authentication, sessions, RBAC, and API keys (`packages/auth`).
- Organizations, teams, membership, administration, and content hierarchy.
- Media path: storage abstraction, chunked/resumable uploads, recorder client,
  processing pipeline, streaming/playback (`packages/{media,recording,processing}`).
- Collaboration: sharing, comments/mentions/reactions, notifications, the
  realtime gateway, and search (`packages/{media,notifications}`).
- Extensibility: Plugin_Manager, storage provider plugins (local/S3/R2/Azure/
  GCS/MinIO), AI capability router, billing abstraction, and integration plugins.
- Analytics, webhooks, and secure-by-default security middleware.
- Public API surface with the `PUBLIC_OPERATIONS` catalog, REST/WebSocket
  controllers, and the auto-mirrored SDK (`@streetstudio/sdk`).
- Self-hosting: startup/health/metrics, PostgreSQL HA and Redis Cluster
  operation with reconnection, container images, and deployment config.
- Documentation set under `docs/` and a comprehensive test suite (unit,
  integration, contract, e2e, performance, load, media pipeline) with an 80%
  coverage gate in CI.
