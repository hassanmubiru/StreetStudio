/**
 * Real PostgreSQL adapters for the authentication persistence ports
 * ({@link MemberStore}, {@link SessionStore}), composing the StreetJS `PgPool`.
 *
 * This is the first step of the auth de-seam (ADR-0020): a production-grade
 * store implementation that satisfies the same ports the in-memory/repository
 * adapters do, without changing the {@link AuthService} core or existing
 * consumers. The member store reads/writes the **shared `members` table** (the
 * same one `@streetstudio/identity` owns) via an idempotent, compatible DDL, so
 * identity and auth converge on a single member store of record. Sessions use a
 * dedicated `auth_sessions` table.
 *
 * All queries are parameterized. `findByEmail` is a real indexed lookup (the
 * `members.email` column is UNIQUE), replacing the O(n) scan of the in-memory
 * adapter.
 */
import { PgPool } from "streetjs";
import type { MemberRecord, SessionRecord } from "@streetstudio/database";
import type { Uuid, IsoTimestamp } from "@streetstudio/shared";
import { normalizeEmail, type AuthStores, type MemberStore, type SessionStore } from "./stores.js";

type Row = Record<string, string | null>;

/** Idempotent DDL for the shared member store and the auth session table. */
export const AUTH_MEMBERS_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS members (
  id            UUID PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT,
  created_at    TIMESTAMPTZ NOT NULL
);
`;

export const AUTH_SESSIONS_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS auth_sessions (
  id         UUID PRIMARY KEY,
  member_id  UUID        NOT NULL,
  issued_at  TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS auth_sessions_member_idx ON auth_sessions (member_id);
`;

/** Create the auth persistence schema (members + auth_sessions). Idempotent. */
export async function ensureAuthSchema(pool: PgPool): Promise<void> {
  await pool.query(AUTH_MEMBERS_TABLE_DDL);
  await pool.query(AUTH_SESSIONS_TABLE_DDL);
}

const iso = (v: string): IsoTimestamp => new Date(v).toISOString() as IsoTimestamp;

function mapMember(row: Row): MemberRecord {
  return {
    id: row["id"] as Uuid,
    email: row["email"] as string,
    passwordHash: row["password_hash"],
    createdAt: iso(row["created_at"] as string),
  };
}

function mapSession(row: Row): SessionRecord {
  return {
    id: row["id"] as Uuid,
    memberId: row["member_id"] as Uuid,
    issuedAt: iso(row["issued_at"] as string),
    expiresAt: iso(row["expires_at"] as string),
    revokedAt: row["revoked_at"] === null ? null : iso(row["revoked_at"] as string),
  };
}

/** A {@link MemberStore} backed by real PostgreSQL (shared `members` table). */
export function postgresMemberStore(pool: PgPool): MemberStore {
  return {
    async findByEmail(email: string): Promise<MemberRecord | null> {
      const { rows } = await pool.query(`SELECT * FROM members WHERE email = $1`, [normalizeEmail(email)]);
      const row = rows[0] as Row | undefined;
      return row ? mapMember(row) : null;
    },
    async findById(id: Uuid): Promise<MemberRecord | null> {
      const { rows } = await pool.query(`SELECT * FROM members WHERE id = $1`, [id]);
      const row = rows[0] as Row | undefined;
      return row ? mapMember(row) : null;
    },
    async create(record: MemberRecord): Promise<MemberRecord> {
      await pool.query(
        `INSERT INTO members (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)`,
        [record.id, normalizeEmail(record.email), record.passwordHash, record.createdAt],
      );
      return record;
    },
  };
}

/**
 * A {@link SessionStore} backed by real PostgreSQL. `invalidate` deletes the
 * session row so {@link SessionStore.findById} returns null afterwards (matching
 * the repository adapter's contract; Requirement 3.4).
 */
export function postgresSessionStore(pool: PgPool): SessionStore {
  return {
    async create(record: SessionRecord): Promise<SessionRecord> {
      await pool.query(
        `INSERT INTO auth_sessions (id, member_id, issued_at, expires_at, revoked_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [record.id, record.memberId, record.issuedAt, record.expiresAt, record.revokedAt],
      );
      return record;
    },
    async findById(id: Uuid): Promise<SessionRecord | null> {
      const { rows } = await pool.query(`SELECT * FROM auth_sessions WHERE id = $1`, [id]);
      const row = rows[0] as Row | undefined;
      return row ? mapSession(row) : null;
    },
    async invalidate(id: Uuid): Promise<void> {
      await pool.query(`DELETE FROM auth_sessions WHERE id = $1`, [id]);
    },
  };
}

/** Build both real PostgreSQL-backed auth stores from a `PgPool`. */
export function postgresAuthStores(pool: PgPool): AuthStores {
  return { members: postgresMemberStore(pool), sessions: postgresSessionStore(pool) };
}
