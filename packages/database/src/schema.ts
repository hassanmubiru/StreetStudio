/**
 * Relational schema definition for StreetStudio.
 *
 * The schema is declared as structured metadata (rather than opaque SQL) so
 * that:
 *  - migrations can be generated deterministically from a single source of
 *    truth, and
 *  - tenant-isolation invariants are machine-checkable: every tenant-scoped
 *    table must carry an `organization_id` column and be indexed on it, and
 *    every table must have a UUID primary key.
 *
 * Column names are snake_case (PostgreSQL convention); the repositories map
 * between these and the camelCase DTO fields defined in `@streetstudio/shared`.
 */

/** PostgreSQL column types used by the schema. */
export type SqlColumnType =
  | "uuid"
  | "text"
  | "citext"
  | "timestamptz"
  | "integer"
  | "bigint"
  | "smallint"
  | "boolean"
  | "jsonb";

/** A single column in a table. */
export interface ColumnDefinition {
  readonly name: string;
  readonly type: SqlColumnType;
  /** Whether the column may be NULL. Defaults to false (NOT NULL). */
  readonly nullable?: boolean;
  /** Raw SQL default expression, e.g. `now()`. */
  readonly default?: string;
  /**
   * Foreign-key reference as `"table(column)"`, e.g. `"organization(id)"`.
   * Rendered as `REFERENCES table(column) ON DELETE CASCADE`.
   */
  readonly references?: string;
}

/** A secondary index on a table. */
export interface IndexDefinition {
  /** Index name (unique across the schema). */
  readonly name: string;
  /** Columns covered by the index, in order. */
  readonly columns: readonly string[];
  /** Whether the index enforces uniqueness. Defaults to false. */
  readonly unique?: boolean;
}

/** A table definition. */
export interface TableDefinition {
  readonly name: string;
  /**
   * True when the table belongs to a single tenant and therefore carries an
   * `organization_id` column that scopes every row to an Organization. Such
   * tables MUST be indexed on `organization_id` to enforce isolation.
   */
  readonly tenantScoped: boolean;
  readonly columns: readonly ColumnDefinition[];
  /** Primary-key column names. A single UUID column for entity tables. */
  readonly primaryKey: readonly string[];
  readonly indexes: readonly IndexDefinition[];
}

/** The column carried by every tenant-scoped table. */
export const ORGANIZATION_ID_COLUMN = "organization_id" as const;

/** Standard UUID primary-key column shared by entity tables. */
const idPk: ColumnDefinition = { name: "id", type: "uuid" };

/** Standard tenant-scoping column (FK to the owning organization). */
const orgIdColumn: ColumnDefinition = {
  name: ORGANIZATION_ID_COLUMN,
  type: "uuid",
  references: "organization(id)",
};

