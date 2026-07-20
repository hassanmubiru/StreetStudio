# @streetstudio/recordings

The Recordings domain: the lifecycle of a captured recording — draft → published
→ archived — and the business rules that govern it, built on the StreetJS
framework.

## Why it exists

Recordings are the core artifact of StreetStudio. This package owns the recording
as a **domain concept** (distinct from the media bytes/renditions, which are
infrastructure), so the rules about who may edit, publish, view, or archive a
recording live in one place instead of being scattered across the API layer.

## What problem it solves

- A single home for recording state transitions and their invariants (a draft can
  be published once; archiving is terminal; only the owner may edit).
- Feature-oriented operations that mirror the workflow (create / publish /
  archive), not generic CRUD.
- Real persistence and a real HTTP API composed from StreetJS — no fakes.

## What it exposes publicly (`src/index.ts`)

- `Recording` — rich, immutable domain model with guarded transitions
  (`publish`, `archive`) and `canEdit`/`canView`; `RecordingStateError`.
- `RecordingService` — use cases: create, get, list, publish, archive (with
  domain-driven authorization).
- `RecordingRepository` — real PostgreSQL persistence over StreetJS `PgPool`.
- `ensureRecordingsSchema` / `RECORDINGS_TABLE_DDL` — idempotent schema.
- `RecordingsController`, `createRecordingsApp`, `registerRecordings` — the HTTP
  API and composition root.

## What it depends on

- `streetjs` — HTTP (`streetApp`, `@Controller`/`@Get`/`@Post`), DI (`container`),
  PostgreSQL (`PgPool`), and the exception taxonomy. Consumed via the public
  package entry only.
- `@streetstudio/shared` — `Uuid` / `IsoTimestamp` types.

Never imports framework internals; never depended on by a `@streetjs/*` package.

## Layout

```
src/
  domain/        recording.ts            — rich model + invariants (pure)
  application/   recording-service.ts    — use cases + authorization
  persistence/   schema.ts, recording-repository.ts — real PgPool persistence
  api/           recordings-controller.ts, app.ts   — HTTP endpoints + composition
  index.ts       — public surface
```

## Tests

- `recording.test.ts` — unit + fast-check property tests for domain invariants
  (pure; always run).
- `recordings.integration.test.ts` — repository round-trips **and** a full HTTP
  journey against a **real PostgreSQL**. Runs when `STREETSTUDIO_IT_DATABASE_URL`
  points at a database; skips gracefully otherwise.

```bash
docker compose -f docker/docker-compose.yml up -d postgres
STREETSTUDIO_IT_DATABASE_URL=postgres://streetstudio:streetstudio_dev@127.0.0.1:5435/streetstudio \
  npx vitest run --project integration packages/recordings
```
