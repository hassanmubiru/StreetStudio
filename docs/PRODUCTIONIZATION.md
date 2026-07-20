# Migration plan — reference build → standalone StreetStudio product repo

This is the ordered plan for populating the standalone repository from the
reference build and turning it into a real, deployable product. Every step is
governed by the [production charter](../docs/PRODUCTION_CHARTER.md): real
infrastructure and data only; no placeholders or fakes outside automated tests;
**never recreate StreetJS** — if a required `@streetjs/*` package is not
published, pause that feature and record the dependency.

## Legend

- ✅ **Copy as-is** — the reference-build artifact is already production-shaped.
- 🔁 **Copy, then de-seam** — bring it over, then replace the in-memory adapter
  with a published `@streetjs/*` package (or a real driver) as it becomes
  available.
- 🧱 **Blocked** — needs a dependency that does not exist yet; record it, don't
  fake it.

---

## Phase 0 — Repository bootstrap (this seed)

- [ ] Create the empty `streetstudio` repository and copy in this seed.
- [ ] `pnpm install`; confirm `pnpm build` / `pnpm test` run on the empty graph.
- [ ] Bring over `scripts/check-streetjs-consumption.mjs` and `scripts/status.mjs`
      from the reference build (referenced by `package.json`).
- [ ] Start local infra: `pnpm dev:infra` (PostgreSQL, Redis, MinIO, MailHog).
- [ ] Copy `.env.example` → `.env`; generate `SESSION_SECRET` / `JWT_SIGNING_KEY`
      with `openssl rand -base64 48`.

> **Shape as you migrate.** Reorganize code into the domain-first layout from
> [`docs/ENGINEERING_PRINCIPLES.md`](docs/ENGINEERING_PRINCIPLES.md) as it moves
> over — each domain package owning `domain/`, `application/`, `api/`,
> `persistence/`, `events/`, and tests, with a `README.md` answering the four
> questions. Deliver in complete **vertical slices** (principle 8), not empty
> packages. The phases below are the infrastructure sequence a slice depends on.

## Phase 1 — Portable domain & tooling (mostly ✅)

These are pure logic / types / tooling with no infrastructure coupling and move
with little change:

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

## Dependency register (update as you go)

Record every 🧱 blocker here with the package/service that unblocks it, so the
"stop and record" rule leaves a durable trail rather than a fake implementation.

| Blocked capability | Required dependency | Status |
| ------------------ | ------------------- | ------ |
| HTTP host / routing / middleware | `@streetjs/http`, `@streetjs/core` (published) | Not published |
| Auth & session runtime, RBAC | `@streetjs/auth` (+ RBAC) (published) | Not published |
| Realtime gateway (WS) | `@streetjs/realtime` / `@streetjs/websocket` (published) | Not published |
| Background jobs/queues | `@streetjs/jobs` (published) or a real queue | Decide / not published |
| Plugin runtime (dynamic load) | `@streetjs/plugins` (published) | Not published |
| Web dashboard UI | chosen web framework + toolchain | Not set up |
| Desktop client | Tauri toolchain | Not set up |
| Browser extension | extension build target | Not set up |
| Mobile clients | iOS/Android toolchains | Not set up |
