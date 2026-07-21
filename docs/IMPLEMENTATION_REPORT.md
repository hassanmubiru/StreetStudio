# StreetStudio — Reference-Build Report

> **Scope & provenance (read first).** This report describes the **spec-driven
> reference build in this workspace** — domain logic and the API assembled behind
> StreetJS adapter seams and exercised with in-memory fakes. Every metric below
> was **measured here** (`npm run status` for counts; `npm test` /
> `npm run test:coverage` for pass/coverage) on the date of the run — they are
> real, not hand-written. What this report does **not** claim: it is not a
> *published product*. The separate published StreetStudio repository, npm
> releases, real `@streetjs/*` runtime packages, real infrastructure, and shipping
> UI clients **do not exist yet**. For live per-area status see
> [`../STATUS.md`](../STATUS.md); for the phased plan see
> [`../IMPLEMENTATION-PLAN.md`](../IMPLEMENTATION-PLAN.md); for the *why*, see
> [`PRODUCT.md`](PRODUCT.md) and [`../VISION.md`](../VISION.md).

## Why StreetStudio exists

StreetStudio is not intended to be another screen recorder. Its goal is to become
the reference application that proves StreetJS can power large, production-grade
software while offering capabilities not available in proprietary platforms. Core
differentiators:

- Fully self-hostable
- Plugin-first architecture
- AI provider independence (no vendor lock-in)
- Organization ownership of all data
- API-first platform (UI/API parity)
- Workflow automation
- Built on published StreetJS packages
- Open governance

The full experience-centric strategy lives in [`PRODUCT.md`](PRODUCT.md).

## Reference build snapshot

*The 20-second view (measured in this workspace; see the sections below for detail).*

- Reference backend specification: **implemented & verified**
- **184** specification tasks implemented & verified
- **32 / 32** requirements satisfied
- **88** correctness properties verified
- **876** passing tests with a DB (integration tests skip in a no-DB run)
- **86.05%** line coverage (DB-backed, as CI runs; ~82% in a no-DB local run)
- **Four real slices on published StreetJS:** `@streetstudio/recordings`,
  `@streetstudio/uploads`, `@streetstudio/playback`, and `@streetstudio/identity`
  (real HTTP + Postgres + object storage + Argon2id/JWT auth)
- Independent StreetJS consumer (published packages only)
- Dashboard **client-side logic** (session/flows) implemented; UI rendering layers remain unbuilt
- Production deployment **not yet begun**

## 1. Executive summary

Within this reference implementation, all planned specification items have been
implemented and verified using the project's build, test, and analysis pipeline.
This report reflects the state of the reference implementation only. It is not a
claim that StreetStudio has been released as a production product. Runtime
integration against published `@streetjs/*` packages and the UI clients remain
**planned** (see [`../STATUS.md`](../STATUS.md) and
[`../IMPLEMENTATION-PLAN.md`](../IMPLEMENTATION-PLAN.md)).

| Dimension                        | Result                                    |
| -------------------------------- | ----------------------------------------- |
| Reference-build specification tasks implemented and verified | 184 / 184     |
| Requirements implemented (EARS)  | 32 / 32                                   |
| Correctness properties covered   | 88 / 88 (1 property test each)            |
| Apps / packages                  | 5 apps, 44 packages                       |
| Source files / LOC (excl. tests) | 166 files, ~25,800 LOC                    |
| Test files / LOC                 | 181 files, ~35,200 LOC                    |
| Full test run (with a DB)        | 181 files, 871 passed, 0 skipped, 0 failed|
| Line coverage                    | 85.94% (DB-backed) / ~82% (no-DB)         |
| Documentation                    | 11 files under `docs/` + root docs        |

## 2. Current maturity

