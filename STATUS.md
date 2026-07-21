# StreetStudio — Status

- **Repository state:** **Active — productionizing on published StreetJS**
  (ADR-0018/0019). The framework is published (`streetjs@1.2.7` + `@streetjs/*`),
  so real product slices are now built on it. The **first real vertical slice —
  `@streetstudio/recordings`** — runs on the real StreetJS HTTP/DI + a native
  PostgreSQL driver against a real Postgres (verified by an integration test).
  The remaining reference-build packages still run behind in-memory seams pending
  their own de-seam slices; UI/native client runtimes are still not set up here.
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
Backend domain + API (ref build) ████████░░  80%   implemented & tested behind in-memory seams
Recordings (real, on StreetJS)   ███░░░░░░░  25%   1st real slice: domain+persistence+HTTP+JWT auth on real streetjs+Postgres
Uploads (real, on StreetJS)      ███░░░░░░░  25%   2nd real slice: chunked upload sessions + real object storage (assembled bytes verified)
Playback (real, on StreetJS)     ███░░░░░░░  25%   3rd real slice: authorized byte-range streaming of completed uploads (200/206/416)
SDK (typed client)               ████████░░  80%   not yet run against a live server
Client models (editor/timeline)  ██████░░░░  60%   model + reducer/ops implemented & tested; no UI
Dashboard client logic           ██████░░░░  65%   session/scope, workspace/video/search/notification flows, uploads, sharing, reactions, edit-session; no UI
Dashboard (web UI runtime)       ░░░░░░░░░░   0%   not built
Desktop client                   ░░░░░░░░░░   0%   scaffold entry only
Recorder extension               ░░░░░░░░░░   0%   scaffold entry only
De-seam remaining pkgs → StreetJS ██░░░░░░░░  15%   recordings + uploads done on real infra; others pending per-slice adoption
Published repo + npm releases    ░░░░░░░░░░   0%   not released
```

## Measured metrics (this workspace)

Static counts from `npm run status`; gate results from `scripts/check.sh`.

| Metric              | Value  |
| ------------------- | ------ |
| Apps                | 5      |
| Packages            | 42     |
| Source files        | 147    |
| Source LOC          | 24,436 |
| Test files          | 169    |
| Property-test files | 89     |
| Test LOC            | 34,003 |
| Tests               | 818 passing, 9 skipped (no-DB); 826 passing with a DB |
| Line coverage       | 85.76% (DB-backed, as CI runs); 81.98% no-DB local |
| build / graph / boundary / streetjs gates | passing |

*Regenerate the counts with `npm run status`; regenerate pass/coverage with
`npm test` and `npm run test:coverage`. Do not hand-edit measured values.*

## What "80%" means here (honest caveats)

- **`@streetstudio/recordings` and `@streetstudio/uploads` are real** — they run
  on the published `streetjs` (HTTP/DI + native PostgreSQL driver + JWT auth) and,
  for uploads, `@streetjs/storage`, against a **real Postgres** and **real object
  storage**. Proven by integration tests: recordings does a create→publish→archive
  HTTP journey; uploads does begin→upload-parts→complete and verifies the
  assembled object's bytes in storage. Those tests run when
  `STREETSTUDIO_IT_DATABASE_URL` is set (CI Postgres service) and skip otherwise,
  so the persistence/API files are covered when a DB is present. Measured: with
  a DB (CI, or `STREETSTUDIO_IT_DATABASE_URL` set locally) line coverage is
  **85.76%**; without a DB the integration tests skip and it is **81.98%**. Both
  clear the 80% gate. `scripts/check.sh` runs the coverage gate and enables the
  integration tests automatically when the env var is set.
- **The other backend packages** are still the reference implementation running
  against **in-memory fakes behind adapter seams**; each will be de-seamed onto
  the real framework as its own slice (ADR-0017).
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
