# Contributing to StreetStudio

Thanks for your interest in contributing. The detailed contributor guide lives
at **[`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)**; this root file is the
quick start.

## Prerequisites

- Node.js >= 20
- npm (workspaces)

## Setup

```bash
npm install       # install workspaces + dev tooling
npm run build     # tsc -b across all project references
npm test          # vitest run (property tests use fast-check, >=100 iterations)
```

## Before you open a PR

Run the full local gate (mirrors CI):

```bash
scripts/check.sh
```

or individually:

```bash
npm run build
npm run graph:check      # dependency graph must stay acyclic
npm run boundary:check   # no disallowed StreetJS-internal / cross-package / vendor imports
npm test
```

## Core rules

- **Never modify StreetJS.** Consume it only through public package entry
  points. If a capability is missing, add an adapter inside a StreetStudio
  package and record the gap in the [`README.md`](README.md) StreetJS gap
  register with an external issue reference.
- **Respect package boundaries.** Cross-package imports must target declared
  entry points only; the graph must remain acyclic. Both are enforced by
  `boundary:check` and `graph:check`.
- **Keep the surface honest.** New public API endpoints go in the
  `PUBLIC_OPERATIONS` catalog (`apps/api/src/http/operations.ts`), flow to the
  SDK, and are covered by the parity contract test and documented in
  [`docs/API.md`](docs/API.md).
- **Test everything.** New features and bug fixes need tests; property-based
  tests use `fast-check` (min 100 iterations, tagged
  `Feature: streetstudio, Property N`).
- **Record decisions.** Significant choices get an ADR in
  [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Commit & PR

- Keep PR titles concise (< 70 chars); use the description for details, what was
  tested, and any follow-ups.
- Update [`CHANGELOG.md`](CHANGELOG.md) under "Unreleased" for user-facing changes.
