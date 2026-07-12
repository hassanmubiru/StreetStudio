# @streetstudio/storage-local

Local filesystem storage provider delivered as an isolated plugin
(Requirement 9.2). Implements the `StorageProvider` contract from
`@streetstudio/media` and the `Plugin` contract from `@streetstudio/plugins`
(type `"storage"`); discovered and loaded through the StreetJS plugin loader.
No provider is imported into platform core.

This provider is fully functional: objects are persisted as files under a
configured base directory, with keys sanitized so reads and writes cannot
escape it.
