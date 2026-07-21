/**
 * Typed repositories over the StreetStudio schema.
 *
 * Repositories are the only sanctioned way to read and write persisted state.
 * They are generic over the entity record type and bind to a {@link SqlClient}
 * (a StreetJS PostgreSQL client adapted via `streetSqlClient`, or any
 * structurally compatible client). Three shapes are provided:
 *
 *  - {@link GlobalRepository}: entity keyed by a single UUID `id`, not scoped to
 *    a tenant (e.g. Member, Session, Folder).
 *  - {@link TenantRepository}: entity keyed by `id` and carrying
 *    `organizationId`; every read/write is constrained to a single
 *    organization, enforcing tenant isolation.
 *  - {@link AppendOnlyTenantRepository}: like {@link TenantRepository} but with
 *    no update/delete path (e.g. the audit log).
 *
 * Association tables with composite keys use small bespoke repositories.
 *
 * Column mapping is mechanical: record fields are the camelCase form of the
 * snake_case columns, so no per-entity mapping tables are required.
 */
import type { Uuid } from "@streetstudio/shared";
import type { SqlClient, SqlRow, SqlValue } from "./sql.js";
import { ORGANIZATION_ID_COLUMN, getTable, type SqlColumnType } from "./schema.js";
import type {
  ApiKeyRecord,
  AssetRecord,
  AuditEntryRecord,
  CommentRecord,
  DocLinkRecord,
  FolderRecord,
  InvitationRecord,
  MemberRecord,
  MembershipRecord,
  NotificationPreferenceRecord,
  NotificationRecord,
  OrganizationRecord,
  PluginRecord,
  ProjectRecord,
  PullRequestLinkRecord,
  ReactionRecord,
  RenditionRecord,
  RoleRecord,
  SessionRecord,
  ShareLinkRecord,
  SummaryRecord,
  TeamMembershipRecord,
  TeamRecord,
  TranscriptRecord,
  UploadSessionRecord,
  VideoRecord,
  ViewEventRecord,
  WebhookRecord,
  WorkspaceRecord,
} from "./records.js";

/* --------------------------------------------------------------------------
 * Column-name mapping and query building
 * ------------------------------------------------------------------------ */

/** Convert a camelCase field name to its snake_case column name. */
export function toColumnName(field: string): string {
  return field.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
}

/** Convert a snake_case column name to its camelCase field name. */
export function toFieldName(column: string): string {
  return column.replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

/**
 * Coerce a raw column value to the JS type its {@link SqlColumnType} implies.
 *
 * SQL drivers differ in how they represent values on the wire: the StreetJS
 * `PgPool` driver returns `boolean` columns as `"t"`/`"f"` strings, may return
 * numeric columns as strings, and may return `jsonb` as an unparsed string,
 * whereas the in-memory test client returns native JS types. This coercion
 * normalizes both to the record field types, and is a **no-op** when the value
 * is already the correct JS type — so it is safe for both the real driver and
 * the in-memory client. `null` is preserved.
 */
function coerceValue(type: SqlColumnType | undefined, value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  switch (type) {
    case "boolean":
      if (typeof value === "boolean") return value;
      return value === "t" || value === "true" || value === "1" || value === 1;
    case "integer":
    case "smallint":
    case "bigint":
      return typeof value === "number" ? value : Number(value);
    case "jsonb":
      return typeof value === "string" ? (JSON.parse(value) as unknown) : value;
    case "timestamptz":
      // Normalize a driver-returned Date to an ISO string (records carry
      // IsoTimestamp strings); leave already-string values untouched.
      return value instanceof Date ? value.toISOString() : value;
    default:
      // uuid / text / citext and any unknown type pass through unchanged.
      return value;
  }
}

/**
 * Map a raw row (snake_case columns) into a camelCase record, coercing each
 * column to the JS type implied by the table's schema when `table` is known.
 */
function mapRow<TRecord>(row: SqlRow, table?: string): TRecord {
  const definition = table === undefined ? undefined : getTable(table);
  const out: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    const columnType = definition?.columns.find((c) => c.name === column)?.type;
    out[toFieldName(column)] = coerceValue(columnType, value);
  }
  return out as TRecord;
}

/** Split a record into aligned column names and bind values. */
function toColumnsAndValues(record: Record<string, unknown>): {
  columns: string[];
  values: SqlValue[];
} {
  const columns: string[] = [];
  const values: SqlValue[] = [];
  for (const [field, value] of Object.entries(record)) {
    columns.push(toColumnName(field));
    values.push(value as SqlValue);
  }
  return { columns, values };
}

/* --------------------------------------------------------------------------
 * Base repositories
 * ------------------------------------------------------------------------ */

