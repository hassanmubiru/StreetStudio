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
Recordings (real, on StreetJS)   ██░░░░░░░░  20%   1st real slice: domain+persistence+HTTP on real streetjs+Postgres
SDK (typed client)               ████████░░  80%   not yet run against a live server
Client models (editor/timeline)  ██████░░░░  60%   model + reducer/ops implemented & tested; no UI
Dashboard client logic           ██████░░░░  65%   session/scope, workspace/video/search/notification flows, uploads, sharing, reactions, edit-session; no UI
Dashboard (web UI runtime)       ░░░░░░░░░░   0%   not built
Desktop client                   ░░░░░░░░░░   0%   scaffold entry only
Recorder extension               ░░░░░░░░░░   0%   scaffold entry only
De-seam remaining pkgs → StreetJS █░░░░░░░░░  10%   recordings done; others pending per-slice adoption
Published repo + npm releases    ░░░░░░░░░░   0%   not released
```

## Measured metrics (this workspace)

Static counts from `npm run status`; gate results from `scripts/check.sh`.

| Metric              | Value  |
| ------------------- | ------ |
| Apps                | 5      |
| Packages            | 41     |
| Source files        | 140    |
| Source LOC          | 23,804 |
| Test files          | 167    |
| Property-test files | 89     |
| Test LOC            | 33,754 |
| Tests               | 810 passing, 5 skipped |
| Line coverage       | 83.95% |
| build / graph / boundary / streetjs gates | passing |

*Regenerate the counts with `npm run status`; regenerate pass/coverage with
`npm test` and `npm run test:coverage`. Do not hand-edit measured values.*

## What "80%" means here (honest caveats)

- **`@streetstudio/recordings` is real** — it runs on the published `streetjs`
  (HTTP/DI + native PostgreSQL driver) against a **real Postgres**, proven by an
  integration test (repository round-trips + a full create→publish→archive HTTP
  journey). Coverage of its persistence/API files depends on that integration
  test, which runs when `STREETSTUDIO_IT_DATABASE_URL` is set (CI Postgres
  service) and skips otherwise — hence the small drop in global line coverage.
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
- **`@streetjs/*` integration** cannot progress until those packages are
  published (promotion-first, ADR-0011/0012); today only `@streetjs/core` is
  referenced, through seams.

## Next

See [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md) for the phased plan.
