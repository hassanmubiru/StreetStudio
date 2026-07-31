# StreetStudio — Status

- **Repository state:** **Active — runnable API server; full operation catalog
  served on real infrastructure.** A composition root + HTTP/WebSocket transport
  now exist in `apps/api/src/runtime/`: the API server boots (env → config →
  PostgreSQL migrations → dependency activation → listen), and **all 45 catalog
  operations (44 REST + 1 WebSocket) that have a backing domain method are wired
  and verified end-to-end** against **real PostgreSQL, real MinIO object storage,
  and real ffmpeg**, through the full request lifecycle (rate-limit →
  authenticate → validate → RBAC → service → audit) with deny-by-default RBAC and
  cross-tenant isolation. The media pipeline (chunked upload → assemble → ffmpeg
  transcode: thumbnail + preview + ABR renditions → object storage → playback
  with HTTP Range) runs on real infrastructure. Because the granular
  `@streetjs/*` framework packages (postgres/redis/websocket/media) are not
  published yet (only `@streetjs/storage`), the composition root adapts standard
  drivers (`pg`, `ws`, `ffmpeg-static`) through the existing structural seams —
  a deliberate, reversible decision documented in `apps/api/src/runtime/main.ts`.
  See [`RC1-VERIFICATION-REPORT.md`](RC1-VERIFICATION-REPORT.md) (updates 3–18)
  for the full, evidence-backed verification.
  The web SPA now production-builds (Vite, es2022 target) and is served by a
  zero-dependency static host (`apps/web/server.mjs`, with the Docker `web`
  target corrected); it is not yet browser/e2e-verified against a live server.
  Desktop/recorder native client runtimes are still not built here.
  See [`RC1-VERIFICATION-REPORT.md`](RC1-VERIFICATION-REPORT.md) (updates 3–19)
  for the full, evidence-backed verification.
- **Version:** 0.1.0-dev
- **Architecture:** Approved
- **Product design:** Approved
- **Kind of build:** Transitioning from a spec-driven **reference build** (domain
  logic + API behind in-memory StreetJS seams) to **real product code on the
  published framework**, slice by slice (ADR-0017). Not a published release.

> **Scope & provenance.** The figures below are *measured* from this workspace —
> static counts via `npm run status`, and pass/coverage via `npm test` /
> `npm run test:coverage`. StreetJS itself **is published** (`streetjs`,
> `@streetjs/*`); this repo is the StreetStudio product repo (ADR-0018). What does
> not exist yet: shipping UI/native clients and a public release.

## Overall progress

```
Architecture & ADRs              ██████████ 100%
Product design                   ██████████ 100%
Spec (requirements/design/tasks) ██████████ 100%
Documentation                    ████████░░  80%
Backend domain + API (ref build) ██████████ 100%  domain logic implemented & tested (5315 tests passing)
Runnable API server (composition)█████████░  90%  env→config→migrations→listen; HTTP+WS transport; real pg/MinIO/ffmpeg
Operation catalog wired (REST+WS)██████████ 100%  45/45 ops with a backing method, verified end-to-end on real infra
Media pipeline (real ffmpeg)     ██████████ 100%  upload→duration-probe→transcode(thumb/preview/ABR)→storage→stream renditions(Range); in-process + distributed worker (SKIP LOCKED)
Auth / RBAC / tenant isolation   ██████████ 100%  register/login/JWT, wildcard-admin RBAC, deny-by-default, cross-tenant 403s verified
Realtime (WebSocket)             ██████████ 100%  authenticated /realtime channel + notification & processing-status fan-out; cross-process bus (Redis pub/sub) delivers worker events to clients; in-process fallback
SDK (typed client)               ████████░░  80%   not yet run against a live server
Client models (editor/timeline)  ██████░░░░  60%   model + reducer/ops implemented & tested; no UI
Dashboard client logic           ██████░░░░  65%   session/scope, workspace/video/search/notification flows, uploads, sharing, reactions, edit-session; no UI
Dashboard (web UI runtime)       ███░░░░░░░  30%   Vite SPA now production-builds (es2022) + served by a zero-dep static host; not browser/e2e-verified against a live server
Desktop client                   ░░░░░░░░░░   0%   scaffold entry only
Recorder extension               ░░░░░░░░░░   0%   scaffold entry only
De-seam remaining pkgs → StreetJS ████████░░  85%   composition wires domain services to canonical Postgres repositories on ONE schema; unused in-memory/plural-DDL seams retirement pending (ADR-0020)
Published repo + npm releases    ░░░░░░░░░░   0%   not released
```

