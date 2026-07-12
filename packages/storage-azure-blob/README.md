# @streetstudio/storage-azure-blob

Azure Blob Storage provider delivered as an isolated plugin (Requirement 9.2).
Implements the `StorageProvider` contract from `@streetstudio/media` and the
`Plugin` contract from `@streetstudio/plugins` (type `"storage"`). No provider
is imported into platform core.

No Azure vendor SDK is hard-imported into the workspace build: the provider is a
thin adapter over an injectable `AzureBlobClient` seam that host wiring supplies
at deployment time.
