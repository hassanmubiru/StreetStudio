# @streetjs/media — media processing (FFmpeg pipeline)

- **Package:** `@streetjs/media`
- **Consumers (StreetStudio):** processing pipeline (thumbnails, previews, HLS, metadata)
- **Depends on:** `@streetjs/core`, `@streetjs/storage`, `@streetjs/queue`
- **Wave:** 4 (domain infra)

## Motivation

StreetStudio produces real media outputs from uploaded recordings via FFmpeg. The
processing primitives are generic platform infrastructure; StreetStudio decides
which outputs a video needs.

## Required API surface

- FFmpeg-backed operations: `transcode`, `thumbnail`, `preview`, `hlsRenditions`, `extractMetadata`, `waveform`.
- Rendition/ABR ladder configuration.
- Pipeline composition over `@streetjs/queue` for async execution; outputs persisted via `@streetjs/storage`.
- Progress/status reporting hooks.

## Acceptance criteria

- [ ] Given a real input file, each operation produces valid outputs (playable renditions, correct-dimension thumbnails, parseable metadata).
- [ ] Processing runs as queued jobs; failures are bounded and preserve the source (no data loss).
- [ ] Output artifacts are persisted to storage and addressable.
- [ ] `media`-category tests run with a real `ffmpeg` binary present.

## Non-goals

- No player/streaming client (that composes outputs in StreetStudio); no storage driver logic.