## Runnable API server (composition root)

`apps/api/src/runtime/` — boots and serves the full catalog on real infra
(verified in [`RC1-VERIFICATION-REPORT.md`](RC1-VERIFICATION-REPORT.md)):

- **Wired operations (45):** auth ×4, organizations ×2, projects ×5, folders ×4,
  videos ×6 (list/get/update/delete/transcript/summary), comments ×5, sharing ×4,
  apiKeys ×3, webhooks ×3, notifications ×2, analytics.metrics, uploads ×4,
  playback.manifest, realtime.connect — plus
  binary part-upload (`PUT /uploads/:id/parts/:n`) and authorized object
  streaming (`GET /objects/*`, HTTP Range 200/206/416).
- **Real infrastructure:** PostgreSQL (canonical migrated schema, one FK-integral
  family), MinIO/S3 object storage, ffmpeg (via `ffmpeg-static`) for real
  transcoding. Append-only audit log authoritative for org-scoped events.
- **Security:** every request runs the shared lifecycle; RBAC is deny-by-default
  and org-scoped; cross-tenant access returns 403; API-key/webhook/share secrets
  are never disclosed on reads.
- **Run it:** `node apps/api/dist/runtime/main.js` with `DATABASE_URL`,
  `AUTH_JWT_SECRET`, `HTTP_PORT`, `INSTANCE_ID`, and `S3_*` env (see the RC report
  for the exact command); `docker compose -f docker/docker-compose.yml up -d
  postgres minio` provides the backing services.
- **Real integration defects found & fixed while wiring** (only observable with
  the live `pg` driver / real HTTP): jsonb double-parse in the RBAC / org /
  uploads stores and the repository write path; audit-log FK / schema-duplication
  reconciliation onto the canonical schema; RBAC role-seeding (wildcard admin);
  StreetJS `HttpException`→HTTP status mapping in the transport.

## Measured metrics (this workspace)

Static counts from `npm run status`; gate results from `scripts/check.sh`.

| Metric              | Value  |
| ------------------- | ------ |
| Apps                | 5      |
| Packages            | 44     |
| Source files        | 174    |
| Source LOC          | 26,692 |
| Test files          | 189    |
| Property-test files | 89     |
| Test LOC            | 36,180 |
| Tests               | 892 passing with a DB (integration tests skip without one) |
| Line coverage       | 85.92% (DB-backed, as CI runs); ~82% no-DB local |
| build / graph / boundary / streetjs gates | passing |

*Regenerate the counts with `npm run status`; regenerate pass/coverage with
`npm test` and `npm run test:coverage`. Do not hand-edit measured values.*

## What this means here (honest caveats)

- **The API server is runnable and the whole operation catalog is served on real
  infrastructure.** A composition root (`apps/api/src/runtime/`) wires the domain
  services to the **canonical PostgreSQL repositories** (one FK-integral schema
  via `runMigrations` + `createRepositories`), a real **MinIO/S3** object store,
  and **real ffmpeg**, behind an HTTP + WebSocket transport. All 45 catalog
  operations with a backing domain method are wired and each was exercised
  end-to-end (register→login→…→create/read/update/delete, upload→transcode→
  playback, realtime handshake) — see `RC1-VERIFICATION-REPORT.md` updates 3–15
  for per-operation evidence.
- **The domain packages remain thoroughly unit/property tested** (the full suite
  is **5315 passing / 0 failing**; `build / graph / boundary / streetjs` gates
  pass). Note the *static* count table below is regenerated by `npm run status`
  and predates the composition-root work; the runtime verification lives in the
  RC report rather than in the counts.
- **Recently closed (verified end-to-end):** `folders.move` (reparent with
  subtree depth-recompute + cycle rejection), pipeline **video-duration
  extraction** (ffmpeg probe at upload-complete — unblocks timestamped comments),
  and **processing-status realtime fan-out** (a subscribed WS client receives
  `queued → processing → ready` for its org during transcode).
