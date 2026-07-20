# @streetjs/database — PostgreSQL access, migrations, transactions

- **Package:** `@streetjs/database`
- **Consumers (StreetStudio):** `packages/database` and every service that persists data
- **Depends on:** `@streetjs/core`, `@streetjs/config`
- **Wave:** 2 (data & I/O)

## Motivation

StreetStudio must persist all data in PostgreSQL with migrations, transactions,
and enforced constraints — never an in-memory repository in production. The data
access layer is generic platform infrastructure.

## Required API surface

- `DatabaseModule` + `DatabaseService`: pooled connection, query execution, typed results.
- Transactional unit-of-work: `transaction(fn)` with commit/rollback and nesting/savepoints.
- Migration runner: ordered, idempotent up/down migrations with a version ledger.
- Repository/query helpers that respect parameterization (no string interpolation).
- Connection lifecycle wired to `@streetjs/health` (reachability) and `@streetjs/core` shutdown.

## Acceptance criteria

- [ ] Migrations apply in order, are recorded, and re-running is a no-op; `down` reverses cleanly.
- [ ] `transaction(fn)` commits on success and rolls back on any thrown error, including nested savepoints.
- [ ] All queries are parameterized; a query builder rejects raw interpolation of untrusted input.
- [ ] Foreign keys and constraints are enforced; violations surface as typed errors.
- [ ] Integration tests run against a real PostgreSQL instance (service container).

## Non-goals

- Not a full ORM/relation-mapper unless scoped separately; no business schemas (those live in StreetStudio).
