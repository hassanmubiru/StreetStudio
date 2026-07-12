/**
 * @streetstudio/database
 *
 * Public entry point for the relational schema, migrations, repositories, and
 * the append-only audit log. PostgreSQL access is delegated to StreetJS public
 * entry points: every repository and migration is written against the minimal
 * structural {@link SqlClient}, and the composition root adapts the concrete
 * StreetJS PostgreSQL client with {@link streetSqlClient}.
 *
 * This package depends only on `@streetstudio/shared` and `@streetstudio/config`
 * (plus the optional `@streetjs/core` peer), keeping the dependency graph
 * acyclic.
 *
 * Everything below is the package's entire public surface. Consumers MUST
 * import from `@streetstudio/database` and never reach into internal modules.
 */
import type { Uuid, IsoTimestamp } from "@streetstudio/shared";

export const DOMAIN =
  "PostgreSQL schema, migrations, repositories, and the append-only audit log." as const;

/**
 * An organization-scoped repository context. Carries the tenant and a
 * timestamp for the current unit of work; consumed by higher layers (e.g.
 * `@streetstudio/auth`) to thread tenant isolation through operations.
 */
export interface RepositoryContext {
  readonly organizationId: Uuid;
  readonly at: IsoTimestamp;
}

// PostgreSQL access boundary (structural SqlClient + StreetJS adapter).
export {
  streetSqlClient,
  isTransactional,
} from "./sql.js";
export type {
  SqlClient,
  SqlQueryResult,
  SqlRow,
  SqlValue,
  StreetPostgresClient,
  TransactionalSqlClient,
} from "./sql.js";

// UUID identifier helpers.
export { newUuid, isUuid } from "./ids.js";

// Structured schema metadata + tenant-isolation invariants.
export {
  SCHEMA,
  ORGANIZATION_ID_COLUMN,
  getTable,
  tenantScopedTables,
  hasOrganizationIdColumn,
  hasOrganizationIdIndex,
  hasUuidPrimaryKey,
} from "./schema.js";
export type {
  SqlColumnType,
  ColumnDefinition,
  IndexDefinition,
  TableDefinition,
} from "./schema.js";

// Migrations: DDL rendering, the ordered migration set, and the runner.
export {
  MIGRATIONS,
  runMigrations,
  buildSchemaStatements,
  renderColumn,
  renderCreateTable,
  renderCreateIndex,
  assertOrderedMigrations,
} from "./migrations.js";
export type { Migration, MigrationRunResult } from "./migrations.js";

// Typed repositories + factory.
export {
  createRepositories,
  GlobalRepository,
  TenantRepository,
  AppendOnlyTenantRepository,
  TeamMembershipRepository,
  ReactionRepository,
  NotificationPreferenceRepository,
  toColumnName,
  toFieldName,
} from "./repositories.js";
export type { Repositories } from "./repositories.js";

// Entity record types (full persistence shapes, including secret-bearing
// columns absent from the public DTOs).
export type {
  MemberRecord,
  SessionRecord,
  OrganizationRecord,
  RoleRecord,
  MembershipRecord,
  TeamRecord,
  TeamMembershipRecord,
  InvitationRecord,
  WorkspaceRecord,
  ProjectRecord,
  FolderRecord,
  VideoRecord,
  RenditionRecord,
  AssetRecord,
  TranscriptRecord,
  SummaryRecord,
  CommentRecord,
  ReactionRecord,
  NotificationRecord,
  NotificationPreferenceRecord,
  ShareLinkRecord,
  UploadSessionRecord,
  AuditEntryRecord,
  ApiKeyRecord,
  WebhookRecord,
  PullRequestLinkRecord,
  DocLinkRecord,
  ViewEventRecord,
  PluginRecord,
} from "./records.js";