- **Recently closed (Update 17):** `videos.transcript` + `videos.summary` read
  endpoints are now wired on the canonical schema (org-scoped resolution, 404 for
  missing/foreign video or absent derivative, cross-tenant isolation verified) —
  **every REST + WebSocket catalog operation with backing persistence is now
  served.** The AI write side (transcription/summarization) remains a
  provider-plugin concern (`@streetstudio/ai`); no fake data is produced.
- **Recently closed (Update 21):** the **Docker images** now build and run for
  all three targets (`web` serves the SPA; `api` boots against live infra with
  `postgres:true` health + all 45 ops; `worker` builds). Fixed a real Dockerfile
  defect (the builder never copied the root `tsconfig.json`, so in-image
  `tsc -b` failed — every image was unbuildable). Installed `docker buildx`
  v0.36.0. (The daemon can't reach Docker Hub for the external `# syntax`
  frontend, so build logic was validated with BuildKit's embedded frontend +
  the cached base image; the real Dockerfile keeps its frontend pin.)
- **Recently closed (Update 20):** a **cross-process realtime bus** (Redis
  pub/sub, `apps/api/src/runtime/realtime-bus.ts`) so processing-status events
  produced by the separate media worker reach WebSocket clients on any API
  instance; verified end-to-end (a WS client received `queued → processing →
  ready`, the last two produced by a separate worker process via Redis). Falls
  back to in-process broadcast when no `REDIS_URL` is set (single-node).
- **Recently closed (Update 19):** a **distributed media-processing worker**
  (`apps/api/src/runtime/worker-main.js`, the corrected Docker `worker` target)
  that claims `queued` Videos from the canonical `video` table via
  `FOR UPDATE SKIP LOCKED` (safe competing consumers) and runs the real ffmpeg
  pipeline — gated by `PROCESSING_INLINE` (inline single-node default vs.
  enqueue-only for dedicated workers); verified end-to-end (2 uploads left
  `queued`, a worker drained both to `ready` with 3 renditions + thumbnail +
  preview each, all 5 derivatives per Video present in MinIO). Also fixed
  **PLAYBACK-OBJECT-01**: `GET /objects/*` now streams transcoded
  renditions/assets (org-scoped via the canonical `rendition`/`asset` tables;
  owner 206, foreign org 404) — previously only the source object was servable.
- **Recently closed (Update 18):** the **web SPA production build** (a real
  defect — top-level await rejected by Vite's default `es2020` target; fixed by
  pinning `es2022`) and the **Docker `web` target** (it never built the SPA and
  pointed `node apps/web/dist/index.js` at a file Vite doesn't emit; now the
  builder runs the Vite build and the target serves the bundle via a new
  zero-dependency static host `apps/web/server.mjs` — SPA fallback, traversal
  guarding, immutable asset caching, `/healthz`). Verified locally against the
  real bundle; the full `docker build` itself is blocked here by a missing
  BuildKit/`buildx` (documented environment limitation).
- **Remaining runtime gaps (all environment-blocked or a documented schema
  follow-up):** the INFRA-blocked runtime Phases 5 (perf under load) and 7 (a11y
  runtime), and browser/e2e verification of the web SPA — each needs a load or
  headless-browser harness not provisioned in this environment. Worker
  **stale-claim recovery** (reclaiming a Video left `processing` by a crashed
  worker) needs a claim-timestamp column on the `video` table — a change to the
  heavily-tested `@streetstudio/database` schema, deliberately deferred. The
  unused in-memory fakes and the parallel plural-DDL `ensure*Schema` seams are
  pending retirement now that the composition uses the canonical schema
  (ADR-0020).
- **SDK** is a complete typed client mirroring the operation catalog, but has not
  been exercised end-to-end against a live deployed server.
- **Dashboard** now has client-side application logic (session/credential/scope
  management + use-case flows over the SDK), verified with an in-memory transport;
  its UI rendering layer is still unbuilt. The other clients (`desktop`,
  `recorder-extension`) and client models (`editor`, `timeline`, `types`, `ui`)
  are scaffolds/model types — no UI runtime.
- **`@streetjs/*` integration** is now unblocked — the framework is published
  (`streetjs@1.2.7` + meta-packages). Adoption proceeds slice by slice
  (recordings first); see [`docs/FRAMEWORK_CONTRACT.md`](docs/FRAMEWORK_CONTRACT.md)
  and [`docs/PRODUCTIONIZATION.md`](docs/PRODUCTIONIZATION.md).

## Next

See [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md) for the phased plan.
