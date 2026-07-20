# Productionization plan — StreetStudio

This repository **is** the StreetStudio product repo
(`github.com/hassanmubiru/StreetStudio`). This is the ordered plan for turning its
current state — domain logic and an API assembled behind StreetJS adapter seams
with in-memory fakes — into a real, deployable product. Every step is governed by
the [production charter](PRODUCTION_CHARTER.md): real infrastructure and data
only; no placeholders or fakes outside automated tests; **never recreate
StreetJS** — if a required `@streetjs/*` package is not published, pause that
feature and record the dependency.

## Toolchain

Current: npm workspaces + `tsc -b` + vitest, with the `build` / `graph:check` /
`boundary:check` / `streetjs:check` / coverage gates (`scripts/check.sh`). A move
to pnpm + Turborepo is an optional future step; it is **not** applied yet because
the current toolchain works and the gates pass. Do not switch toolchains as a side
effect of a feature slice.

## Legend

- ✅ **Copy as-is** — the reference-build artifact is already production-shaped.
- 🔁 **Copy, then de-seam** — bring it over, then replace the in-memory adapter
  with a published `@streetjs/*` package (or a real driver) as it becomes
  available.
- 🧱 **Blocked** — needs a dependency that does not exist yet; record it, don't
  fake it.

---

## Phase 0 — Local infrastructure

- [ ] Provision real local infra (PostgreSQL, Redis, S3-compatible storage such
      as MinIO, SMTP such as MailHog) via Docker Compose (`docker/`).
- [ ] Copy `.env.example` → `.env`; generate `SESSION_SECRET` / `JWT_SIGNING_KEY`
      with `openssl rand -base64 48`.
- [ ] Confirm the gates run green: `scripts/check.sh`.

> **Shape as you build.** Reorganize code toward the domain-first layout in
> [`ENGINEERING_PRINCIPLES.md`](ENGINEERING_PRINCIPLES.md) — each domain package
> owning `domain/`, `application/`, `api/`, `persistence/`, `events/`, and tests,
> with a `README.md` answering the four questions. Deliver complete **vertical
> slices** (principle 8), not empty packages. The phases below are the
> infrastructure sequence a slice depends on.

## Phase 1 — Portable domain & tooling (mostly ✅)

These are pure logic / types / tooling with no infrastructure coupling and are
already production-shaped:

- [ ] ✅ `packages/shared` (DTOs, error taxonomy, generators, identifiers)
- [ ] ✅ `packages/types`
- [ ] ✅ `packages/config` boundary + dependency-graph analyzers and their gates
- [ ] ✅ `packages/timeline`, `packages/editor`, `packages/player` (client models)
- [ ] ✅ `packages/sdk` (typed client; keep the injectable transport seam — the
      real transport is `fetch`/WebSocket in production, in-memory only in tests)
- [ ] ✅ Client-side dashboard logic (`session`, flows, uploads, sharing,
      reactions, editing) — SDK-only, already transport-agnostic

## Phase 2 — Persistence (🔁 → 🧱)

- [ ] 🔁 `packages/database`: replace in-memory repositories with a real
      PostgreSQL implementation.
  - [ ] Choose the migration/query layer (whatever StreetJS's data package
        exposes once published; otherwise a real driver like `pg` + a migration
        tool). **Do not** build an ORM/framework here — that belongs in StreetJS.
  - [ ] Author SQL migrations for every entity; enforce FKs and constraints.
  - [ ] Wrap multi-write operations in transactions.
  - [ ] Integration tests run against the CI `postgres` service.
- [ ] 🧱 If persistence is meant to run through a `@streetjs/*` data/ORM package
      that is unpublished → **record the dependency**, keep the repository
      interface, and pause the swap.

## Phase 3 — Runtime host: HTTP, auth, RBAC (🧱 unless published)

- [ ] 🧱 Real HTTP server, routing, middleware pipeline, session/JWT runtime,
      and RBAC enforcement currently sit behind StreetJS adapter seams. These
      require **published `@streetjs/http`, `@streetjs/auth`, `@streetjs/core`**
      (and RBAC). Until published: record the dependency; do not hand-roll the
      framework in the product repo.
- [ ] When available: mount `apps/api` on the real StreetJS HTTP runtime; wire
      Argon2id hashing, secure-cookie/JWT sessions, hashed API keys, persistent
      refresh tokens, and session invalidation against PostgreSQL/Redis.

## Phase 4 — Storage & uploads (🔁)

- [ ] 🔁 Implement real `StorageProvider`s: local FS, S3, R2, Azure Blob, GCS,
      MinIO (the reference build already defines the contract + conformance
      suite — keep the conformance tests).
- [ ] 🔁 Chunked/resumable uploads assemble actual files into object storage.
- [ ] Conformance suite runs against MinIO in CI.

## Phase 5 — Media processing (🔁)