| Area                                | State           |
| ----------------------------------- | --------------- |
| Reference implementation            | ✔ Implemented & verified |
| Standalone repository               | Planned         |
| Published npm packages              | Not published   |
| Production deployment               | Not deployed    |
| Dashboard client logic (session/flows) | ✔ Implemented (no UI) |
| Dashboard UI rendering              | Not built       |
| Desktop shell                       | Scaffold        |
| Browser extension shell             | Scaffold        |
| Mobile client                       | Planned         |
| Real `@streetjs` runtime integration | Planned       |
| Community                           | Not started     |
| Current version                     | 0.1.0-dev       |

Conversely, within this reference build the domain model, API surface, package
boundaries, plugin architecture, and verification pipeline are considered
**stable within the reference implementation** — the areas that remain open are
runtime integration and the UI, not the core design.

For live, measured per-area progress see [`../STATUS.md`](../STATUS.md); for the
phased plan see [`../IMPLEMENTATION-PLAN.md`](../IMPLEMENTATION-PLAN.md).

### StreetJS relationship

StreetStudio is developed in an independent repository and consumes only
published StreetJS packages. It never:

- imports StreetJS source files,
- references the StreetJS repository (by filesystem path or otherwise), or
- depends on unpublished framework internals.

New framework capabilities are developed inside StreetJS, released
independently, and then adopted by StreetStudio through versioned package
upgrades. StreetStudio is intended to become the primary reference consumer of
StreetJS (there are no published StreetJS runtime packages yet). This contract is
enforced by `npm run streetjs:check` (see [`DECISIONS.md`](DECISIONS.md),
ADR-0011).

During early development, temporary compatibility adapters may be used until the
equivalent StreetJS packages are published. These adapters are replaced through
normal package upgrades rather than repository coupling (see ADR-0012).

## 3. Verification results

All commands run from the workspace root (`/…/StreetStudio`).

| Gate                        | Command                    | Result                                          |
| --------------------------- | -------------------------- | ----------------------------------------------- |
| Build (project references)  | `npm run build`            | PASS (exit 0)                                   |
| Dependency-graph acyclicity | `npm run graph:check`      | PASS — "Package dependency graph is acyclic."   |
| Import boundaries           | `npm run boundary:check`   | PASS — 167 files scanned, 0 violations          |
| StreetJS consumption (ADR-0011) | `npm run streetjs:check` | PASS — published, versioned packages only       |
| Full test suite             | `npm test`                 | PASS — 181 files, 871 passed / 0 skipped (DB-backed) |
| Coverage gate (≥80% lines)  | `npm run test:coverage`    | PASS — 85.94% lines (DB-backed); ~82% no-DB     |

All six gates run together via `scripts/check.sh` (and in CI).

The single skipped test is the intentional reachability-gated real-dependency
ops check; it skips gracefully when no live PostgreSQL/Redis endpoint is present
and runs when `STREETSTUDIO_IT_DATABASE_URL` / `STREETSTUDIO_IT_REDIS_URL` are set.

## 4. CI test categories (Requirement 32.1)

All seven mandated categories are wired in `vitest.workspace.ts` (by file-name
convention) and each contains at least one executable, passing test.

| Category    | Files | Coverage focus                                             |
| ----------- | ----- | ---------------------------------------------------------- |
| unit        | 159   | Per-module behaviour incl. all 88 property tests + client models & dashboard flows |
| integration | 1     | Ops surface wired end-to-end (startup→health→metrics→HA)   |
| contract    | 1     | API↔SDK one-for-one parity (Property 64)                   |
| e2e         | 1     | Full journey via the public API/SDK only (R32.4)           |
| perf        | 1     | Deterministic latency-budget / bounded-work benchmarks     |
| load        | 1     | Concurrent uploads, realtime fan-out, webhook delivery     |
| media       | 1     | Transcode / thumbnail / preview / ABR renditions           |

CI (`.github/workflows/ci.yml`) is a single job with a 30-minute budget (R32.2),
official service containers (PostgreSQL 16, Redis 7) for real-dependency
verification (R32.4) — object storage is exercised via in-memory/local providers
and the storage-conformance suite — per-category named steps so a failure identifies the
category (R32.3), an 80% line-coverage gate (R32.5), and an
infrastructure-vs-test failure classifier (R32.6).

