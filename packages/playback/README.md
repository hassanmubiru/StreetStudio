# @streetstudio/playback

Authorized byte-range streaming of a completed upload's assembled object, built
on StreetJS + `@streetjs/storage`.

## Why it exists

Once an upload is completed and assembled into a stored object, members of the
owning organization need to play it back — including partial (range) requests
for seeking. This package serves those bytes with authorization and HTTP range
support.

## What problem it solves

- Authorization: an object is streamable only to the organization that owns the
  completed upload it came from (defers to the uploads domain — no cross-org
  disclosure).
- Real streaming: bytes are read from real object storage and returned with
  `Accept-Ranges`, `Content-Range`, correct `Content-Length`, and `200`/`206`/
  `416` semantics.

## What it exposes publicly (`src/index.ts`)

- `PlaybackService.resolve(actor, key)` — authorized object retrieval.
- `parseRange(header, size)` — pure HTTP `Range` parser (`ByteRange` |
  `"unsatisfiable"` | `null`).
- `PlaybackController`, `createPlaybackApp`, `registerPlayback` — HTTP API +
  composition (JWT-authenticated).

## What it depends on

- `streetjs` — HTTP/DI, `PgPool`, JWT auth, exceptions.
- `@streetjs/storage` — the object `Storage` facade.
- `@streetstudio/uploads` — authorization lookup (completed upload → owning org).
- `@streetstudio/shared` — `Uuid`.

## HTTP surface

```
GET /api/playback?key=<objectKey>     (honors the Range header)
  → 200 full | 206 partial | 416 unsatisfiable | 404 not found/unauthorized
```

## Tests

- `playback.test.ts` — unit + fast-check property tests for `parseRange`.
- `playback.integration.test.ts` — a real completed upload is created (real
  Postgres + real storage), then streamed back over HTTP: full body, a partial
  range (206), an unsatisfiable range (416), cross-org (404), and 401. Runs when
  `STREETSTUDIO_IT_DATABASE_URL` is set; skips otherwise.
