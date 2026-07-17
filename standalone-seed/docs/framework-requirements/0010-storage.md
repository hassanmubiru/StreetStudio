# @streetjs/storage — object storage abstraction & providers

- **Package:** `@streetjs/storage`
- **Consumers (StreetStudio):** uploads, media assets, rendition outputs, sharing
- **Depends on:** `@streetjs/core`, `@streetjs/config`, `@streetjs/security` (signed credentials)
- **Wave:** 4 (domain infra)

## Motivation

StreetStudio stores real files across local/S3/R2/Azure/GCS/MinIO and needs a
single provider abstraction with signed, expiring access. Generic platform
infrastructure. (StreetStudio already defines a conformance suite it can reuse
to validate providers.)

## Required API surface

- `StorageProvider` contract: `put`, `get`, `delete`, `exists`, `signUrl(op, key, ttl)`.
- Built-in providers: local FS, S3, Cloudflare R2, Azure Blob, GCS, MinIO.
- Multipart/chunked put supporting resumable assembly of large objects.
- Streaming read for media playback.
- `StorageModule` selecting a provider from config.

## Acceptance criteria

- [ ] Byte round-trip holds for every provider (put→get returns identical bytes).
- [ ] Signed URLs grant the intended op and expire at their TTL; expired URLs are rejected.
- [ ] Chunked upload assembles a correct final object from parts; interrupted uploads can resume.
- [ ] Read streams support range requests for playback.
- [ ] All providers pass one shared conformance suite.

## Non-goals

- No transcoding/thumbnailing (that is `@streetjs/media`); no product upload-session model.