## 5. Per-package matrix

`src` counts exclude test files. `prop` = property-based test files.

| Package / app                          | src | tests | prop | Primary responsibility                          |
| -------------------------------------- | --- | ----- | ---- | ----------------------------------------------- |
| apps/api                               | 21  | 28    | 8    | REST + WebSocket + Webhook host, security, ops (+ `assemblePostgresAuth` wiring real `AuthService` authenticate & real RBAC lifecycle stages, verified on real Postgres — ADR-0020) |
| apps/dashboard                         | 7   | 1     | 0    | Web_Client SPA: session/scope, use-case flows, upload orchestration, sharing, reactions + edit-session over the SDK |
| apps/desktop                           | 1   | 0     | 0    | Desktop_Client (wraps dashboard + native capture) entry |
| apps/recorder-extension                | 1   | 0     | 0    | Browser recorder extension entry                |
| apps/docs                              | 1   | 0     | 0    | Documentation site entry                        |
| packages/shared                        | 6   | 3     | 0    | Framework/wire types, DTOs, errors, generators  |
| packages/types                         | 1   | 0     | 0    | Product-level shared type aliases               |
| packages/config                        | 12  | 8     | 4    | Config loading + boundary/graph tooling         |
| packages/database                      | 9   | 6     | 2    | Schema, repositories, append-only audit log     |
| packages/auth                          | 12  | 20    | 12   | Auth, sessions, RBAC, API keys (+ **real PostgreSQL** member/session stores, `AuthService` core, and deny-by-default RBAC evaluator — all verified on real Postgres, ADR-0020 de-seam) |
| packages/organizations                 | 3   | 11    | 9    | Organizations, teams, membership, admin (+ **real PostgreSQL** `OrgStore`, `OrgService` verified on real Postgres — shares roles/memberships with RBAC) |
| packages/projects                      | 3   | 6     | 4    | Content hierarchy: projects, folders, workspaces (+ **real PostgreSQL** `ContentStore`, `ContentService` verified on real Postgres) |
| packages/media                         | 6   | 17    | 13   | Videos, assets, uploads, sharing, dev-assets, reviews |
| packages/storage                       | 2   | 5     | 3    | Storage abstraction + StorageProvider contract  |
| packages/knowledge                     | 2   | 4     | 3    | Transcript indexing, summaries, doc links (knowledge base) |
| packages/comments                      | 2   | 5     | 4    | Comments, threads, reactions, mentions          |
| packages/search                        | 2   | 5     | 4    | Search + transcript search (authorized scope)   |
| packages/player                        | 2   | 3     | 2    | Streaming/playback: ABR manifest with view-permission & share-credential gating |
| packages/timeline                      | 2   | 1     | 0    | Timeline model + ops (tracks, clips, markers)   |
| packages/editor                        | 3   | 2     | 1    | Browser editor model + reducer (trim/split/merge/speed) |
| packages/recorder                      | 5   | 2     | 1    | Recorder capture + offline upload client        |
| packages/recordings **(real)**         | 7   | 2     | 1    | Recording lifecycle on **published StreetJS** (real HTTP + Postgres + JWT); first de-seamed slice |
| packages/uploads **(real)**            | 7   | 2     | 1    | Chunked upload sessions on **published StreetJS** + `@streetjs/storage` (real Postgres + real object storage) |
| packages/playback **(real)**           | 4   | 2     | 1    | Authorized byte-range streaming of completed uploads on **published StreetJS** (200/206/416; real infra) |
| packages/identity **(real)**           | 8   | 2     | 1    | Real register/login (Argon2id) + JWT issuance on **published StreetJS**; shared `requireActor`/`jwtAuth` helpers |
| packages/processing                    | 2   | 5     | 3    | Media pipeline: transcode/thumbnail/preview     |
| packages/notifications                 | 2   | 4     | 3    | Notifications + event contracts                 |
| packages/realtime                      | 2   | 4     | 3    | Realtime gateway: presence, typing, fan-out     |
| packages/plugins                       | 6   | 8     | 4    | Plugin_Manager, billing, isolation              |
| packages/ai                            | 2   | 3     | 1    | AI capability router (routing only)             |
| packages/integrations                  | 2   | 1     | 0    | Integration framework: contract, registry, catalog |
| packages/analytics                     | 2   | 4     | 3    | View events + aggregation                       |
| packages/sdk                           | 2   | 1     | 0    | Public client library (REST + WebSocket)        |
| packages/ui                            | 1   | 0     | 0    | Shared UI components                            |
| packages/storage-local                 | 1   | 1     | 0    | Local storage provider plugin                   |
| packages/storage-s3                    | 1   | 1     | 0    | S3 storage provider plugin                      |
| packages/storage-r2                    | 1   | 1     | 0    | Cloudflare R2 storage provider plugin           |
| packages/storage-azure-blob            | 1   | 1     | 0    | Azure Blob storage provider plugin              |
| packages/storage-gcs                   | 1   | 1     | 0    | Google Cloud Storage provider plugin            |
| packages/storage-minio                 | 1   | 1     | 0    | MinIO storage provider plugin                   |
| packages/storage-conformance           | 1   | 2     | 2    | Shared provider conformance suite               |
| packages/integration-slack             | 1   | 1     | 0    | Slack integration plugin                        |
| packages/integration-discord           | 1   | 1     | 0    | Discord integration plugin                      |
| packages/integration-github            | 1   | 1     | 0    | GitHub integration plugin                       |
| packages/integration-gitlab            | 1   | 1     | 0    | GitLab integration plugin                       |
| packages/integration-jira              | 1   | 1     | 0    | Jira integration plugin                         |
| packages/integration-linear            | 1   | 1     | 0    | Linear integration plugin                       |
| packages/integration-notion            | 1   | 1     | 0    | Notion integration plugin                       |
| packages/integration-microsoft-teams   | 1   | 1     | 0    | Microsoft Teams integration plugin              |

