# Changelog

All notable changes to StreetStudio are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Auth de-seam — concrete `apps/api` Postgres auth assembly (ADR-0020):**
  `assemblePostgresAuth(pool, jwtSecret)` + `ensureApiAuthSchema(pool)` build the
  real `AuthService` (Argon2id + HMAC over real member/session stores), the
  lifecycle authenticator, and the deny-by-default RBAC `AccessControl` over the
  real roles/memberships store — the production wiring the abstract composition
  root was designed to receive. A DB-gated integration test drives the real
  `createApiService` through **both** lifecycle stages against real Postgres:
  a registered+granted member's real token authenticates and is authorized;
  an unauthenticated request is rejected at the authenticate stage; and an
  authenticated member with no membership is denied (audited) at the RBAC stage.

- **Auth de-seam — API RBAC lifecycle stage on real Postgres (ADR-0020):** a
  DB-gated integration test runs the API request lifecycle's RBAC stage with the
  real deny-by-default `RbacAccessControl` backed by real Postgres — a member
  whose role grants `project:create` passes through to the service; a member
  whose role lacks it is denied `AUTHORIZATION_DENIED` and the denial is audited
  with no service run.

- **Auth de-seam — RBAC on real Postgres (ADR-0020):** `@streetstudio/auth`
  gains a real PostgreSQL `RbacStore` (`postgresRbacStore`, `ensureRbacSchema`;
  organization-scoped `roles`/`memberships` tables) so the deny-by-default
  `RbacAccessControl` evaluator runs unchanged on real data. A DB-gated
  integration test verifies grant/deny (role-includes-action, deny-by-default,
  non-member denied, no cross-organization leakage) and `assignRole`
  (permission-gated + membership-checked) against real Postgres.

- **Auth de-seam — API authenticate stage on the real auth core (ADR-0020):**
  `apps/api` gains a production `authServiceAuthenticator` that bridges the
  request-lifecycle authenticate stage to the real `AuthService.verifyAccessToken`
  (real token + session-store check). A DB-gated integration test proves it
  against real Postgres: a member registered/logged-in through the real auth core
  gets a real token the API authenticates; missing → unauthenticated, garbage →
  invalid, and a token is invalid after its session is logged out.

- **Auth de-seam — real `AuthService` verified on real stores (ADR-0020):** the
  real `AuthService` core is verified end-to-end on the **real PostgreSQL
  stores** — an integration test wires
  `AuthService` with `postgresAuthStores` + `Argon2idPasswordHasher` +
  `HmacAccessTokenIssuer` against real Postgres and exercises register → login →
  verify-token → logout (token rejected after logout), plus uniform
  duplicate-registration and wrong-password rejection. Confirms the auth core
  runs on real infrastructure, not seams.

- **Auth de-seam step 1 (ADR-0020):** `@streetstudio/auth` gains **real
  PostgreSQL** `MemberStore`/`SessionStore` adapters (`postgresAuthStores`,
  `ensureAuthSchema`) over the StreetJS `PgPool`, satisfying the same ports the
  in-memory/repository adapters do — additive, so the `AuthService` core and all
  existing consumers/tests are unchanged. `findByEmail` is now a real indexed
  lookup (unique `members.email`) instead of an O(n) scan; sessions use an
  `auth_sessions` table with delete-on-invalidate (R3.4). The member store reads/
  writes the **shared `members` table** (idempotent, compatible DDL), converging
  identity and auth on one member store of record; identity's `members.password_hash`
  is now nullable to support federated members. Verified by an integration test
  against real Postgres (create/indexed-findByEmail/findById; session create/find/
  invalidate→null). Remaining de-seam steps (session/token/key/RBAC swaps,
  consumer migration) proceed incrementally per ADR-0020.

