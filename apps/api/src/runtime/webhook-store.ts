/**
 * PostgreSQL-backed {@link WebhookStore} over the canonical `webhook` table.
 *
 * The webhooks service lives in `apps/api` (it is the API_Service's own
 * outbound-subscription surface) and defines a narrow {@link WebhookStore}
 * port; this composition-root adapter binds it to the same `pg` client the
 * rest of the runtime uses, over the `webhook` table created by the database
 * package's canonical migrations (`id, organization_id, event_type, url,
 * signing_secret, created_at`), which carries an FK to `organization`.
 */
import type { IsoTimestamp, Uuid } from "@streetstudio/shared";
import type { WebhookRecord, WebhookStore } from "../webhooks/index.js";
import type { PgClient } from "./pg-client.js";

interface WebhookRow {
  readonly id: string;
  readonly organization_id: string;
  readonly event_type: string;
  readonly url: string;
  readonly signing_secret: string;
  readonly created_at: string;
}

function mapRow(row: WebhookRow): WebhookRecord {
  return {
    id: row.id as Uuid,
    organizationId: row.organization_id as Uuid,
    eventType: row.event_type,
    url: row.url,
    signingSecret: row.signing_secret,
    createdAt: new Date(row.created_at).toISOString() as IsoTimestamp,
  };
}

/** Build a pg-backed {@link WebhookStore}. */
export function pgWebhookStore(pg: PgClient): WebhookStore {
  return {
    async create(record: WebhookRecord): Promise<WebhookRecord> {
      await pg.query(
        `INSERT INTO webhook (id, organization_id, event_type, url, signing_secret, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          record.id,
          record.organizationId,
          record.eventType,
          record.url,
          record.signingSecret,
          record.createdAt,
        ],
      );
      return record;
    },
    async findById(
      organizationId: Uuid,
      id: Uuid,
    ): Promise<WebhookRecord | null> {
      const { rows } = await pg.query<WebhookRow>(
        `SELECT * FROM webhook WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      const row = rows[0];
      return row ? mapRow(row) : null;
    },
    async listByEvent(
      organizationId: Uuid,
      eventType: string,
    ): Promise<WebhookRecord[]> {
      const { rows } = await pg.query<WebhookRow>(
        `SELECT * FROM webhook WHERE organization_id = $1 AND event_type = $2 ORDER BY created_at ASC`,
        [organizationId, eventType],
      );
      return rows.map(mapRow);
    },
    async listByOrganization(organizationId: Uuid): Promise<WebhookRecord[]> {
      const { rows } = await pg.query<WebhookRow>(
        `SELECT * FROM webhook WHERE organization_id = $1 ORDER BY created_at ASC`,
        [organizationId],
      );
      return rows.map(mapRow);
    },
    async deleteById(organizationId: Uuid, id: Uuid): Promise<void> {
      await pg.query(`DELETE FROM webhook WHERE organization_id = $1 AND id = $2`, [
        organizationId,
        id,
      ]);
    },
  };
}
