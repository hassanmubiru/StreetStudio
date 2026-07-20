# StreetStudio engineering principles

StreetStudio is the flagship application for StreetJS. It must read like a mature,
intentionally designed product — not a collection of demos or generated code. The
framework (StreetJS) provides infrastructure; StreetStudio expresses a coherent
domain model and user experience. These principles govern how this repo is built.
They complement the [production charter](PRODUCTION_CHARTER.md) and the
[framework contract](FRAMEWORK_CONTRACT.md).

> Note on scope: these are go-forward principles. Existing reference-build code
> (assembled behind StreetJS adapter seams with in-memory fakes) is reshaped into
> this layout as it is productionized, slice by slice (see
> [`PRODUCTIONIZATION.md`](PRODUCTIONIZATION.md)).

## 1. Domain-first architecture

Organize by business domain, not by technical layer. Not `controllers/`,
`services/`, `models/`, `utils/` — instead:

```
packages/
  organizations/  projects/  recordings/  reviews/
  comments/  sharing/  analytics/  billing/
  knowledge/  notifications/  search/
```

Each domain owns its **API surface, application logic (use cases), domain model,
persistence, events, and tests**.

## 2. Explicit architecture

Every package documents, in its `README.md`, four things:

1. Why it exists.
2. What problem it solves.
3. What it exposes publicly.
4. What it depends on.

If those aren't obvious, the package is mis-scoped and should be reorganized.

## 3. Rich domain models

Business rules live in domain objects and use cases, not smeared across
controllers. Avoid pure DTO-passing pipelines. Prefer behavior on the model:

```ts
class Recording {
  upload(): ...
  publish(): ...
  archive(): ...
  share(): ...
  canEdit(actor): boolean
}
```

The domain enforces its invariants; the API layer orchestrates, it doesn't own
the rules.

## 4. Feature-oriented APIs

Every endpoint maps to a real product capability, expressed as a use case — not
generic CRUD:

```
CreateRecording   UploadChunk        FinalizeUpload
GenerateShareLink ResolveShareLink   PublishRecording
ArchiveRecording  CreateReview       AddTimelineComment
ResolveComment
```

## 5. Strong boundaries

StreetStudio depends only on the **public APIs** of published `@streetjs/*`
packages. Never import framework internals. The dependency arrow is one-way:

```
StreetStudio  ─▶  @streetjs/* packages
```

Enforced by `graph:check`, `boundary:check`, and `streetjs:check`.

## 6. Engineering discipline

Hold the same bar StreetJS holds: clear ADRs, architecture docs, property-based
tests where they add value, contract tests, integration tests against real
infrastructure, CI gates, dependency analysis, and coverage goals. The product
should feel engineered, not assembled.

## 7. Product language

The public API and UI speak the product's vocabulary — `Recording`, `Review`,
`Comment`, `Workspace`, `Share`, `Version`, `Collection` — never framework
plumbing terms like `MediaProcessor`, `WorkflowEngine`, or `StorageProvider`.
(Those framework names are fine *inside* the `@streetjs/*` packages; they must not
leak into StreetStudio's product surface.)

## 8. Incremental implementation

No empty packages or scaffolds "for later." Build complete **vertical slices**
that work end-to-end before starting the next (see delivery order below).

---

## Target package anatomy (per domain)

```
packages/recordings/
  README.md            # why / problem / public surface / dependencies (principle 2)
  src/
    domain/            # rich models + invariants (Recording, Version)
    application/       # use cases (CreateRecording, PublishRecording, ...)
    api/               # feature-oriented endpoints, wired to @streetjs/http
    persistence/       # repositories over @streetjs/database
    events/            # domain events published via @streetjs/events
    index.ts           # public surface only
  test/                # unit + property + contract + integration
```

Public surface = `index.ts` only. Internals stay internal; cross-domain calls go
through published surfaces, never deep imports.

## Vertical-slice delivery order

Each slice is functional end-to-end (domain → persistence → API → SDK → tests)
before the next begins. A slice may be **gated** on a `@streetjs/*` package from
the [framework contract](FRAMEWORK_CONTRACT.md); if so, record the dependency and
pause it rather than faking it.

1. **Recordings** — create, list, get, publish, archive.
2. **Uploads** — create session, upload chunk, finalize, resume (composes `@streetjs/storage`).
3. **Playback** — manifest, streaming, view recording (composes `@streetjs/media` outputs).
4. **Review comments** — timeline-anchored comments, threads, resolve.
5. **Sharing** — generate/resolve/revoke share links, passcodes, expiry.
6. **Workspaces** — organizations, projects, folders, membership.
7. **Search** — content + transcript search with authorization.
8. **Notifications** — delivery + preferences, realtime + digest.

## Definition of done (per vertical slice)

- [ ] Rich domain model with invariants enforced in the domain layer (not the API).
- [ ] Feature-oriented use cases; endpoints map 1:1 to product capabilities.
- [ ] Real persistence via `@streetjs/database` (migrations, transactions, constraints).
- [ ] SDK methods mirror the endpoints; contract test guards parity.
- [ ] Tests: unit + property (where valuable) + integration against real infra.
- [ ] Package `README.md` answers the four questions (principle 2).
- [ ] `build`, `graph:check`, `boundary:check`, `streetjs:check`, coverage — all green.
- [ ] No placeholder/mock production code; any blocker recorded in the dependency register.