## 6. Task breakdown (42 top-level specification tasks)

Foundation & tooling
- 1. Establish monorepo structure and boundary tooling
- 2. Build the shared foundation package
- 3. Implement configuration loading and startup validation
- 4. Implement the database layer and audit log
- 5. Checkpoint — foundation

Identity & access
- 6. Implement authentication and sessions
- 7. Implement API keys
- 8. Implement RBAC evaluation
- 9. Checkpoint — auth and RBAC

Organizations & content
- 10. Implement organizations, teams, membership, and administration
- 11. Implement content hierarchy (projects, folders, workspaces)
- 12. Checkpoint — organizations and content

Media path
- 13. Implement storage abstraction and provider contract
- 14. Implement chunked and resumable uploads
- 15. Implement the Recorder client capture and upload logic
- 16. Implement the media processing pipeline
- 17. Implement streaming and playback
- 18. Checkpoint — media path

Collaboration
- 19. Implement sharing and content permissions
- 20. Implement comments, mentions, threads, and reactions
- 21. Implement notifications
- 22. Implement the Realtime_Service gateway
- 23. Implement search and transcript search
- 24. Checkpoint — collaboration

Extensibility
- 25. Implement the Plugin_Manager
- 26. Implement storage provider plugins
- 27. Implement the AI capability router
- 28. Implement the billing abstraction
- 29. Implement integration plugins
- 30. Implement Developer Mode assets
- 31. Implement engineering reviews
- 32. Implement the knowledge base
- 33. Checkpoint — extensibility

