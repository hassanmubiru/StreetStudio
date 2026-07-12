# @streetstudio/storage-minio

MinIO storage provider delivered as an isolated plugin (Requirement 9.2). MinIO
is S3-compatible, so this package reuses the S3-style implementation from
`@streetstudio/storage-s3`, parameterized by the MinIO server endpoint.
Implements the `StorageProvider` contract from `@streetstudio/media` and the
`Plugin` contract from `@streetstudio/plugins` (type `"storage"`). No provider
is imported into platform core; the S3-compatible client is injected at
deployment time.
