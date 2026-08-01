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
  with HTTP Range) runs on real infrastructure. **Correction (ADR-0022):** the
  StreetJS framework **is** published and installed (`streetjs@1.2.7` +
  `@streetjs/{database,media,realtime,metrics,storage}`); the earlier claim that
  only `@streetjs/storage` existed was false (never verified against the
  registry). The composition root therefore hand-rolled reusable infrastructure
  (`pg`/`ws`/`ioredis`/`ffmpeg`/S3/HTTP host) the framework already owns — a
  charter violation now being retired via a **strangler-fig migration**
  (ADR-0022): slice 1 moved the DB pool onto `streetjs/pool` `PgPool`, slice 2
  the HTTP host onto `streetApp`, slice 3 object storage onto the published
  `@streetjs/storage/s3` driver (the boundary guards were refined, ADR-0023, to
  recognize published `exports` subpaths as public API), slice 4 media
  transcode onto the published `@streetjs/media` `MediaProcessor` (product no
  longer spawns ffmpeg or builds ffmpeg args; `ffmpeg-static`/`ffprobe-static`
  are injected as sanctioned binary providers), and slice 5 the media queue onto
  the published `@streetjs/queue` (Redis driver via `streetjs`'s `RedisClient`;
  Memory driver fallback), retiring the hand-rolled SKIP-LOCKED worker +
  `processing_claim` table. An `infra:ratchet` gate holds the raw-driver file
  count monotonically toward 0 (now **2** — only the `ioredis` bus and `ws` hub
  remain, targeted by slice 6).
  See [`RC1-VERIFICATION-REPORT.md`](RC1-VERIFICATION-REPORT.md) (updates 3–31)
  for the full, evidence-backed verification.
  The web SPA now production-builds (Vite, es2022 target) and is served by a
  zero-dependency static host (`apps/web/server.mjs`, with the Docker `web`
  target corrected, and the full Docker image validated to build & run — see
  update 21); it is not yet browser/e2e-verified against a live server.
  Desktop/recorder native client runtimes are still not built here.
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
Runnable API server (composition)██████████ 100%  env→config→migrations→listen; HTTP+WS; real pg/MinIO/ffmpeg; /health + /metrics (R30.4) + graceful shutdown
Operation catalog wired (REST+WS)██████████ 100%  45/45 ops with a backing method, verified end-to-end on real infra
Media pipeline (real ffmpeg)     ██████████ 100%  upload→duration-probe→transcode(thumb/preview/ABR)→storage→stream renditions(Range); in-process + distributed worker (SKIP LOCKED + crash-recovery reclaim)
Auth / RBAC / tenant isolation   ██████████ 100%  register/login/JWT, wildcard-admin RBAC, deny-by-default, cross-tenant 403s verified
Realtime (WebSocket)             ██████████ 100%  authenticated /realtime channel + notification & processing-status fan-out; cross-process bus (Redis pub/sub) delivers worker events to clients; in-process fallback
SDK (typed client)               ██████████ 100%  exercised end-to-end against the live server (24/24 ops via the typed client); fixed 2 real parity defects (list-array shape, error-envelope unwrapping)
Client models (editor/timeline)  ██████░░░░  60%   model + reducer/ops implemented & tested; no UI
Dashboard client logic           ██████░░░░  65%   session/scope, workspace/video/search/notification flows, uploads, sharing, reactions, edit-session; no UI
Dashboard (web UI runtime)       ████░░░░░░  40%   Vite SPA production-builds (es2022), served by a zero-dep static host, and browser-verified in real Chrome (renders/routes, 0 critical/serious axe a11y); Docker web image runs
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
  playback, realtime handshake) — see `RC1-VERIFICATION-REPORT.md` updates 3–21
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
- **Recently closed (Update 31):** **ADR-0022 slice 5** — the media queue moved
  onto the published **`@streetjs/queue`**; the hand-rolled `InProcessQueue` and
  the bespoke SKIP-LOCKED `MediaWorker` (+ `processing_claim` table) were
  deleted. A new `media/street-queue.ts` composes the framework `Queue` (durable
  `RedisDriver` over `streetjs`'s `RedisClient` when `REDIS_URL` is set, else the
  framework `MemoryDriver`). Postgres `video.status` stays authoritative for
  domain status; an idempotent handler bridges the queue's at-least-once
  delivery. Verified end-to-end on real Redis: **inline** (uploads.complete →
  `ready` synchronously) and **distributed** (a separate worker process drains
  the Redis queue → `ready`, cross-process). Ratchet unchanged at 2 (queue used
  raw SQL, not a flagged driver).
- **Recently closed (Update 30):** **ADR-0022 slice 4** — media transcode moved
  onto the published **`@streetjs/media`** `MediaProcessor`; the hand-rolled
  ffmpeg transcoder (raw `spawn` + product-built ffmpeg/ffprobe arg vectors) was
  rewritten to drive the framework processor over an injectable
  `NodeCommandRunner`. Product code no longer builds a single ffmpeg argument
  (evidence: recorded invocations carry the framework's `-hide_banner -v error`
  prefix); it retains only the ABR/preview/thumbnail recipe, the storage key
  layout, and get/put glue. `ffmpeg-static`/`ffprobe-static` are injected as
  sanctioned binary providers (removed from the ratchet driver set; `@aws-sdk`
  stays flagged). Verified end-to-end on real ffmpeg + MinIO + Postgres
  (upload→probe(6s)→transcode(thumb/preview/3 renditions)→ready, all ffmpeg exit
  0); ratchet 4→2.