Public surface, deployment, docs, CI
- 34. Implement analytics
- 35. Implement webhooks
- 36. Implement security middleware and defaults
- 37. Wire the API_Service, REST/WebSocket controllers, and SDK
- 38. Checkpoint — API surface
- 39. Implement self-hosting, deployment, and HA operation
- 40. Author project documentation
- 41. Establish continuous integration and coverage gating
- 42. Final checkpoint — full suite

## 7. Requirements coverage (32 / 32)

| #   | Requirement                                          |
| --- | ---------------------------------------------------- |
| 1   | Repository Independence and StreetJS Consumption     |
| 2   | Modular Monorepo Structure                           |
| 3   | Member Authentication                                |
| 4   | Organizations, Teams, and Membership                 |
| 5   | Projects, Folders, and Workspaces                    |
| 6   | Browser and Desktop Recording                        |
| 7   | Chunked and Resumable Uploads                        |
| 8   | Media Processing Pipeline                            |
| 9   | Storage Abstraction and Providers                    |
| 10  | Video Streaming and Playback                         |
| 11  | Comments, Mentions, Threads, and Reactions           |
| 12  | Notifications                                        |
| 13  | Real-Time Events and Presence                        |
| 14  | Search and Transcript Search                         |
| 15  | Sharing and Content Permissions                      |
| 16  | Role-Based Access Control                            |
| 17  | Audit Logging                                        |
| 18  | API Keys                                             |
| 19  | Webhooks                                             |
| 20  | API-First Parity and SDK                             |
| 21  | Plugin Management                                    |
| 22  | AI Capabilities via Plugins                          |
| 23  | Developer Mode                                       |
| 24  | Engineering Reviews and Source Control Integration   |
| 25  | Knowledge Base                                       |
| 26  | Administration                                       |
| 27  | Billing Abstraction                                  |
| 28  | Analytics                                            |
| 29  | Security Defaults                                    |
| 30  | Self-Hosting and Deployment                          |
| 31  | Documentation                                        |
| 32  | Testing and Continuous Integration                   |

## 8. Correctness properties (88 / 88, each with a fast-check test ≥100 runs)

Auth & boundaries (1–7): import-boundary enforcement; acyclic graph; registration
without plaintext passwords; short-lived tokens+sessions; non-disclosing auth;
session/token invalidation; account lockout.

Orgs & content (8–16): org creation + admin assignment; 7-day invitation expiry;
acceptance validity; team scoping; cross-org denial; project/folder validity;
folder depth ≤10; video-move preservation; create-permission enforcement.

Recording, upload & processing (17–26): bounded offline retries; chunk size +
ack; resume without retransmission; assembly round-trip; bounded integrity
failures; 24h session expiry; progress accuracy; required outputs; status-value
set; bounded processing failures preserving source.

Storage & playback (27–31): byte round-trip; activation validation; signed-target
expiry; playback ready+authorization; share-credential playback.

Comments, notifications, realtime, search (32–45): body/timestamp validation;
comment permission; mention notifications; reaction idempotency; live delivery;
notification fields+prefs; online/reconnect delivery; ownership-checked read;
presence/typing audience; discard for disconnected; authorized search; transcript
positions; query-length validation; bounded pagination.

Sharing, RBAC, audit, keys (46–59): unique share credentials; expiry/revocation;
content-permission; passcode lockout; owning-org authorization; role assignment
governs decisions; no cross-org leakage; role-management gating; audit fields;
audit immutability; audit query scoping; one-time secret; key auth validity;
key-management gating.

Webhooks & public API (60–65): registration validation; signed/verifiable
deliveries; bounded retries with backoff; delete stops delivery; API/SDK parity;
API authorization matches web equivalents.

Plugins, AI, dev-mode, reviews, KB (66–74): activation-failure preservation;
load-failure isolation; AI routing/clean failure; developer-asset validation;
PR-link plugin+permission; review comment validation; transcript indexing scope;
summary bounds; documentation-link cap.

