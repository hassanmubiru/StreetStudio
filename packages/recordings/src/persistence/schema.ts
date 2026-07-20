/**
 * Recordings persistence schema. Real PostgreSQL DDL executed through the
 * StreetJS `PgPool`. Idempotent so it is safe to run on startup and in tests.
 */
import { PgPool } from "streetjs";

/** DDL for the `recordings` table. Additive and idempotent. */
export const RECORDINGS_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS recordings (
  id              UUID PRIMARY KEY,
  organization_id UUID        NOT NULL,
  owner_id        UUID        NOT NULL,
  title           TEXT        NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  status          TEXT        NOT NULL CHECK (status IN ('draft','published','archived')),
  created_at      TIMESTAMPTZ NOT NULL,
  published_at    TIMESTAMPTZ,
  archived_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS recordings_org_created_idx
  ON recordings (organization_id, created_at DESC);
`;

/** Create the recordings schema if it does not yet exist. */
export async function ensureRecordingsSchema(pool: PgPool): Promise<void> {
  await pool.query(RECORDINGS_TABLE_DDL);
}