/** Shared insert/mapping behavior for all repositories. */
class BaseRepository<TRecord extends object> {
  constructor(
    protected readonly client: SqlClient,
    protected readonly table: string,
  ) {}

  /** Insert a fully-populated record and return it unchanged. */
  async insert(record: TRecord): Promise<TRecord> {
    const { columns, values } = toColumnsAndValues(
      record as Record<string, unknown>,
    );
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    await this.client.query(
      `INSERT INTO ${this.table} (${columns.join(", ")}) VALUES (${placeholders.join(
        ", ",
      )})`,
      values,
    );
    return record;
  }

  protected map(row: SqlRow): TRecord {
    return mapRow<TRecord>(row, this.table);
  }
}

/** Repository for a single-UUID-keyed entity that is not tenant-scoped. */
export class GlobalRepository<
  TRecord extends { id: Uuid },
> extends BaseRepository<TRecord> {
  /** Find a row by its primary key, or null when absent. */
  async findById(id: Uuid): Promise<TRecord | null> {
    const result = await this.client.query(
      `SELECT * FROM ${this.table} WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? this.map(row) : null;
  }

  /** Return every row (unfiltered). Intended for small/global tables. */
  async list(): Promise<TRecord[]> {
    const result = await this.client.query(`SELECT * FROM ${this.table}`);
    return result.rows.map((row) => this.map(row));
  }

  /** Delete a row by its primary key. */
  async deleteById(id: Uuid): Promise<void> {
    await this.client.query(`DELETE FROM ${this.table} WHERE id = $1`, [id]);
  }

  /**
   * Update a row in place by its primary key, setting every non-`id` column
   * from `record`. Unlike a delete-then-insert soft update, this preserves the
   * row's identity so foreign keys referencing it (and their `ON DELETE
   * CASCADE` children) are never disturbed.
   */
  async update(record: TRecord): Promise<TRecord> {
    const entries = Object.entries(record as Record<string, unknown>).filter(
      ([field]) => toColumnName(field) !== "id",
    );
    const assignments = entries.map(
      ([field], i) => `${toColumnName(field)} = $${i + 1}`,
    );
    const values = entries.map(([, value]) => value as SqlValue);
    await this.client.query(
      `UPDATE ${this.table} SET ${assignments.join(", ")} WHERE id = $${
        values.length + 1
      }`,
      [...values, (record as { id: Uuid }).id],
    );
    return record;
  }
}

/**
 * Repository for a tenant-scoped entity. Every operation is constrained to a
 * single `organizationId`, so a caller can never read or mutate another
 * tenant's rows through this repository — enforcing organization isolation
 * (Requirement 2.5 data model; supports R4.6, R16.4).
 */
export class TenantRepository<
  TRecord extends { id: Uuid; organizationId: Uuid },
> extends BaseRepository<TRecord> {
  /** Find a row by id, scoped to the organization. */
  async findById(
    organizationId: Uuid,
    id: Uuid,
  ): Promise<TRecord | null> {
    const result = await this.client.query(
      `SELECT * FROM ${this.table} WHERE organization_id = $1 AND id = $2`,
      [organizationId, id],
    );
    const row = result.rows[0];
    return row ? this.map(row) : null;
  }

  /**
   * Find a row by its primary key without constraining the organization, then
   * expose its owning `organizationId` to the caller.
   *
   * Tenant reads normally go through {@link findById}, which requires the
   * organization up front. A few operations, however, resolve a resource from a
   * globally-unique id supplied by the caller (e.g. assigning a Member to a Team
   * by team id) and only then know which organization owns it — at which point
   * the caller authorizes the request against that owning organization
   * (Requirement 4.6). This method serves exactly that "resolve, then authorize
   * in the owning scope" pattern; it performs no authorization itself, so
   * callers MUST check the returned record's `organizationId` before acting.
   */
  async findByIdUnscoped(id: Uuid): Promise<TRecord | null> {
    const result = await this.client.query(
      `SELECT * FROM ${this.table} WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? this.map(row) : null;
  }

  /** List every row owned by the organization. */
  async listByOrganization(organizationId: Uuid): Promise<TRecord[]> {
    const result = await this.client.query(
      `SELECT * FROM ${this.table} WHERE organization_id = $1`,
      [organizationId],
    );
    return result.rows.map((row) => this.map(row));
  }

  /** Delete a row by id, scoped to the organization. */
  async deleteById(organizationId: Uuid, id: Uuid): Promise<void> {
    await this.client.query(
      `DELETE FROM ${this.table} WHERE organization_id = $1 AND id = $2`,
      [organizationId, id],
    );
  }

  /**
   * Update a row in place, scoped to its organization, setting every column
   * other than `id`/`organization_id` from `record`. Preserves the row's
   * identity so FK children (`ON DELETE CASCADE`) are never disturbed — unlike a
   * delete-then-insert soft update.
   */
  async update(record: TRecord): Promise<TRecord> {
    const entries = Object.entries(record as Record<string, unknown>).filter(
      ([field]) => {
        const column = toColumnName(field);
        return column !== "id" && column !== ORGANIZATION_ID_COLUMN;
      },
    );
    const assignments = entries.map(
      ([field], i) => `${toColumnName(field)} = $${i + 1}`,
    );
    const values = entries.map(([, value]) => value as SqlValue);
    await this.client.query(
      `UPDATE ${this.table} SET ${assignments.join(", ")} WHERE organization_id = $${
        values.length + 1
      } AND id = $${values.length + 2}`,
      [...values, record.organizationId, record.id],
    );
    return record;
  }
}

/**
 * Tenant-scoped, append-only repository. Exposes insert and reads but no
 * update or delete path, matching the audit log's immutability (R17.1, R17.2).
 */
export class AppendOnlyTenantRepository<
  TRecord extends { id: Uuid; organizationId: Uuid },
> extends BaseRepository<TRecord> {
  /** Find an entry by id, scoped to the organization. */
  async findById(organizationId: Uuid, id: Uuid): Promise<TRecord | null> {
    const result = await this.client.query(
      `SELECT * FROM ${this.table} WHERE organization_id = $1 AND id = $2`,
      [organizationId, id],
    );
    const row = result.rows[0];
    return row ? this.map(row) : null;
  }

  /** List entries for the organization, most recent first. */
  async listByOrganization(organizationId: Uuid): Promise<TRecord[]> {
    const result = await this.client.query(
      `SELECT * FROM ${this.table} WHERE organization_id = $1 ORDER BY at DESC`,
      [organizationId],
    );
    return result.rows.map((row) => this.map(row));
  }
}

/* --------------------------------------------------------------------------
 * Association-table repositories (composite keys)
 * ------------------------------------------------------------------------ */

/** Team membership join table (team_id, member_id). */
export class TeamMembershipRepository extends BaseRepository<TeamMembershipRecord> {
  async listByTeam(teamId: Uuid): Promise<TeamMembershipRecord[]> {
    const result = await this.client.query(
      `SELECT * FROM team_membership WHERE team_id = $1`,
      [teamId],
    );
    return result.rows.map((row) => this.map(row));
  }

  async listByMember(memberId: Uuid): Promise<TeamMembershipRecord[]> {
    const result = await this.client.query(
      `SELECT * FROM team_membership WHERE member_id = $1`,
      [memberId],
    );
    return result.rows.map((row) => this.map(row));
  }

  async remove(teamId: Uuid, memberId: Uuid): Promise<void> {
    await this.client.query(
      `DELETE FROM team_membership WHERE team_id = $1 AND member_id = $2`,
      [teamId, memberId],
    );
  }
}

/** Reaction table with composite natural key. */
export class ReactionRepository extends BaseRepository<ReactionRecord> {
  async listByTarget(
    targetType: ReactionRecord["targetType"],
    targetId: Uuid,
  ): Promise<ReactionRecord[]> {
    const result = await this.client.query(
      `SELECT * FROM reaction WHERE target_type = $1 AND target_id = $2`,
      [targetType, targetId],
    );
    return result.rows.map((row) => this.map(row));
  }

  async remove(reaction: ReactionRecord): Promise<void> {
    await this.client.query(
      `DELETE FROM reaction WHERE target_type = $1 AND target_id = $2 AND member_id = $3 AND type = $4`,
      [reaction.targetType, reaction.targetId, reaction.memberId, reaction.type],
    );
  }
}

/** Per-member notification preferences (member_id, event_type). */
export class NotificationPreferenceRepository extends BaseRepository<NotificationPreferenceRecord> {
  async listByMember(
    memberId: Uuid,
  ): Promise<NotificationPreferenceRecord[]> {
    const result = await this.client.query(
      `SELECT * FROM notification_preference WHERE member_id = $1`,
      [memberId],
    );
    return result.rows.map((row) => this.map(row));
  }

  /** Insert or update a member's preference for an event type. */
  async upsert(
    preference: NotificationPreferenceRecord,
  ): Promise<NotificationPreferenceRecord> {
    await this.client.query(
      `INSERT INTO notification_preference (member_id, event_type, enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (member_id, event_type)
       DO UPDATE SET enabled = EXCLUDED.enabled`,
      [preference.memberId, preference.eventType, preference.enabled],
    );
    return preference;
  }
}

/* --------------------------------------------------------------------------
 * Repository set + factory
 * ------------------------------------------------------------------------ */

/** The complete set of repositories, one handle per entity. */
export interface Repositories {
  readonly members: GlobalRepository<MemberRecord>;
  readonly sessions: GlobalRepository<SessionRecord>;
  readonly organizations: GlobalRepository<OrganizationRecord>;
  readonly roles: TenantRepository<RoleRecord>;
  readonly memberships: TenantRepository<MembershipRecord>;
  readonly teams: TenantRepository<TeamRecord>;
  readonly teamMemberships: TeamMembershipRepository;
  readonly invitations: TenantRepository<InvitationRecord>;
  readonly workspaces: TenantRepository<WorkspaceRecord>;
  readonly projects: TenantRepository<ProjectRecord>;
  readonly folders: GlobalRepository<FolderRecord>;
  readonly videos: TenantRepository<VideoRecord>;
  readonly renditions: GlobalRepository<RenditionRecord>;
  readonly assets: GlobalRepository<AssetRecord>;
  readonly transcripts: GlobalRepository<TranscriptRecord>;
  readonly summaries: GlobalRepository<SummaryRecord>;
  readonly comments: GlobalRepository<CommentRecord>;
  readonly reactions: ReactionRepository;
  readonly notifications: GlobalRepository<NotificationRecord>;
  readonly notificationPreferences: NotificationPreferenceRepository;
  readonly shareLinks: GlobalRepository<ShareLinkRecord>;
  readonly uploadSessions: TenantRepository<UploadSessionRecord>;
  readonly auditEntries: AppendOnlyTenantRepository<AuditEntryRecord>;
  readonly apiKeys: TenantRepository<ApiKeyRecord>;
  readonly webhooks: TenantRepository<WebhookRecord>;
  readonly pullRequestLinks: GlobalRepository<PullRequestLinkRecord>;
  readonly docLinks: GlobalRepository<DocLinkRecord>;
  readonly viewEvents: TenantRepository<ViewEventRecord>;
  readonly plugins: GlobalRepository<PluginRecord>;
}

/**
 * Build the full set of typed repositories bound to a {@link SqlClient}. The
 * client is typically a StreetJS PostgreSQL client adapted with
 * `streetSqlClient` and wired in by the composition root via StreetJS DI.
 */
export function createRepositories(client: SqlClient): Repositories {
  return {
    members: new GlobalRepository<MemberRecord>(client, "member"),
    sessions: new GlobalRepository<SessionRecord>(client, "session"),
    organizations: new GlobalRepository<OrganizationRecord>(
      client,
      "organization",
    ),
    roles: new TenantRepository<RoleRecord>(client, "role"),
    memberships: new TenantRepository<MembershipRecord>(client, "membership"),
    teams: new TenantRepository<TeamRecord>(client, "team"),
    teamMemberships: new TeamMembershipRepository(client, "team_membership"),
    invitations: new TenantRepository<InvitationRecord>(client, "invitation"),
    workspaces: new TenantRepository<WorkspaceRecord>(client, "workspace"),
    projects: new TenantRepository<ProjectRecord>(client, "project"),
    folders: new GlobalRepository<FolderRecord>(client, "folder"),
    videos: new TenantRepository<VideoRecord>(client, "video"),
    renditions: new GlobalRepository<RenditionRecord>(client, "rendition"),
    assets: new GlobalRepository<AssetRecord>(client, "asset"),
    transcripts: new GlobalRepository<TranscriptRecord>(client, "transcript"),
    summaries: new GlobalRepository<SummaryRecord>(client, "summary"),
    comments: new GlobalRepository<CommentRecord>(client, "comment"),
    reactions: new ReactionRepository(client, "reaction"),
    notifications: new GlobalRepository<NotificationRecord>(
      client,
      "notification",
    ),
    notificationPreferences: new NotificationPreferenceRepository(
      client,
      "notification_preference",
    ),
    shareLinks: new GlobalRepository<ShareLinkRecord>(client, "share_link"),
    uploadSessions: new TenantRepository<UploadSessionRecord>(
      client,
      "upload_session",
    ),
    auditEntries: new AppendOnlyTenantRepository<AuditEntryRecord>(
      client,
      "audit_entry",
    ),
    apiKeys: new TenantRepository<ApiKeyRecord>(client, "api_key"),
    webhooks: new TenantRepository<WebhookRecord>(client, "webhook"),
    pullRequestLinks: new GlobalRepository<PullRequestLinkRecord>(
      client,
      "pull_request_link",
    ),
    docLinks: new GlobalRepository<DocLinkRecord>(client, "doc_link"),
    viewEvents: new TenantRepository<ViewEventRecord>(client, "view_event"),
    plugins: new GlobalRepository<PluginRecord>(client, "plugin"),
  };
}