- **Recently closed (Update 29):** **ADR-0022 slice 3** — object storage moved
  onto the published `@streetjs/storage/s3` driver; the hand-rolled `@aws-sdk`
  driver was deleted (the framework driver lazily loads the SDK the app provides
  as an optional peer). Refined the boundary guards (**ADR-0023**) to permit
  published `@streetjs/*` `exports` subpaths (still rejecting internal deep
  paths). Verified 8/8 on real MinIO (upload/transcode `put` + Range `get`);
  ratchet 5→4.
- **Recently closed (Update 28):** **ADR-0022 slice 2** — the hand-rolled
  `node:http` server was replaced by the published **`streetApp`** host via a
  bridge (product keeps only the operation-catalog dispatch + lifecycle as one
  catch-all middleware; framework owns the socket). WS `/realtime` still attaches
  to `app.server`; binary upload works because the host leaves `octet-stream`
  unconsumed; timeout raised for inline transcode. Verified 14/14 on real infra;
  ratchet 6→5.
- **Recently closed (Update 27):** **architectural correction (ADR-0022)** — a
  charter re-review found the composition root had hand-rolled infrastructure the
  **published** StreetJS framework already owns (the "not published" premise was
  false). Recorded ADR-0022, corrected the false record, added an
  `infra:ratchet` gate (raw-driver count only shrinks), and completed
  **strangler-fig slice 1**: the DB pool now runs on `streetjs/pool` `PgPool`
  (raw `pg` removed; ratchet 7→6). Verified end-to-end on real Postgres — RBAC
  jsonb round-trip, full CRUD, tenant isolation, and upload→transcode→playback
  all green on the framework pool.
- **Recently closed (Update 26):** the runnable server now exposes **`GET /metrics`**
  (R30.4) — `http_requests_total`/`http_errors_total` counters + live process
  gauges (uptime/RSS/heap), verified live; completing the operational surface
  (`/health` + `/metrics` + graceful shutdown) alongside the composition root.
- **Recently closed (Update 25):** **distributed worker crash recovery** — an
  atomic claim (`FOR UPDATE SKIP LOCKED` + a composition-layer `processing_claim`
  row in one transaction), claim release on completion, and a startup/periodic
  **stale-claim reclaim** that requeues Videos abandoned by a dead worker
  (`WORKER_CLAIM_TIMEOUT_MS`, default 5 min). Verified: a video stuck
  `processing` with a 10-min-old claim was reclaimed → processed → `ready` (3
  renditions, 0 residual claims). No change to the tested database schema.
- **Recently closed (Update 24):** the **typed `@streetstudio/sdk` client** was
  exercised end-to-end against the **live server** (24/24 operations via resource
  methods — auth, orgs, projects/folders CRUD, lists, analytics, api-keys,
  webhooks, cross-tenant denial). Fixed 2 real API/SDK parity defects: list
  endpoints now return bare arrays (SDK contract), and the SDK now unwraps the
  server's `{error}` envelope so error codes/statuses (e.g. 403
  `AUTHORIZATION_DENIED`) round-trip instead of collapsing to `VALIDATION_FAILED`.
- **Recently closed (Update 23):** **Phase 7 (runtime a11y) + browser e2e**
  executed with real headless Chrome against the production SPA — pages render &
  route, **0 critical/serious** axe violations (fixed a serious `aria-prohibited-attr`),
  and fixed 4 more real web defects (manifest 404, router-transition CSS blocked
  by CSP, Google-Fonts CSP block, dev-only projects.css 404). 2 moderate a11y
  items (landing-page skip-link targets) documented as a scoped follow-up.
- **Recently closed (Update 22):** **Phase 5 (perf under load)** executed on real
  infra — `auth.currentMember` **3534 req/s** (p95 27.5 ms) and
  `organizations.list` JOIN **2993 req/s** (p95 23.3 ms), 1350 reqs each at 50
  concurrency, 100% success through the full lifecycle. **R29.1** verified (a
  burst client got exactly 100 `200` then 30 `429`), and fixed a real gap: 429s
  now carry a `Retry-After` header (`RATELIMIT-HEADER-01`).
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
- **Remaining gaps (documented follow-ups):** 2 **moderate** landing-page a11y
  items (global skip-link targets absent on the public landing page — touches
  tested accessibility code, scoped follow-up). Every
  automated phase this environment can run — build, all Docker images, the full
  operation catalog, media lifecycle, distributed processing, cross-process
  realtime, performance under load, and runtime a11y + browser e2e — has been
  executed on real infrastructure. The unused in-memory fakes and the parallel
  plural-DDL `ensure*Schema` seams are pending retirement now that the
  composition uses the canonical schema (ADR-0020).
- **SDK** is a complete typed client mirroring the operation catalog, now
  **exercised end-to-end against the live server** (24/24 operations via the
  typed resource methods; two real parity defects fixed — see update 24).
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
