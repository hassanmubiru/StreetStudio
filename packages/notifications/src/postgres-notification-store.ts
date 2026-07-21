/**
 * Real PostgreSQL adapters for the {@link NotificationStore} and
 * {@link NotificationPreferenceStore} ports, composing the StreetJS `PgPool`
 * (de-seam onto real infrastructure). Satisfy the same ports the
 * in-memory/repository adapters do, so {@link NotificationService} runs
 * unchanged on real data. All queries are parameterized; DDL is idempotent.
 *
 * `save` is a real in-place `UPDATE` of the mutable timestamp columns
 * (`read_at`, `delivered_at`), preserving every other field and the record's
 * identity — recording a read (R12.3) or delivery (R12.5) stamp.
 */
import { PgPool } from "streetjs";
import type {
  NotificationPreferenceRecord,
  NotificationRecord,
} from "@streetstudio/database";
import type { IsoTimestamp, Uuid } from "@streetstudio/shared";
import type {
  NotificationPreferenceStore,
  NotificationStore,
} from "./notification-service.js";

type Row = Record<string, string | null>;
const iso = (v: string | null): IsoTimestamp | null =>
  v === null ? null : (new Date(v).toISOString() as IsoTimestamp);

export const NOTIFICATIONS_TABLES_DDL = `
CREATE TABLE IF NOT EXISTS notifications (
  id                 UUID PRIMARY KEY,
  member_id          UUID        NOT NULL,
  event_type         TEXT        NOT NULL,
  source_resource_id UUID        NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL,
  read_at            TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS notifications_member_idx ON notifications (member_id);
CREATE TABLE IF NOT EXISTS notification_preferences (
  member_id  UUID    NOT NULL,
  event_type TEXT    NOT NULL,
  enabled    BOOLEAN NOT NULL,
  PRIMARY KEY (member_id, event_type)
);
`;

/** Create the notifications schema (notifications + notification_preferences). */
export async function ensureNotificationsSchema(pool: PgPool): Promise<void> {
  await pool.query(NOTIFICATIONS_TABLES_DDL);
}

function mapNotification(row: Row): NotificationRecord {
  return {
    id: row["id"] as Uuid,
    memberId: row["member_id"] as Uuid,
    eventType: row["event_type"] as string,
    sourceResourceId: row["source_resource_id"] as Uuid,
    createdAt: iso(row["created_at"] as string) as IsoTimestamp,
    readAt: iso(row["read_at"] ?? null),
    deliveredAt: iso(row["delivered_at"] ?? null),
  };
}

/** A {@link NotificationStore} backed by real PostgreSQL. */
export function postgresNotificationStore(pool: PgPool): NotificationStore {
  return {
    async insert(record: NotificationRecord): Promise<NotificationRecord> {
      await pool.query(
        `INSERT INTO notifications (id, member_id, event_type, source_resource_id, created_at, read_at, delivered_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          record.id,
          record.memberId,
          record.eventType,
          record.sourceResourceId,
          record.createdAt,
          record.readAt,
          record.deliveredAt,
        ],
      );
      return record;
    },
    async findById(id: Uuid): Promise<NotificationRecord | null> {
      const { rows } = await pool.query(`SELECT * FROM notifications WHERE id = $1`, [id]);
      const row = rows[0] as Row | undefined;
      return row ? mapNotification(row) : null;
    },
    async listByMember(memberId: Uuid): Promise<NotificationRecord[]> {
      const { rows } = await pool.query(
        `SELECT * FROM notifications WHERE member_id = $1 ORDER BY created_at ASC, id ASC`,
        [memberId],
      );
      return (rows as Row[]).map(mapNotification);
    },
    async save(record: NotificationRecord): Promise<NotificationRecord> {
      await pool.query(
        `UPDATE notifications SET read_at = $1, delivered_at = $2 WHERE id = $3`,
        [record.readAt, record.deliveredAt, record.id],
      );
      return record;
    },
  };
}

/** A {@link NotificationPreferenceStore} backed by real PostgreSQL. */
export function postgresNotificationPreferenceStore(
  pool: PgPool,
): NotificationPreferenceStore {
  return {
    async listByMember(memberId: Uuid): Promise<NotificationPreferenceRecord[]> {
      const { rows } = await pool.query(
        `SELECT member_id, event_type, enabled FROM notification_preferences WHERE member_id = $1`,
        [memberId],
      );
      return (rows as Row[]).map((r) => ({
        memberId: r["member_id"] as Uuid,
        eventType: r["event_type"] as string,
        enabled: r["enabled"] === "t" || r["enabled"] === "true",
      }));
    },
  };
}
