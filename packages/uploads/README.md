# @streetstudio/uploads

The Uploads domain: chunked/resumable upload sessions that assemble **real
objects** in storage, built on StreetJS and `@streetjs/storage`.

## Why it exists

Large recordings arrive as many chunks over unreliable networks. This package
owns the *upload session* as a domain concept — its lifecycle (pending →
completed / aborted), which parts have been received, and the rules governing
them — and assembles the received parts into a single real stored object.

## What problem it solves

- Resumable, idempotent part receipt (re-sending a part is a no-op).
- Deterministic completion (only when every part is present) and terminal abort.
- Real byte persistence: parts and the assembled object are written through the
  `@streetjs/storage` facade to a real backend (local filesystem, S3, R2, MinIO,
  … selected by config).

## What it exposes publicly (`src/index.ts`)

- `UploadSession` — rich, immutable domain model (`begin`, `receivePart`,
  `complete`, `abort`, `isComplete`, `canEdit`); `UploadStateError`.
- `UploadService` — use cases composing the repository + object storage.
- `UploadSessionRepository`, `ensureUploadsSchema` — real PostgreSQL persistence.
- `UploadsController`, `createUploadsApp`, `registerUploads` — HTTP API +
  composition root (JWT-authenticated).

## What it depends on

- `streetjs` — HTTP/DI, `PgPool`, JWT auth, exceptions.
- `@streetjs/storage` — the object `Storage` facade (`put`/`get`/`delete`).
- `@streetstudio/shared` — `Uuid` / `IsoTimestamp`.

## HTTP surface

```
POST /api/uploads                     { objectKey, totalParts, contentType? }
GET  /api/uploads/:id                 → session status
PUT  /api/uploads/:id/parts/:n        { data: <base64 part bytes> }
POST /api/uploads/:id/complete        → { session, object }  (assembles real object)
POST /api/uploads/:id/abort           → session (removes stored parts)
```

## Tests

- `upload-session.test.ts` — unit + fast-check property tests for the domain.
- `uploads.integration.test.ts` — a full begin → upload parts → complete journey
  over real HTTP against **real PostgreSQL + real object storage** (local-file
  driver), verifying the assembled object's bytes; plus abort and 401. Runs when
  `STREETSTUDIO_IT_DATABASE_URL` is set; skips otherwise.