- **Fourth real product slice: `@streetstudio/identity`** — real member
  registration and login with **Argon2id** password hashing (via the standard
  `argon2` library — the framework does not expose password hashing), real
  PostgreSQL member store, and **JWT issuance** through the StreetJS `JwtService`.
  Public `POST /auth/register` and `POST /auth/login` endpoints (non-disclosing:
  unknown email and wrong password both return 401; duplicate email → 409). Also
  provides the shared auth helpers `jwtAuth(secret)` and `requireActor(ctx)`, and
  **`@streetstudio/recordings`, `uploads`, and `playback` were de-duplicated to
  authenticate through them** (removing their copy-pasted `requireActor`/JWT
  wiring). Verified by unit + fast-check property tests (Argon2id round-trip,
  email/password policy) and an integration test against real Postgres
  (register→login over HTTP, verifiable token, 409/401 cases).

- **Third real product slice: `@streetstudio/playback`** — authorized byte-range
  streaming of a completed upload's assembled object. A `PlaybackService`
  composes `@streetjs/storage` (real bytes) and the uploads repository
  (authorization: the object must belong to a completed upload in the actor's
  org), plus a pure, property-tested `parseRange` HTTP `Range` parser. The
  JWT-authenticated HTTP endpoint streams full (200), partial (206), and
  unsatisfiable (416) responses with correct `Accept-Ranges`/`Content-Range`.
  Verified by unit + fast-check property tests and an **integration test against
  real Postgres + real object storage** (create a real completed upload, then
  stream it back: full body, partial + suffix ranges, 416, cross-org 404, 401).
- **CI/coverage now reflects real execution:** `scripts/check.sh` runs the
  coverage gate and enables the DB-gated integration tests when
  `STREETSTUDIO_IT_DATABASE_URL` is set (CI always sets it). Measured coverage
  is **85.75%** with a DB (the figure CI reports) vs ~82% in a no-DB local run.

- **Second real product slice: `@streetstudio/uploads`** — chunked/resumable
  upload sessions on the published StreetJS framework + `@streetjs/storage`.
  Rich, immutable `UploadSession` domain (pending → completed / aborted; idempotent
  part receipt; complete only when all parts present), a use-case service that
  writes parts and **assembles the real object** in storage on completion, a real
  PostgreSQL repository (`received_parts` as JSONB), and a JWT-authenticated HTTP
  API (begin / upload-part / complete / abort / status; part bytes as base64
  JSON). Verified by unit + fast-check property tests and an **integration test
  against real Postgres + real object storage** (local-file driver): a full
  begin→upload→complete HTTP journey that checks the assembled object's bytes,
  plus incomplete-complete (400), abort, and 401. Provider-agnostic — swap to
  S3/R2/MinIO by config. No fakes.

- **First real product slice on the published StreetJS framework:**
  `@streetstudio/recordings` (ADR-0018/0019). Domain-first package with a rich,
  immutable `Recording` model (draft → published → archived, with `canEdit`/
  `canView` invariants), a use-case service, a **real PostgreSQL** repository over
  the native StreetJS `PgPool` (parameterized SQL + idempotent schema), and a
  **real HTTP API** (`@Controller`/`@Get`/`@Post` via `streetApp`) for
  create/list/get/publish/archive. **Real JWT authentication** via StreetJS
  `JwtService` + `authMiddleware` (verified `Authorization: Bearer` → `ctx.user`,
  `sub` = member id; organization scope via `X-Organization-Id`). Verified by
  unit + fast-check property tests and an **integration test against a real
  Postgres** that mints a real JWT and exercises the full create→publish→archive
  HTTP journey plus 401 (unauthenticated) and 404 (cross-organization) cases;
  it runs when `STREETSTUDIO_IT_DATABASE_URL` is set and skips otherwise. No fakes.
- Verified StreetJS is **published** (`streetjs@1.2.7` + `@streetjs/*`
  meta-packages) and adopted the real API: rewrote `docs/FRAMEWORK_CONTRACT.md`,
  corrected the dependency register and charter, added ADR-0019, and retired the
  speculative `docs/framework-requirements/` specs + issue-filing script (they
  assumed a package taxonomy that does not exist).
- Enabled `experimentalDecorators` + `emitDecoratorMetadata` in
  `tsconfig.base.json` (required by StreetJS `@Controller`/`@Injectable`). Suite
  now 167 test files, 810 passing (5 skipped: the DB-gated integration tests),
  83.95% line coverage, 41 packages.