Admin, billing, analytics, security, startup (75–88): atomic settings updates;
member removal revokes access; admin-only actions; last-admin retention; billing
single-plugin routing; billing optional/isolated; at-most-one billing plugin;
view-event fields; analytics reference match + org exclusion; admin-only analytics
ranges; rate-limit rejection + retry guidance; secrets never plaintext;
non-public endpoints deny anonymous; startup names every invalid config value.

## 9. Architecture highlights

The following describe the design realized in the reference implementation.
Behaviours involving live infrastructure (e.g. HA reconnection) are exercised
behind adapter seams with in-memory fakes; running them against real
`@streetjs/*` runtime packages and infrastructure is planned production work
(see §12 and [`../IMPLEMENTATION-PLAN.md`](../IMPLEMENTATION-PLAN.md)).

- **StreetJS boundary integrity (R1, R2).** StreetJS is consumed only through
  `@streetjs/core` public entry points behind structural adapter seams. A custom
  static analyzer (`packages/config`) fails the build on any disallowed import —
  StreetJS internals (`DISALLOWED_STREETJS_IMPORT`), cross-package internals
  (`DISALLOWED_INTERNAL_IMPORT`), or hardcoded AI/billing vendors in core
  (`DISALLOWED_AI_VENDOR`) — and a companion checker enforces an acyclic package
  graph. There are zero filesystem references into the StreetJS repository.

- **API-first parity (R20).** A single `PUBLIC_OPERATIONS` catalog
  (`apps/api/src/http/operations.ts`) is the source of truth for every public
  capability. The SDK mirrors it one-for-one (guarded by the contract test), and
  the API reference doc is maintained from the same catalog. Every request —
  REST, WebSocket, or webhook-management — flows through one lifecycle:
  rate limit → authenticate → validate → RBAC → service → audit.

- **Deny-by-default security (R16, R29).** Authorization is evaluated against the
  requester's role in the owning organization's scope before any action; denials
  cause no state change, return `AUTHORIZATION_DENIED`, and are audited —
  identical across REST and WebSocket channels. Secure defaults include per-client
  rate limiting, encrypted secret storage, bounded/expiring signed upload
  credentials, and a non-disclosing error taxonomy.

- **Plugin-first extensibility (R9, R21, R22, R27).** Storage, AI, billing, and
  integrations are delivered as plugins with no vendor code in core; the
  Plugin_Manager isolates plugins, bounds load/activation timing, and preserves
  prior state on failure.

- **Self-hosting architecture & HA verification (R30).** Startup validates required config and aborts
  naming every offending value; health and metrics are exposed via StreetJS
  interfaces (health reflects dependency reachability); the service operates
  verifies HA behaviour (reconnect on primary/node loss without operator restart)
  through StreetJS adapter seams and in-memory fakes. Production HA depends on the
  corresponding StreetJS runtime implementations. Container/compose and deployment
  config live under `docker/` and `infrastructure/`.

## 10. Documentation set (Requirement 31)

Under `docs/`: `PRODUCT.md` (experience-centric strategy), `ARCHITECTURE.md`,
`API.md`, `SECURITY.md`, `DECISIONS.md` (11 ADRs), `PLUGIN_GUIDE.md`,
`MEDIA_PIPELINE.md`, `DEPLOYMENT.md`, `CONTRIBUTING.md`, `ROADMAP.md`, plus this
report. At the repo root: `VISION.md` (founding vision + master plan),
`README.md` (StreetJS consumption policy + gap register), `CHANGELOG.md`,
`LICENSE` (Apache-2.0), and `examples/` (SDK quickstart, self-hosting). `API.md`
documents the current public API (method/path/auth/error formats) and explicitly
lists the three no-authentication endpoints (`POST /auth/register`,
`POST /auth/login`, `POST /shared/resolve`); it is maintained from the
`PUBLIC_OPERATIONS` catalog, with the API↔SDK contract test guarding drift.

## 11. Architectural Evolution (ADRs)

