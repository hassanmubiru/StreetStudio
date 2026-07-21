/**
 * Identity persistence schema — real PostgreSQL DDL via the StreetJS `PgPool`.
 * Idempotent; the email is unique (case-insensitive via normalized storage).
 */
import { PgPool } from "streetjs";

export const MEMBERS_TABLE_DDL = `
-- Shared member store of record (also used by @streetstudio/auth's Postgres
-- store). password_hash is nullable to support federated members that have no
-- local password; @streetstudio/identity always sets one on registration.
CREATE TABLE IF NOT EXISTS members (
  id            UUID PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT,
  created_at    TIMESTAMPTZ NOT NULL
);
`;

export async function ensureIdentitySchema(pool: PgPool): Promise<void> {
  await pool.query(MEMBERS_TABLE_DDL);
}
