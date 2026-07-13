# @streetstudio/storage

The storage abstraction for StreetStudio.

Defines the `StorageProvider` contract, the `StorageRouter` that all persistence
flows through (write-ack timeout, failure recording), and the signed-target TTL
policy (60–3600s, default 900; direct-to-storage ≤ 15 min). **No vendor code**
lives here — concrete providers (Local, S3, R2, Azure Blob, GCS, MinIO) ship as
`@streetstudio/storage-*` plugins that implement `StorageProvider`.

## Dependencies

`@streetstudio/shared`, `@streetstudio/auth`. Consumed by `@streetstudio/media`
(upload) and by every `storage-*` provider plugin.
