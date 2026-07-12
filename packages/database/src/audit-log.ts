/**
 * The append-only Audit Log.
 *
 * The Audit Log is the durable, immutable record of every security-relevant and
 * administrative action taken against an Organization (Requirement 17). It is
 * built on top of the storage primitives defined in this package:
 *
 *  - {@link AppendOnlyTenantRepository} provides the only sanctioned persistence
 *    path — an `insert` plus organization-scoped reads, with no update or delete
 *    method (R17.2, R17.6).
 *  - {@link auditImmutableClient} wraps the underlying {@link SqlClient} so the
 *    *storage layer itself* rejects any `UPDATE`/`DELETE`/`TRUNCATE` aimed at the
 *    audit table, returning an immutability error even if a mutation statement is
 *    somehow issued out of band (R17.2, R17.6).
 *
 * The service surface is deliberately tiny: {@link AuditLog.append} records an
 * entry and {@link AuditLog.query} reads an Organization's entries newest-first.
 * There is no method that can modify or remove an existing entry.
 *
 * Authorization (only an Administrator of the target Organization may read the
 * log — R17.3, R17.5) is enforced by the calling layer (`@streetstudio/auth`
 * and the API service), which threads an authenticated context in front of
 * {@link AuditLog.query}. This package intentionally depends only on
 * `@streetstudio/shared`/`@streetstudio/config`, so it has no notion of roles;
 * what it guarantees here is that a query is always scoped to a single
 * Organization and can never disclose another tenant's entries.
 */
import { AppError, type IsoTimestamp, type Uuid } from "@streetstudio/shared";
import { newUuid } from "./ids.js";
import type { AuditEntryRecord } from "./records.js";
import { AppendOnlyTenantRepository } from "./repositories.js";
import type { SqlClient, SqlValue } from "./sql.js";

/** The physical table backing the Audit Log. */
const AUDIT_TABLE = "audit_entry";

/**
 * The categories of action that MUST be recorded in the Audit Log (R17.4).
 * `action` on an entry is a free-form string so callers can record specific
 * action names, but every recorded action falls under one of these categories.
 */
export const AUDIT_ACTION_CATEGORIES = [
  "authentication", // sign-in, sign-out, token issuance/revocation (R17.4)
  "authorization_denial", // deny-by-default access refusals (R17.4)
  "sharing_change", // share-link creation/revocation/expiry changes (R17.4)
  "administrative_action", // org/role/settings administration (R17.4, R26.7)
] as const;

/** One of the security-relevant action categories tracked by the Audit Log. */
export type AuditActionCategory = (typeof AUDIT_ACTION_CATEGORIES)[number];

/**
 * Input to {@link AuditLog.append}. Mirrors the design's `AuditLog.append`
 * shape ({ actor, action, targetId, orgId, at }) while using the identifier
 * types from `@streetstudio/shared`.
 */
export interface AuditAppendInput {
  /** Identity of the actor responsible for the action. */
  readonly actor: Uuid;
  /** The action performed (e.g. an authentication event or admin action). */
  readonly action: string;
  /** Identifier of the resource the action targeted. */
  readonly targetId: Uuid;
  /** The Organization the entry belongs to (tenant scope). */
  readonly orgId: Uuid;
  /**
   * When the action occurred. Defaults to the current time. Recorded as a UTC
   * timestamp with at least millisecond precision (R17.1).
   */
  readonly at?: Date;
}

/**
 * Convert an instant to a UTC, millisecond-precision ISO-8601 timestamp.
 *
 * `Date.prototype.toISOString` always renders in UTC (`...Z`) with exactly
 * millisecond precision, satisfying R17.1. An invalid `Date` is rejected rather
 * than allowed to serialize to `"Invalid Date"`.
 */
export function toAuditTimestamp(at: Date): IsoTimestamp {
  if (Number.isNaN(at.getTime())) {
    throw new AppError("VALIDATION_FAILED", {
      details: { field: "at", reason: "invalid audit timestamp" },
    });
  }
  return at.toISOString();
}

/**
 * True when `sql` is a statement that would modify or remove rows in the audit
 * table. The repositories only ever emit `INSERT`/`SELECT` here; anything that
 * updates, deletes, or truncates the audit table is a mutation attempt.
 */
function isAuditMutation(sql: string): boolean {
  const trimmed = sql.trim();
  return (
    /^update\s+audit_entry\b/i.test(trimmed) ||
    /^delete\s+from\s+audit_entry\b/i.test(trimmed) ||
    /^truncate\b[\s\S]*\baudit_entry\b/i.test(trimmed)
  );
}

/**
 * Wrap a {@link SqlClient} so the storage layer rejects any attempt to modify
 * or delete audit rows, returning an immutability error and leaving existing
 * entries unchanged (R17.2, R17.6). Reads and appends pass through unchanged.
 */
export function auditImmutableClient(client: SqlClient): SqlClient {
  return {
    async query<TRow extends Readonly<Record<string, unknown>>>(
      text: string,
      params?: readonly SqlValue[],
    ) {
      if (isAuditMutation(text)) {
        throw new AppError("CONFLICT", {
          details: {
            table: AUDIT_TABLE,
            reason: "Audit_Log entries are immutable (append-only).",
          },
        });
      }
      return client.query<TRow>(text, params);
    },
  };
}

/**
 * The append-only Audit Log service.
 *
 * Exposes exactly two operations — {@link append} and {@link query}. No update
 * or delete path exists, so an entry can never be modified or removed through
 * this service (R17.2, R17.6).
 */
export class AuditLog {
  constructor(
    private readonly entries: AppendOnlyTenantRepository<AuditEntryRecord>,
  ) {}

  /**
   * Append an audit entry recording the actor, action, target resource, and a
   * UTC millisecond-precision timestamp, scoped to the Organization (R17.1).
   * Persistence is a single synchronous insert, well within the 5-second bound.
   */
  async append(input: AuditAppendInput): Promise<void> {
    const record: AuditEntryRecord = {
      id: newUuid(),
      organizationId: input.orgId,
      actorId: input.actor,
      action: input.action,
      targetId: input.targetId,
      at: toAuditTimestamp(input.at ?? new Date()),
    };
    await this.entries.insert(record);
  }

  /**
   * Return the Organization's audit entries ordered by timestamp descending
   * (newest first). The result is strictly scoped to `orgId`, so entries
   * belonging to any other Organization are excluded (R17.3).
   *
   * Ordering is enforced here in addition to the repository's `ORDER BY` so the
   * descending guarantee holds regardless of the backing client's ordering
   * behavior. ISO-8601 UTC timestamps sort lexicographically in chronological
   * order, so a string comparison yields the correct newest-first order.
   */
  async query(orgId: Uuid): Promise<AuditEntryRecord[]> {
    const rows = await this.entries.listByOrganization(orgId);
    return [...rows].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }
}

/**
 * Build an {@link AuditLog} bound to a {@link SqlClient}. The client is wrapped
 * with {@link auditImmutableClient} so the storage layer rejects mutation of
 * audit rows, then an {@link AppendOnlyTenantRepository} over the audit table is
 * created for the service to use.
 */
export function createAuditLog(client: SqlClient): AuditLog {
  const guarded = auditImmutableClient(client);
  const entries = new AppendOnlyTenantRepository<AuditEntryRecord>(
    guarded,
    AUDIT_TABLE,
  );
  return new AuditLog(entries);
}
