# Contributing

Thanks for your interest in StreetStudio. This guide covers the development
setup, the boundary rules you must respect, the test strategy, and the review
expectations for changes.

## Prerequisites

- Node.js **>= 20**
- npm (the repo uses npm workspaces)

## Getting started

```bash
npm install       # install workspaces + dev tooling
npm run build     # tsc -b across all project references
npm test          # vitest run (property tests use fast-check, >=100 iterations)
```

Useful scripts (from `package.json`):

| Script                    | Purpose                                                 |
| ------------------------- | ------------------------------------------------------- |
| `npm run build`           | Compile every project reference with `tsc -b`.          |
| `npm run typecheck`       | Type-check the workspace.                               |
| `npm test`                | Run the full test suite once (`vitest run`).            |
| `npm run test:watch`      | Run tests in watch mode.                                |
| `npm run boundary:check`  | Enforce the StreetJS + AI/billing import boundaries.    |
| `npm run graph:check`     | Enforce the acyclic cross-package dependency graph.     |

## Repository layout

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full monorepo structure.
`apps/*` may depend on `packages/*`; `packages/*` never depend on `apps/*`. Each
package owns a single primary domain responsibility.

## Boundary rules (must pass)

Three rules are enforced at build/CI time and **must pass** before a change is
accepted (see [ARCHITECTURE.md](./ARCHITECTURE.md) and
[DECISIONS.md](./DECISIONS.md) ADR-0001):

1. **StreetJS boundary** — import StreetJS only through public package entry
   points. Never import a StreetJS internal module or a filesystem path inside
   the StreetJS repository. Never vendor or modify StreetJS source.
2. **Package boundary** — import other packages only through their declared
   entry points (`exports["."]`), never their internal modules. Keep the
   dependency graph acyclic.
3. **AI/billing vendor boundary** — never reference a specific AI or billing
   vendor from platform core; those belong in plugins (see
   [PLUGIN_GUIDE.md](./PLUGIN_GUIDE.md)).

If StreetJS lacks a capability you need, implement it inside a StreetStudio
package and add an entry to the **StreetJS gap register** in the
[README](../README.md) with a reference to an external StreetJS issue. Do not
patch StreetJS (Requirement 1.4).

## Testing

Every change should be covered by tests. The suite spans unit, integration,
contract, end-to-end, performance, load, and media-pipeline categories.

- **Unit tests** verify specific examples and edge cases; co-locate them with
  the source using a `.test.ts` suffix.
- **Property-based tests** (fast-check, ≥ 100 iterations) verify universal
  properties. Annotate each with the requirement it validates, e.g.
  `**Validates: Requirements 7.5**`, and implement only the named property.
- Prefer real dependencies over mocks where reachable in CI.
- Aim to keep line coverage at or above 80%.

Run the relevant tests and the boundary/graph checks before opening a pull
request:

```bash
npm run build && npm test && npm run graph:check && npm run boundary:check
```

## Public API changes

The public operation catalog `apps/api/src/http/operations.ts`
(`PUBLIC_OPERATIONS`) is the source of truth for the API surface and SDK parity.
When you add, remove, or change a public endpoint, update the catalog **and**
[docs/API.md](./API.md) together (Requirement 31.4). If you change the no-auth
allow-list, update the public-endpoint section of API.md and
[SECURITY.md](./SECURITY.md) (R29.5).

## Architecture decisions

When you make an architectural decision, record it in
[docs/DECISIONS.md](./DECISIONS.md) as a new ADR with title, status, context,
decision, and consequences (Requirement 31.2). Do not rewrite existing ADRs;
supersede them with a new record.

## Commit and pull request expectations

- Keep changes focused; do not mix unrelated refactors with feature work.
- Write descriptive commit messages and PR titles (aim for < 70 characters).
- In the PR description, summarize the change, what you tested, and any follow-up
  work.
- Do not commit secrets. `docker/.env` and similar files are git-ignored — keep
  it that way.
- Ensure `build`, `test`, `graph:check`, and `boundary:check` pass.

## Code of conduct

Be respectful and constructive. Assume good intent, give actionable feedback,
and keep discussions focused on the work.