### Changed

- **Freeze lifted for client-side work (ADR-0014, supersedes ADR-0013).** The
  reference build stays the source of truth for the domain model and API, but
  feasible client-side domain/model logic that consumes only the public SDK
  surface is now built and tested here. ADR-0013's full freeze is superseded;
  README and STATUS.md reflect the active client-side implementation state. Work
  that still requires a separate repository, npm publishing, real infrastructure,
  UI/native runtimes, or unpublished `@streetjs/*` packages remains out of scope.
- **Repository frozen as the reference build (ADR-0013, superseded by ADR-0014).**
  Recorded for history: the repo was briefly declared a frozen historical
  reference before the freeze was narrowed to allow client-side logic here.

### Added

- Dashboard client-side application logic (client work under ADR-0014, no backend
  changes): `@streetstudio/dashboard` gains `DashboardSession` (credential/scope
  management over the SDK — bearer/API-key auth, active-organization scoping,
  best-effort sign-out) and read-oriented use-case flows: `loadWorkspace`,
  `openProject`, `listFolderVideos`, `openVideo` (video + comments + playback,
  with best-effort transcript/summary), the pure `threadComments` grouper,
  `loadNotifications` (list + derived unread count), and `searchVideos` (blank
  queries short-circuit without a round-trip). Adds `UploadController` — a
  client-side upload-session state machine (create → track `ackedChunks`
  progress → complete/abort) with a pure `uploadProgress` derivation; it drives
  the SDK's upload surface and composes (does not duplicate) the recorder's
  byte-level chunk/queue/retry logic. Adds sharing flows (`createShareLink`,
  `resolveSharedVideo`, `revokeShareLink`, plus a pure `shareLinkState` /
  `isShareLinkActive` derivation), reaction flows (`addReaction`,
  `removeReaction`, `toggleReaction`, plus a pure `summarizeReactions` tally),
  and `EditSessionController` — an undo/redo-capable edit-session over the pure
  `@streetstudio/editor` reducer and `@streetstudio/timeline` model (now direct
  dashboard dependencies). Talks to the API exclusively through
  `@streetstudio/sdk`; verified with an in-memory scripted transport (28 tests).
  No UI rendering layer yet. Suite now 165 files, 801 passing, 85.47% coverage.

- Client-model implementation (product-development phase, no backend changes):
  `@streetstudio/timeline` gains pure helper ops (`totalDuration`, `clipCount`,
  `sortedMarkers`, `withMarker`), and `@streetstudio/editor` gains a
  non-destructive reducer (`applyEdit`/`applyEdits`) for trim/split/merge/speed
  with crop/caption/annotate as render-time overlays. Covered by unit tests plus
  a fast-check property test. Suite now 164 files, 773 passing, 84.99% coverage.
- Productionization roadmap in `IMPLEMENTATION-PLAN.md` — the 10-phase delivery
  sequence (standalone repo → StreetJS integration → dashboard → recorder →
  media → infrastructure → plugin ecosystem → mobile → UX → public preview) with
  deliverables, plus a **governing rule** marking the shift from specification
  implementation to product development (no new backend work unless driven by
  real usage or StreetJS evolution).
- Honest status/spec split (documentation discipline): new `STATUS.md` (live,
  measured per-area progress with a scope caveat), `IMPLEMENTATION-PLAN.md` (the
  phased master spec, sections marked Planned / In reference build / Shipped),
  and `scripts/status.mjs` + `npm run status` (measured static counts — no
  hand-edited metrics). The former "Implementation Report" was reframed as a
  **Reference-Build Report** with an explicit scope/provenance banner: its
  metrics are measured in this workspace, and it is not a published product.

- Product-side layout aligned to the target (ADR-0012): renamed `apps/web` →
  `apps/dashboard`; added `apps/recorder-extension` and `packages/{types,
  timeline, editor}`; added a root `street.config.ts` composition template. Now
  5 apps / 40 packages.
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
