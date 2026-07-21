/**
 * Uploads persistence schema. Real PostgreSQL DDL via the StreetJS `PgPool`,
 * idempotent for safe startup/test use.
 */
import { PgPool } from "streetjs";

export const UPLOAD_SESSIONS_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS upload_sessions (
  id              UUID PRIMARY KEY,
  organization_id UUID        NOT NULL,
  owner_id        UUID        NOT NULL,
  object_key      TEXT        NOT NULL,
  total_parts     INTEGER     NOT NULL CHECK (total_parts BETWEEN 1 AND 10000),
  received_parts  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  status          TEXT        NOT NULL CHECK (status IN ('pending','completed','aborted')),
  created_at      TIMESTAMPTZ NOT NULL,
  completed_at    TIMESTAMPTZ,
  aborted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS upload_sessions_org_idx
  ON upload_sessions (organization_id, created_at DESC);
`;

export async function ensureUploadsSchema(pool: PgPool): Promise<void> {
  await pool.query(UPLOAD_SESSIONS_TABLE_DDL);
}
