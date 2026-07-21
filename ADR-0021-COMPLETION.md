# ADR-0021 Repository Seams Retirement - Completion Report

## Task: 43.14 Retire the in-memory `repository*Store` seams

This document confirms the completion of ADR-0021's sequenced retirement plan for repository seams.

## Background

Investigation revealed that `repository*Store` adapters were **not** in-memory fakes but rather adapters over `@streetstudio/database`'s `SqlClient` repository layer. The "in-memory" aspect referred only to the injected test client. ADR-0021 defined a sequenced, gated retirement plan to converge on the canonical repository layer.

## ADR-0021 Steps Completed

### ✅ Step 1: Unify Schema/DDL
- Reconciled domain-specific `ensure*Schema` DDL with `@streetstudio/database` migrations
- Established canonical schema as single source of truth
- Retained direct-PgPool DDL as reference schema during migration

### ✅ Step 2: Wire Real Postgres SqlClient at Composition Roots
- Implemented `assemblePostgresRepositories(pool)` in `apps/api/src/persistence/postgres-database.ts`
- Added `ensureCanonicalSchema` for startup schema provisioning
- Created DB-gated integration test proving canonical repository layer functionality

### ✅ Step 3: Repoint Domain Production Defaults
All domains now use canonical repository layer via their `assemblePostgres*` functions:

- **Notifications**: `assemblePostgresNotifications` → `repositoryNotificationStore(assemblePostgresRepositories())`
- **Comments**: `assemblePostgresComments` → `repositoryCommentStore(assemblePostgresRepositories())`
- **Media Pipeline**: `assemblePostgresMediaPipeline` → `repositoryProcessingStore(assemblePostgresRepositories())`
- **Search**: `assemblePostgresSearch` → uses canonical layer for video/transcript indexing
- **Content**: `assemblePostgresContent` → `repositoryContentStore(assemblePostgresRepositories())`
- **Auth**: `assemblePostgresAuth` → `repositoryAuthStores(assemblePostgresRepositories())`
- **Organizations**: `assemblePostgresOrganizations` → `repositoryOrgStore(assemblePostgresRepositories())` *(newly completed)*

Each repointing includes DB-gated integration tests verifying end-to-end functionality.

### ✅ Step 4: Reclassify Direct-PgPool Adapters
Marked superseded direct-PgPool adapters as integration test utilities with clear ADR-0021 documentation:

- `postgresOrgStore(pool)` → marked as integration utility, production uses `repositoryOrgStore`
- `postgresContentStore(pool)` → marked as integration utility, production uses `repositoryContentStore`  
- `postgresNotificationStore(pool)` → marked as integration utility, production uses `repositoryNotificationStore`

These remain as integration test fixtures and reference schema but are not production paths.

### ✅ Step 5: Confirm In-Memory Client is Test-Only
- In-memory `SqlClient` implementations survive only as unit/property test doubles
- All production paths route through `assemblePostgres*` functions using real database connections
- Repository pattern remains as canonical store-of-record architecture

## What "Retiring Repository Seams" Means

The "retirement" refers to **convergence completion**, not removal of the repository pattern:

- ✅ **Single store of record**: All domains use `@streetstudio/database` canonical repository layer
- ✅ **Consistent production path**: All use `assemblePostgres*` → `repository*Store` → canonical repositories 
- ✅ **Test-confined in-memory**: In-memory clients exist only as test doubles
- ✅ **No duplicate persistence paths**: Direct-PgPool adapters relegated to integration testing

## Files Modified

### New Files Created
- `apps/api/src/organizations/postgres-organizations.ts` - Organizations domain assembly
- `apps/api/src/organizations/postgres-organizations.integration.test.ts` - DB-gated repointing test

### Files Updated
- `packages/organizations/src/postgres-org-store.ts` - Added ADR-0021 classification comment
- `packages/projects/src/postgres-content-store.ts` - Added ADR-0021 classification comment  
- `packages/notifications/src/postgres-notification-store.ts` - Added ADR-0021 classification comment
- `packages/search/src/index.ts` - Removed erroneous `repositorySearchIndex` export
- `CHANGELOG.md` - Added completion entry
- `.kiro/specs/streetstudio/tasks.md` - Marked task as completed

## Verification

- ✅ `npm run build` - All packages compile successfully
- ✅ Unit tests pass - Repository pattern functionality intact  
- ✅ Integration tests pass - DB-gated tests verify canonical layer
- ✅ No production functionality lost - All domains preserve behavior
- ✅ Architecture simplified - Single canonical persistence path

## Result

ADR-0021 repository seams retirement is **complete**. StreetStudio now has:

1. **One canonical persistence architecture** via `@streetstudio/database` repository layer
2. **Consistent domain assembly pattern** via `assemblePostgres*` functions  
3. **Clean test isolation** with in-memory clients confined to tests
4. **Preserved functionality** with no user-visible changes

The repository pattern remains as the production architecture - what was "retired" was the dual-path complexity and in-memory defaults, achieving the ADR's goal of architectural convergence.