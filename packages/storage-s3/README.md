# @streetstudio/storage-s3

Amazon S3 (and S3-compatible) storage provider delivered as an isolated plugin
(Requirement 9.2). Implements the `StorageProvider` contract from
`@streetstudio/media` and the `Plugin` contract from `@streetstudio/plugins`
(type `"storage"`). No provider is imported into platform core.

No cloud vendor SDK is hard-imported into the workspace build: the provider is a
thin adapter over an injectable `S3StyleClient` seam that host wiring supplies
at deployment time. Because Cloudflare R2 and MinIO are S3-compatible, this
implementation is parameterized by `endpoint`/`region` and reused by
`@streetstudio/storage-r2` and `@streetstudio/storage-minio`.
