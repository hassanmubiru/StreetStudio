# StreetStudio — Status

- **Repository state:** **Active — runnable API server; full operation catalog
  served on real infrastructure.** A composition root + HTTP/WebSocket transport
  now exist in `apps/api/src/runtime/`: the API server boots (env → config →
  PostgreSQL migrations → dependency activation → listen), and **all 43 catalog
  operations (42 REST + 1 WebSocket) that have a backing domain method are wired
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
  See [`RC1-VERIFICATION-REPORT.md`](RC1-VERIFICATION-REPORT.md) (updates 3–15)
  for the full, evidence-backed verification.
  UI/native client runtimes are still not built here.
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
Media pipeline (real ffmpeg)     █████████░  95%  upload→duration-probe→transcode(thumb/preview/ABR)→storage→playback(Range); distributed worker pending
Auth / RBAC / tenant isolation   ██████████ 100%  register/login/JWT, wildcard-admin RBAC, deny-by-default, cross-tenant 403s verified
Realtime (WebSocket)             █████████░  90%  authenticated /realtime channel + notification & processing-status fan-out; distributed worker pending
SDK (typed client)               ████████░░  80%   not yet run against a live server
Client models (editor/timeline)  ██████░░░░  60%   model + reducer/ops implemented & tested; no UI
Dashboard client logic           ██████░░░░  65%   session/scope, workspace/video/search/notification flows, uploads, sharing, reactions, edit-session; no UI
Dashboard (web UI runtime)       ░░░░░░░░░░   0%   not built
Desktop client                   ░░░░░░░░░░   0%   scaffold entry only
Recorder extension               ░░░░░░░░░░   0%   scaffold entry only
De-seam remaining pkgs → StreetJS ████████░░  85%   composition wires domain services to canonical Postgres repositories on ONE schema; unused in-memory/plural-DDL seams retirement pending (ADR-0020)
Published repo + npm releases    ░░░░░░░░░░   0%   not released
```

## Runnable API server (composition root)

`apps/api/src/runtime/` — boots and serves the full catalog on real infra
(verified in [`RC1-VERIFICATION-REPORT.md`](RC1-VERIFICATION-REPORT.md)):

- **Wired operations (43):** auth ×4, organizations ×2, projects ×5, folders ×4,
  videos ×4, comments ×5, sharing ×4, apiKeys ×3, webhooks ×3, notifications ×2,
  analytics.metrics, uploads ×4, playback.manifest, realtime.connect — plus
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
  and **real ffmpeg**, behind an HTTP + WebSocket transport. All 43 catalog
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
- **Remaining runtime gaps (deferred, documented):** `videos.transcript/summary`
  (captions/AI), and a distributed worker draining the processing queue
  (currently in-process). The unused in-memory fakes and the parallel plural-DDL
  `ensure*Schema` seams are pending retirement now that the composition uses the
  canonical schema (ADR-0020).
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