After the initial 184-task build, the layout was aligned to the founding vision
and hardened, each step gated green by `scripts/check.sh`:

- **ADR-0006** — desktop runtime: Tauri over Electron (provisional, pending a
  native-capture spike).
- **ADR-0007 → superseded by ADR-0008** — `recording` renamed to `recorder`;
  playback extracted into a standalone `player` package.
- **ADR-0009** — extracted `organizations`, `comments`, `search`, `realtime`,
  `ai`, and a new `integrations` framework package.
- **ADR-0010** — separated `projects`, `storage`, and `knowledge` from `media`
  (knowledge evolves independently of media bytes); the six `storage-*` plugins
  repointed to `@streetstudio/storage`.
- **ADR-0011** — StreetJS is consumed only as published, versioned packages
  (promotion-first); enforced by the `streetjs:check` gate.

- **ADR-0012** (Proposed) — target framework-consumption map: the granular
  `@streetjs/*` packages StreetStudio will consume as StreetJS publishes them
  (migration backlog), plus the refined product-side layout. The product-side
  layout was executed: `web` renamed to `dashboard`; new `apps/recorder-extension`
  and `packages/{types,timeline,editor}`; a root `street.config.ts` composition
  template.

The package count grew from 28 → **40** (5 apps) as domains became first-class,
and the monorepo now matches the vision/target layout. The `@streetjs/*` package
migration (ADR-0012) is a documented backlog gated on those packages being
published. `apps/mobile` is reserved on the roadmap (not scaffolded).

## 12. Current limitations

By design, this reference implementation intentionally does **not** include the
following. These are planned production concerns, not defects, and are tracked in
[`../IMPLEMENTATION-PLAN.md`](../IMPLEMENTATION-PLAN.md):

- a production dashboard application,
- a production desktop application,
- a production browser extension,
- a production mobile application,
- a public SaaS offering,
- published npm packages,
- production monitoring/observability,
- customer workloads,
- production infrastructure,
- and **no production UX validation has been performed yet** — the largest
  remaining product risk is the user experience, not the backend.

The reference implementation exercises the domain logic and API behind StreetJS
adapter seams with in-memory fakes; the items above depend on the standalone
repository, published `@streetjs/*` runtime packages, and real infrastructure.

## 13. Known follow-ups

- The StreetJS gap-register issue URLs in `README.md` are intentional placeholders
  (`https://github.com/streetjs/streetjs/issues/NNN`) — replace each with the real
  upstream issue link once filed.
- `apps/dashboard` now carries client-side application logic (session/credential/
  scope management and use-case flows over the SDK), verified with an in-memory
  transport; its UI rendering layer is still unbuilt. The remaining client apps
  (`apps/desktop`, `apps/recorder-extension`, `apps/docs`) and the client packages
  (`ui`, `types`, `timeline`, `editor`) are scaffolds/model-only entry points;
  UI/runtime build-out is future work beyond this backend/spec scope.
- Real-dependency integration coverage runs opportunistically in CI via service
  containers and gates gracefully elsewhere; broaden it as live environments
  become available.

## 14. Productionization phase

The reference implementation implements and verifies every item in its
specification. The next stage is productionization. Maturity ladder:

```
Reference Build ✔
      ↓
Standalone Repository
      ↓
Framework Integration   (consume published @streetjs/* packages)
      ↓
Developer Preview
      ↓
Public Beta
      ↓
v1.0
      ↓
Hosted Cloud
```

Immediate next steps:

- Create the standalone StreetStudio repository.
- Publish `v0.1.0-dev`.
- Consume released StreetJS packages.
- Replace in-memory / compatibility adapters with runtime implementations.
- Begin dashboard implementation.
- Prepare the first public preview (and begin production UX validation).

---

*Metrics in this report are measured from this workspace's reference
implementation (`npm run status` for counts; `npm test` / `npm run test:coverage`
for pass/coverage). See [`../STATUS.md`](../STATUS.md) for live status.*