- [ ] 🔁 Replace the reference pipeline with real **FFmpeg** invocation:
      thumbnails, previews, HLS renditions, metadata extraction; persist outputs.
- [ ] Processing queue backed by Redis (or the published StreetJS jobs package,
      if that's the intended home → otherwise 🧱 record it).
- [ ] `media`-category tests run with `ffmpeg` installed (see CI).

## Phase 6 — Realtime (🧱 unless published)

- [ ] 🧱 Live WebSocket gateway (presence, typing, notification delivery, fan-out)
      depends on **published `@streetjs/realtime` / `@streetjs/websocket`**.
      Record the dependency; keep the `RealtimeTransport` seam in the SDK.

## Phase 7 — Search, AI, plugins, integrations

- [ ] 🔁 Search indexes real persisted content + stored transcripts, authorization
      enforced (Postgres full-text or a real search engine — pick one; don't fake).
- [ ] 🔁 AI capability router sends requests to configured provider **plugins**;
      no provider code in core; no fake responses.
- [ ] 🔁 Plugin manager: dynamic load, lifecycle, isolation, config validation
      (dynamic loading may depend on the published StreetJS plugin runtime → 🧱
      record if so).
- [ ] 🔁 Integration plugins (Slack/Discord/GitHub/GitLab/Jira/Linear/Notion/
      Teams) call real provider APIs with real credentials.

## Phase 8 — Clients (🧱 — need UI/native runtimes)

- [ ] 🧱 Dashboard web UI: choose the framework, build real screens on top of the
      already-portable client logic. Needs a web app runtime/toolchain.
- [ ] 🧱 Desktop (Tauri): native capture, filesystem, updater. Needs the Tauri
      toolchain.
- [ ] 🧱 Browser extension: tab/desktop/mic capture, direct upload. Needs the
      extension build target.
- [ ] 🧱 Mobile (iOS/Android): auth, recording, uploads, playback, notifications.
      Needs native toolchains.

## Phase 9 — Deploy & observe

- [ ] Dockerfiles per app; production `docker-compose` and/or Kubernetes + Helm.
- [ ] OpenTelemetry traces + Prometheus metrics wired to real collectors.
- [ ] Backup/restore runbooks; TLS termination; reverse proxy.

---

## Dependency register (verified against npm)

The StreetJS framework is **published** (`streetjs@1.2.7` + `@streetjs/*`
meta-packages). The backend capabilities are therefore **available now** — they
are consumed from `streetjs` (subpaths) and `@streetjs/*`, not blocked. The
remaining work is integration (replace in-memory seams with the real API) and
provisioning real infra + client runtimes.

| Capability | Provided by (published) | Status |
| ---------- | ----------------------- | ------ |
| HTTP host / routing / middleware / DI | `streetjs` (`streetApp`, `@Controller`, `container`), `streetjs/http`, `streetjs/router` | Available — adopt |
| Auth, sessions, JWT, API keys, RBAC primitives | `streetjs/security`, `streetjs/session`, `streetjs` (`JwtService`, `authMiddleware`, `requireRoles`) | Available — adopt |
| PostgreSQL, pool, repositories, migrations, HA | `streetjs/pool`·`/repository`·`/migrations`·`/pg-ha`, `@streetjs/database` | Available — adopt |
| Cache (+ Redis cluster) | `streetjs/cache`, `streetjs/redis-cluster`, `@streetjs/cache` | Available — adopt |
| Realtime (WS) + SSE | `streetjs/websocket`, `streetjs/sse`, `@streetjs/realtime` | Available — adopt |
| Object storage | `@streetjs/storage` | Available — adopt |
| Media (transcode/thumbnail/HLS) | `@streetjs/media` | Available — adopt |
| Search | `@streetjs/search` | Available — adopt |
| Queue / jobs | `@streetjs/queue` | Available — adopt |
| Events | `@streetjs/events` | Available — adopt |
| Metrics / health / telemetry | `@streetjs/metrics`, `@streetjs/health`, `streetjs/telemetry` | Available — adopt |
| Integrations framework | `@streetjs/integrations` | Available — adopt |
| ORM (optional) | `@streetjs/orm` | Available — optional |
| Web dashboard UI | chosen web framework + toolchain | Not set up in this repo |
| Desktop client | Tauri toolchain | Not set up in this repo |
| Browser extension | extension build target | Not set up in this repo |
| Mobile clients | iOS/Android toolchains | Not set up in this repo |
| Real infra to run/test against | PostgreSQL, Redis, object storage, FFmpeg | Provision via `docker/` |

> Note: there is **no** `@streetjs/http` / `@streetjs/auth` / `@streetjs/rbac` /
> `@streetjs/runtime` / `@streetjs/plugins` package — those capabilities live
> inside `streetjs` (see [`FRAMEWORK_CONTRACT.md`](FRAMEWORK_CONTRACT.md)).
