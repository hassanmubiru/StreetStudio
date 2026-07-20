# StreetStudio — standalone product repository (seed)

This directory is a **bootstrap seed** for the standalone StreetStudio product
repository. It is not part of the reference-build workspace that contains it; it
lives here only so you can copy it into a fresh, independent repository.

> These files are real, functional bootstrap configuration (workspace layout,
> tooling, CI, local-dev infrastructure). They are **not** production feature
> code and contain **no** mock services or fake data — per the
> [production charter](../docs/PRODUCTION_CHARTER.md), feature code that requires
> a missing dependency is not written until the dependency exists.

## How to use

1. Create a new, empty git repository named `streetstudio`.
2. Copy the contents of this `standalone-seed/` directory into its root.
3. Follow [`MIGRATION.md`](MIGRATION.md) to bring over the domain packages from
   the reference build and swap adapter seams for published `@streetjs/*`
   packages as they become available.

## What's here

| File | Purpose |
| ---- | ------- |
| `package.json` | Root workspace + tooling scripts (pnpm + Turborepo). |
| `pnpm-workspace.yaml` | Workspace globs (`apps/*`, `packages/*`, `infrastructure/*`). |
| `turbo.json` | Task graph (build/test/lint/typecheck). |
| `tsconfig.base.json` | Shared strict TypeScript config. |
| `.github/workflows/ci.yml` | CI: typecheck, lint, test with real service containers. |
| `docker/docker-compose.yml` | Local dev infrastructure (PostgreSQL, Redis, MinIO, MailHog). |
| `.env.example` | Environment variable names (no secrets). |
| `.gitignore`, `.nvmrc` | Standard repo hygiene. |
| `MIGRATION.md` | Step-by-step plan to populate the repo from the reference build. |
| `docs/FRAMEWORK_CONTRACT.md` | Composition doctrine + the `@streetjs/*` packages/APIs StreetStudio consumes. |
| `docs/ENGINEERING_PRINCIPLES.md` | Domain-first architecture, rich models, vertical-slice delivery, per-slice DoD. |
| `docs/framework-requirements/` | Issue-ready capability specs for each `@streetjs/*` package. |

## Governing standard

All work in the new repository is measured against the
[StreetStudio Production Charter](../docs/PRODUCTION_CHARTER.md): real
infrastructure, real persisted data, no placeholders or fakes outside automated
tests, and — critically — **never recreate StreetJS**. If a required
`@streetjs/*` package is not yet published, pause that feature and record the
dependency.

The composition doctrine and the concrete list of `@streetjs/*` packages (and the
API surface each must expose) are in
[`docs/FRAMEWORK_CONTRACT.md`](docs/FRAMEWORK_CONTRACT.md). StreetJS provides the
platform; StreetStudio composes it and provides the product.
