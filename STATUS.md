# StreetStudio — Status

- **Repository state:** **Active — client-side implementation** (ADR-0014).
  Reference build validated; now building tested client-side logic (dashboard
  flows, editor, timeline, player) here. Backend, real infrastructure, native/UI
  runtimes, and unpublished `@streetjs/*` integration remain out of scope for
  this workspace.
- **Version:** 0.1.0-dev
- **Architecture:** Approved
- **Product design:** Approved
- **Kind of build:** Spec-driven **reference build** in this workspace (domain
  logic + API assembled behind StreetJS adapter seams, exercised with in-memory
  fakes). This is **not** a published product.

> **Scope & provenance.** The figures below are *measured* from this workspace —
> static counts via `npm run status`, and pass/coverage via `npm test` /
> `npm run test:coverage`. They describe the reference build that lives here.
> The **published** StreetStudio (a separate GitHub repository, npm releases,
> real `@streetjs/*` runtime packages, and shipping UI clients) does **not exist
> yet**; see [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md) and ADR-0011/0012.

## Overall progress

```
Architecture & ADRs              ██████████ 100%
Product design                   ██████████ 100%
Spec (requirements/design/tasks) ██████████ 100%
Documentation                    ████████░░  80%
Backend domain + API (ref build) ████████░░  80%   implemented & tested behind seams
SDK (typed client)               ████████░░  80%   not yet run against a live server
Client models (editor/timeline)  ██████░░░░  60%   model + reducer/ops implemented & tested; no UI
Dashboard client logic           █████░░░░░  55%   session/scope + workspace/project/video/search/notification flows + upload orchestration; no UI
Dashboard (web UI runtime)       ░░░░░░░░░░   0%   not built
Desktop client                   ░░░░░░░░░░   0%   scaffold entry only
Recorder extension               ░░░░░░░░░░   0%   scaffold entry only
Real @streetjs/* runtime         ░░░░░░░░░░   0%   blocked on published packages (ADR-0012)
Published repo + npm releases    ░░░░░░░░░░   0%   not created
```

## Measured metrics (this workspace)

Static counts from `npm run status`; gate results from `scripts/check.sh`.

| Metric              | Value  |
| ------------------- | ------ |
| Apps                | 5      |
| Packages            | 40     |
| Source files        | 133    |
| Source LOC          | 23,271 |
| Test files          | 165    |
| Property-test files | 89     |
| Test LOC            | 33,525 |
| Tests               | 801 passing, 1 skipped |
| Line coverage       | 85.47% |
| build / graph / boundary / streetjs gates | passing |

*Regenerate the counts with `npm run status`; regenerate pass/coverage with
`npm test` and `npm run test:coverage`. Do not hand-edit measured values.*

## What "80%" means here (honest caveats)

- **Backend + API** domain logic is implemented and covered by the property/
  contract/integration suite, but it runs against **in-memory fakes behind
  adapter seams** — it is not yet wired to a real StreetJS HTTP runtime, real
  PostgreSQL/Redis/object storage, or a real AI provider.
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
