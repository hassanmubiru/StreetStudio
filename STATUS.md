# StreetStudio — Status

- **Repository state:** **Frozen reference build** (ADR-0013) — historical
  engineering reference; active product development has moved to the independent
  `streetstudio` repository. Changes here are limited to keeping it building or
  tracking StreetJS evolution.
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
Dashboard (web UI runtime)       ░░░░░░░░░░   0%   scaffold entry only
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
| Source files        | 127    |
| Source LOC          | 22,525 |
| Test files          | 164    |
| Property-test files | 88     |
| Test LOC            | 33,094 |
| Tests               | 773 passing, 1 skipped |
| Line coverage       | 84.99% |
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
- **Clients** (`dashboard`, `desktop`, `recorder-extension`) and client models
  (`editor`, `timeline`, `types`, `ui`) are scaffolds/model types — no UI runtime.
- **`@streetjs/*` integration** cannot progress until those packages are
  published (promotion-first, ADR-0011/0012); today only `@streetjs/core` is
  referenced, through seams.

## Next

See [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md) for the phased plan.
