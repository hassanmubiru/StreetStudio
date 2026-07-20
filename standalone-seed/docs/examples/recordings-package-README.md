# Example: `packages/recordings/README.md`

> This is a **template** for the first domain package. When the Recordings
> vertical slice is actually built (per `../ENGINEERING_PRINCIPLES.md`), copy this
> to `packages/recordings/README.md` and fill the checklists. It is documentation,
> not a code scaffold — no empty `packages/recordings/` is created ahead of the
> real slice (principle 8).

---

# @streetstudio/recordings

The Recordings domain: the lifecycle of a captured recording — from draft through
published, shared, and archived — and the business rules that govern it.

## Why it exists

Recordings are the core artifact of StreetStudio. This package owns the recording
as a **domain concept** (not a media file — that is infrastructure), so the rules
about who can edit, publish, share, or archive a recording live in one place
rather than scattered across the API layer.

## What problem it solves

- A single home for recording state transitions and their invariants.
- Feature-oriented operations that mirror the user's workflow (create, publish,
  archive, share), not generic CRUD.
- A clean separation between the *recording* (product concept) and the *media
  bytes / renditions* (framework `@streetjs/media` + `@streetjs/storage`).

## What it exposes publicly (`src/index.ts` only)

Domain model and use cases — never internal persistence or framework handles:

- `Recording` — rich model with behavior and guarded transitions:
  `publish()`, `archive()`, `share()`, `canEdit(actor)`, `canView(actor)`.
- `Version` — an immutable version of a recording.
- Use cases (application layer):
  `CreateRecording`, `PublishRecording`, `ArchiveRecording`, `GetRecording`,
  `ListRecordings`.
- Domain events: `RecordingPublished`, `RecordingArchived` (published via
  `@streetjs/events`).

Product vocabulary only (principle 7): `Recording`, `Version` — never
`MediaProcessor`/`StorageProvider` in the public surface.

## What it depends on

Public APIs of published `@streetjs/*` packages only (one-way arrow, principle 5):

- `@streetjs/core` — DI / module composition.
- `@streetjs/database` — persistence (migrations, transactions).
- `@streetjs/events` — domain events.
- `@streetjs/media`, `@streetjs/storage` — composed by *use cases* for the media
  path (uploads/renditions), never re-implemented here.
- `@streetjs/rbac` — authorization decisions consumed by `canEdit`/`canView`.

Never imports framework internals; never depended on *by* a `@streetjs/*` package.

## Layout

```
src/
  domain/        # Recording, Version — invariants & transitions
  application/   # CreateRecording, PublishRecording, ArchiveRecording, ...
  api/           # feature-oriented endpoints wired to @streetjs/http
  persistence/   # RecordingRepository over @streetjs/database
  events/        # RecordingPublished, RecordingArchived
  index.ts       # public surface only
test/            # unit + property + contract + integration
```

## Definition of done (this slice)

- [ ] `Recording` enforces its own transitions (e.g. cannot publish an archived
      recording); invariants are unit- and property-tested.
- [ ] Use cases map 1:1 to product operations; no generic CRUD leakage.
- [ ] `RecordingRepository` persists to PostgreSQL via `@streetjs/database`
      (migration + transactions + constraints); integration-tested against a real DB.
- [ ] Endpoints exposed via `@streetjs/http`; SDK methods mirror them; contract
      test guards parity.
- [ ] Authorization (`canEdit`/`canView`) evaluated via `@streetjs/rbac`,
      deny-by-default.
- [ ] `build`, `graph:check`, `boundary:check`, `streetjs:check`, coverage — green.
- [ ] No placeholder/mock production code; blockers recorded in the dependency
      register (`../MIGRATION.md`).

## Blocked on (record, don't fake)

This slice cannot be completed until the composing `@streetjs/*` packages are
published — at minimum `@streetjs/core`, `@streetjs/database`, `@streetjs/http`,
`@streetjs/rbac`, and (for the media path) `@streetjs/media`/`@streetjs/storage`.
See `../framework-requirements/` and the dependency register in `../MIGRATION.md`.
