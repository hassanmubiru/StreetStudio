# Changelog

All notable changes to StreetStudio are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Top-level project meta files: `LICENSE` (Apache-2.0), root `ARCHITECTURE.md`,
  `ROADMAP.md`, `CONTRIBUTING.md`, this `CHANGELOG.md`, and a `scripts/`
  directory (`scripts/check.sh` local CI gate).
- New `@streetstudio/player` package: streaming/playback (`PlaybackService`)
  extracted from `@streetstudio/media` into an independently-consumable package
  (ADR-0008).

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
