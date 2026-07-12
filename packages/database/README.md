# @streetstudio/database

**Primary domain responsibility:** PostgreSQL schema, migrations, repositories, and the append-only audit log.

Public API is exposed exclusively through the package entry point.

## Dependencies

- `@streetstudio/shared`
- `@streetstudio/config`
- StreetJS (`@streetjs/core`) — PostgreSQL access via published public entry points.
