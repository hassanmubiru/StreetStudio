# Media Pipeline

This document describes the end-to-end media path: capture in the Recorder,
chunked/resumable upload, and the background processing pipeline that produces
thumbnails, previews, and adaptive-bitrate renditions. It spans
`packages/recording`, `apps/api` (upload controller), `packages/media`, and
`packages/processing` (workers).

## Overview

```
Recorder (web/desktop) ──▶ Chunked upload ──▶ Storage_Provider (object store)
                                              │
                                              ▼
                              Media pipeline (background worker)
                              transcode ▸ thumbnail ▸ preview ▸ renditions
                                              │
                                              ▼
                              Video marked "ready" ▸ realtime status events
```

## 1. Recording (`packages/recording`)

Client-side capture plus the chunked/resumable upload client, consumed by
`apps/web` and `apps/desktop`.

- Missing or unsupported system audio continues capture without it and notifies
  the Member (R6.5).
- Denied capture permission aborts recording and retains nothing (R6.6).
- Cursor highlighting/drawing tools and keyboard shortcuts are available during
  recording (R6.7, R6.12).
- **Offline stops** persist locally and upload with **up to 5 retries** when
  connectivity returns (R6.10, R6.11).

## 2. Chunked upload (`apps/api` upload controller + `packages/media`)

Uploads are chunked and resumable, coordinated by an upload session.

- **Chunk size** is 1 MB–100 MB. Out-of-range sizes are rejected with
  `UPLOAD_CHUNK_SIZE_INVALID` (R7.4).
- **Integrity** — each chunk is integrity-checked. A failing chunk is rejected
  without being persisted (`UPLOAD_CHUNK_INVALID`), retried up to 3 times; on
  exhaustion the session is aborted, partial chunks are discarded, and the
  failure response identifies the failing chunk (R7.4, R7.5).
- **Resume** — resuming within the 24-hour session lifetime continues from the
  chunk immediately after the last acknowledged one, without retransmitting or
  re-acknowledging already-acknowledged chunks (R7.2, R7.3).
- **Expiry** — sessions idle past 24 hours expire and discard partial chunks
  (`UPLOAD_SESSION_EXPIRED`, R7.6).
- **Progress** — each acknowledgment emits an upload-progress realtime event
  reporting acknowledged/total chunks (R7.7).
- **Direct-to-storage** — where the storage provider supports it, the API issues
  signed upload credentials that expire within 15 minutes (R9.6, R29.3); a
  target presented after expiry is rejected (`SIGNED_TARGET_EXPIRED`).

Upload endpoints: `POST /uploads`, `GET /uploads/:id`,
`POST /uploads/:id/complete`, `POST /uploads/:id/abort` (see [API](./API.md)).

## 3. Processing (`packages/processing`, run in workers)

On upload completion the pipeline is enqueued within 5 seconds (R8.1) and runs
on background workers consuming StreetJS queues.

```typescript
interface MediaPipeline {
  enqueue(videoId: string): Promise<void>;   // within 5s of upload completion (R8.1)
  process(job: ProcessingJob): Promise<ProcessingResult>;
}
interface ProcessingResult {
  thumbnail: AssetRef;      // exactly one (R8.2)
  preview: AssetRef;        // 3..10s hover preview (R8.3)
  renditions: Rendition[];  // >= 3 ABR renditions (R8.4)
  status: 'ready' | 'failed';
}
```

Outputs:

- **Thumbnail** — exactly one (R8.2).
- **Preview** — a short hover preview of 3–10 seconds (R8.3).
- **Renditions** — at least 3 adaptive-bitrate renditions for playback (R8.4).

### Status transitions

The pipeline emits status transitions `queued → processing → ready|failed` to
Members with access within 2 seconds per transition, over the realtime channel
(R8.5).

### Failure handling (bounded retries)

Processing failures retry **up to 3 times**. On exhaustion, the pipeline:

1. records a `failed` status,
2. **retains the original source media**, and
3. emits a processing-failure event (R8.6).

A successful run marks the Video `ready` (R8.7). See [DECISIONS](./DECISIONS.md)
ADR-0004 for the bounded-retry resilience policy that governs pipeline retries,
upload retries, and webhook deliveries.

## 4. Storage abstraction (`packages/media`, providers are plugins)

All media persistence flows through a single Storage_Provider interface (R9.1).
Providers for Local, S3, R2, Azure Blob, GCS, and MinIO are delivered as plugins
(R9.2). Activating a provider with missing config or a failing connectivity
check is rejected and retains the prior provider (`STORAGE_CONFIG_INVALID`,
R9.4). A storage round-trip preserves object bytes exactly (R9.1). See
[PLUGIN_GUIDE](./PLUGIN_GUIDE.md).

## 5. Playback (`packages/media`)

Playback requires view permission or a valid share credential; requests without
permission return no manifest and an authorization error (R10.2, R10.4, R10.5).
A video whose processing has not completed returns `VIDEO_NOT_READY`.

- `GET /videos/:videoId/playback` — returns the ABR playback manifest.
- `POST /videos/:videoId/views` — records a view event (feeds analytics).

## AI-derived artifacts

Transcripts and summaries are produced through the AI capability router, which
is plugin-backed with no hardcoded vendor. When no AI provider is configured,
`GET /videos/:id/summary` returns `AI_UNAVAILABLE` (503) and non-AI media
features continue to function. See [PLUGIN_GUIDE](./PLUGIN_GUIDE.md).
