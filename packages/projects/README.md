# @streetstudio/projects

The content hierarchy for StreetStudio: projects, folders, and workspaces.

`ContentService` enforces create/move permissions (deny-by-default, in the
owning organization's scope), name-length bounds, and a maximum folder nesting
depth, and preserves identity/associations on same-organization moves.

## Dependencies

`@streetstudio/shared`, `@streetstudio/auth`, `@streetstudio/database`.