/** The single, ordered source of truth for all core entities. */
export const SCHEMA: readonly TableDefinition[] = [
  // ----- Identity & organization -----------------------------------------
  {
    name: "member",
    tenantScoped: false,
    primaryKey: ["id"],
    columns: [
      idPk,
      { name: "email", type: "citext" },
      { name: "password_hash", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz", default: "now()" },
    ],
    indexes: [{ name: "uq_member_email", columns: ["email"], unique: true }],
  },
  {
    name: "session",
    tenantScoped: false,
    primaryKey: ["id"],
    columns: [
      idPk,
      { name: "member_id", type: "uuid", references: "member(id)" },
      { name: "issued_at", type: "timestamptz", default: "now()" },
      { name: "expires_at", type: "timestamptz" },
      { name: "revoked_at", type: "timestamptz", nullable: true },
    ],
    indexes: [{ name: "idx_session_member", columns: ["member_id"] }],
  },
  {
    name: "organization",
    tenantScoped: false,
    primaryKey: ["id"],
    columns: [
      idPk,
      { name: "name", type: "text" },
      { name: "settings", type: "jsonb", default: "'{}'::jsonb" },
      { name: "created_at", type: "timestamptz", default: "now()" },
    ],
    indexes: [],
  },
  {
    name: "role",
    tenantScoped: true,
    primaryKey: ["id"],
    columns: [
      idPk,
      orgIdColumn,
      { name: "name", type: "text" },
      { name: "permissions", type: "jsonb", default: "'[]'::jsonb" },
    ],
    indexes: [
      { name: "idx_role_org", columns: [ORGANIZATION_ID_COLUMN] },
      {
        name: "uq_role_org_name",
        columns: [ORGANIZATION_ID_COLUMN, "name"],
        unique: true,
      },
    ],
  },
  {
    name: "membership",
    tenantScoped: true,
    primaryKey: ["id"],
    columns: [
      idPk,
      orgIdColumn,
      { name: "member_id", type: "uuid", references: "member(id)" },
      { name: "role_id", type: "uuid", references: "role(id)" },
      { name: "created_at", type: "timestamptz", default: "now()" },
    ],
    indexes: [
      { name: "idx_membership_org", columns: [ORGANIZATION_ID_COLUMN] },
      {
        name: "uq_membership_org_member",
        columns: [ORGANIZATION_ID_COLUMN, "member_id"],
        unique: true,
      },
    ],
  },
  {
    name: "team",
    tenantScoped: true,
    primaryKey: ["id"],
    columns: [idPk, orgIdColumn, { name: "name", type: "text" }],
    indexes: [{ name: "idx_team_org", columns: [ORGANIZATION_ID_COLUMN] }],
  },
  {
    name: "team_membership",
    tenantScoped: false,
    primaryKey: ["team_id", "member_id"],
    columns: [
      { name: "team_id", type: "uuid", references: "team(id)" },
      { name: "member_id", type: "uuid", references: "member(id)" },
    ],
    indexes: [{ name: "idx_team_membership_member", columns: ["member_id"] }],
  },
  {
    name: "invitation",
    tenantScoped: true,
    primaryKey: ["id"],
    columns: [
      idPk,
      orgIdColumn,
      { name: "email", type: "citext" },
      { name: "token", type: "text" },
      { name: "status", type: "text", default: "'pending'" },
      { name: "created_at", type: "timestamptz", default: "now()" },
      { name: "expires_at", type: "timestamptz" },
    ],
    indexes: [
      { name: "idx_invitation_org", columns: [ORGANIZATION_ID_COLUMN] },
      { name: "uq_invitation_token", columns: ["token"], unique: true },
    ],
  },
  {
    name: "workspace",
    tenantScoped: true,
    primaryKey: ["id"],
    columns: [
      idPk,
      orgIdColumn,
      { name: "name", type: "text" },
      { name: "created_at", type: "timestamptz", default: "now()" },
    ],
    indexes: [{ name: "idx_workspace_org", columns: [ORGANIZATION_ID_COLUMN] }],
  },

  // ----- Content hierarchy -------------------------------------------------
  {
    name: "project",
    tenantScoped: true,
    primaryKey: ["id"],
    columns: [
      idPk,
      orgIdColumn,
      { name: "name", type: "text" },
      { name: "created_at", type: "timestamptz", default: "now()" },
    ],
    indexes: [{ name: "idx_project_org", columns: [ORGANIZATION_ID_COLUMN] }],
  },
  {
    name: "folder",
    tenantScoped: false,
    primaryKey: ["id"],
    columns: [
      idPk,
      { name: "project_id", type: "uuid", references: "project(id)" },
      {
        name: "parent_folder_id",
        type: "uuid",
        nullable: true,
        references: "folder(id)",
      },
      { name: "name", type: "text" },
      { name: "depth", type: "smallint", default: "0" },
    ],
    indexes: [
      { name: "idx_folder_project", columns: ["project_id"] },
      { name: "idx_folder_parent", columns: ["parent_folder_id"] },
    ],
  },
  {
    name: "video",
    tenantScoped: true,
    primaryKey: ["id"],
    columns: [
      idPk,
      orgIdColumn,
      {
        name: "folder_id",
        type: "uuid",
        nullable: true,
        references: "folder(id)",
      },
      { name: "title", type: "text" },
      { name: "duration_seconds", type: "integer", default: "0" },
      { name: "status", type: "text", default: "'uploading'" },
      { name: "source_object_key", type: "text", nullable: true },
      { name: "developer_mode", type: "boolean", default: "false" },
      { name: "created_at", type: "timestamptz", default: "now()" },
    ],
    indexes: [
      { name: "idx_video_org", columns: [ORGANIZATION_ID_COLUMN] },
      { name: "idx_video_folder", columns: ["folder_id"] },
    ],
  },
  {
    name: "rendition",
    tenantScoped: false,
    primaryKey: ["id"],
    columns: [
      idPk,
      { name: "video_id", type: "uuid", references: "video(id)" },
      { name: "quality", type: "text" },
      { name: "object_key", type: "text" },
      { name: "bitrate", type: "integer" },
    ],
    indexes: [{ name: "idx_rendition_video", columns: ["video_id"] }],
  },
  {
    name: "asset",
    tenantScoped: false,
    primaryKey: ["id"],
    columns: [
      idPk,
      {
        name: "video_id",
        type: "uuid",
        nullable: true,
        references: "video(id)",
      },
      {
        name: "folder_id",
        type: "uuid",
        nullable: true,
        references: "folder(id)",
      },
      { name: "type", type: "text" },
      { name: "object_key_or_body", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz", default: "now()" },
    ],
    indexes: [
      { name: "idx_asset_video", columns: ["video_id"] },
      { name: "idx_asset_folder", columns: ["folder_id"] },
    ],
  },
  {
    name: "transcript",
    tenantScoped: false,
    primaryKey: ["id"],
    columns: [
      idPk,
      { name: "video_id", type: "uuid", references: "video(id)" },
      { name: "segments", type: "jsonb", default: "'[]'::jsonb" },
      { name: "indexed_at", type: "timestamptz", nullable: true },
    ],
    indexes: [{ name: "idx_transcript_video", columns: ["video_id"] }],
  },
  {
    name: "summary",
    tenantScoped: false,
    primaryKey: ["id"],
    columns: [
      idPk,
      { name: "video_id", type: "uuid", references: "video(id)" },
      { name: "body", type: "text" },
      { name: "source_plugin_id", type: "uuid" },
    ],
    indexes: [{ name: "idx_summary_video", columns: ["video_id"] }],
  },

  // ----- Collaboration -----------------------------------------------------
  {
    name: "comment",
    tenantScoped: false,
    primaryKey: ["id"],
    columns: [
      idPk,
      { name: "video_id", type: "uuid", references: "video(id)" },
      {
        name: "parent_comment_id",
        type: "uuid",
        nullable: true,
        references: "comment(id)",
      },
      { name: "author_id", type: "uuid", references: "member(id)" },
      { name: "body", type: "text" },
      { name: "timestamp_seconds", type: "integer", nullable: true },
      { name: "created_at", type: "timestamptz", default: "now()" },
    ],
    indexes: [
      { name: "idx_comment_video", columns: ["video_id"] },
      { name: "idx_comment_parent", columns: ["parent_comment_id"] },
    ],
  },
  {
    name: "reaction",
    tenantScoped: false,
    primaryKey: ["target_type", "target_id", "member_id", "type"],
    columns: [
      { name: "target_type", type: "text" },
      { name: "target_id", type: "uuid" },
      { name: "member_id", type: "uuid", references: "member(id)" },
      { name: "type", type: "text" },
    ],
    indexes: [{ name: "idx_reaction_target", columns: ["target_type", "target_id"] }],
  },
  {
    name: "notification",
    tenantScoped: false,
    primaryKey: ["id"],
    columns: [
      idPk,
      { name: "member_id", type: "uuid", references: "member(id)" },
      { name: "event_type", type: "text" },
      { name: "source_resource_id", type: "uuid" },
      { name: "created_at", type: "timestamptz", default: "now()" },
      { name: "read_at", type: "timestamptz", nullable: true },
      { name: "delivered_at", type: "timestamptz", nullable: true },
    ],
    indexes: [{ name: "idx_notification_member", columns: ["member_id"] }],
  },
  {
    name: "notification_preference",
    tenantScoped: false,
    primaryKey: ["member_id", "event_type"],
    columns: [
      { name: "member_id", type: "uuid", references: "member(id)" },
      { name: "event_type", type: "text" },
      { name: "enabled", type: "boolean", default: "true" },
    ],
    indexes: [],
  },

  // ----- Sharing & uploads -------------------------------------------------
  {
    name: "share_link",
    tenantScoped: false,
    primaryKey: ["id"],
    columns: [
      idPk,
      { name: "video_id", type: "uuid", references: "video(id)" },
      { name: "credential", type: "text" },
      { name: "expires_at", type: "timestamptz", nullable: true },
      { name: "passcode_hash", type: "text", nullable: true },
      { name: "revoked_at", type: "timestamptz", nullable: true },
      { name: "failed_attempts", type: "integer", default: "0" },
      { name: "locked_until", type: "timestamptz", nullable: true },
    ],
    indexes: [
      { name: "uq_share_link_credential", columns: ["credential"], unique: true },
      { name: "idx_share_link_video", columns: ["video_id"] },
    ],
  },
  {
    name: "upload_session",
    tenantScoped: true,
    primaryKey: ["id"],
    columns: [
      idPk,
      orgIdColumn,
      { name: "video_id", type: "uuid", references: "video(id)" },
      { name: "total_chunks", type: "integer" },
      { name: "acked_chunks", type: "integer", default: "0" },
      { name: "last_ack_at", type: "timestamptz", nullable: true },
      { name: "expires_at", type: "timestamptz" },
      { name: "status", type: "text", default: "'open'" },
    ],
    indexes: [
      { name: "idx_upload_session_org", columns: [ORGANIZATION_ID_COLUMN] },
      { name: "idx_upload_session_video", columns: ["video_id"] },
    ],
  },

  // ----- Governance & platform --------------------------------------------
  {
    name: "audit_entry",
    tenantScoped: true,
    primaryKey: ["id"],
    columns: [
      idPk,
      orgIdColumn,
      { name: "actor_id", type: "uuid" },
      { name: "action", type: "text" },
      { name: "target_id", type: "uuid" },
      { name: "at", type: "timestamptz", default: "now()" },
    ],
    indexes: [{ name: "idx_audit_entry_org", columns: [ORGANIZATION_ID_COLUMN] }],
  },
  {
    name: "api_key",
    tenantScoped: true,
    primaryKey: ["id"],
    columns: [
      idPk,
      orgIdColumn,
      { name: "name", type: "text" },
      { name: "secret_hash", type: "text" },
      { name: "permissions", type: "jsonb", default: "'[]'::jsonb" },
      { name: "created_at", type: "timestamptz", default: "now()" },
      { name: "revoked_at", type: "timestamptz", nullable: true },
    ],
    indexes: [{ name: "idx_api_key_org", columns: [ORGANIZATION_ID_COLUMN] }],
  },
  {
    name: "webhook",
    tenantScoped: true,
    primaryKey: ["id"],
    columns: [
      idPk,
      orgIdColumn,
      { name: "event_type", type: "text" },
      { name: "url", type: "text" },
      { name: "signing_secret", type: "text" },
      { name: "created_at", type: "timestamptz", default: "now()" },
    ],
    indexes: [{ name: "idx_webhook_org", columns: [ORGANIZATION_ID_COLUMN] }],
  },
  {
    name: "pull_request_link",
    tenantScoped: false,
    primaryKey: ["id"],
    columns: [
      idPk,
      { name: "video_id", type: "uuid", references: "video(id)" },
      { name: "plugin_id", type: "uuid" },
      { name: "pr_ref", type: "text" },
      { name: "created_at", type: "timestamptz", default: "now()" },
    ],
    indexes: [{ name: "idx_pull_request_link_video", columns: ["video_id"] }],
  },
  {
    name: "doc_link",
    tenantScoped: false,
    primaryKey: ["id"],
    columns: [
      idPk,
      { name: "video_id", type: "uuid", references: "video(id)" },
      { name: "url", type: "text" },
      { name: "created_at", type: "timestamptz", default: "now()" },
    ],
    indexes: [{ name: "idx_doc_link_video", columns: ["video_id"] }],
  },
  {
    name: "view_event",
    tenantScoped: true,
    primaryKey: ["id"],
    columns: [
      idPk,
      orgIdColumn,
      { name: "video_id", type: "uuid", references: "video(id)" },
      { name: "member_id", type: "uuid", references: "member(id)" },
      { name: "at", type: "timestamptz", default: "now()" },
    ],
    indexes: [
      { name: "idx_view_event_org", columns: [ORGANIZATION_ID_COLUMN] },
      { name: "idx_view_event_video", columns: ["video_id"] },
    ],
  },
  {
    name: "plugin",
    tenantScoped: false,
    primaryKey: ["id"],
    columns: [
      idPk,
      { name: "type", type: "text" },
      { name: "enabled", type: "boolean", default: "false" },
      { name: "config", type: "jsonb", default: "'{}'::jsonb" },
      { name: "load_state", type: "text", default: "'disabled'" },
    ],
    indexes: [],
  },
];

/** Look up a table definition by name. */
export function getTable(name: string): TableDefinition | undefined {
  return SCHEMA.find((table) => table.name === name);
}

/** All tenant-scoped tables (those carrying `organization_id`). */
export function tenantScopedTables(): readonly TableDefinition[] {
  return SCHEMA.filter((table) => table.tenantScoped);
}

/** True when the table has a column named `organization_id`. */
export function hasOrganizationIdColumn(table: TableDefinition): boolean {
  return table.columns.some((c) => c.name === ORGANIZATION_ID_COLUMN);
}

/** True when the table has an index whose leading column is `organization_id`. */
export function hasOrganizationIdIndex(table: TableDefinition): boolean {
  return table.indexes.some((i) => i.columns[0] === ORGANIZATION_ID_COLUMN);
}

/** True when the table's primary key is a single UUID column. */
export function hasUuidPrimaryKey(table: TableDefinition): boolean {
  if (table.primaryKey.length === 0) return false;
  return table.primaryKey.every((pkName) => {
    const col = table.columns.find((c) => c.name === pkName);
    return col?.type === "uuid";
  });
}
