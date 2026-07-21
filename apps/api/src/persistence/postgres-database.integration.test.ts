import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PgPool } from "streetjs";
import { newUuid } from "@streetstudio/database";
import type { MemberRecord, SessionRecord } from "@streetstudio/database";
import {
  assemblePostgresRepositories,
  ensureCanonicalSchema,
  streetPgPoolClient,
} from "./postgres-database.js";

/**
 * Store-of-record convergence (ADR-0021, step 1/2): prove the **single
 * canonical schema** (`packages/database` `runMigrations`) builds on the real
 * Postgres and that the `SqlClient` repository layer — wired to a real
 * StreetJS `PgPool` at the composition root — round-trips real entities through
 * the canonical singular, FK-constrained tables. This is the real
 * store-of-record path domain services will be repointed onto. Runs when
 * `STREETSTUDIO_IT_DATABASE_URL` is set; skips otherwise.
 */
const DATABASE_URL = process.env["STREETSTUDIO_IT_DATABASE_URL"];
const suite = DATABASE_URL ? describe : describe.skip;

function poolOptions(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || "5432"),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    maxConnections: 4,
  };
}

const iso = () => new Date().toISOString() as MemberRecord["createdAt"];

suite("Canonical Postgres persistence (store of record)", () => {
  let pool: PgPool;
  const memberId = newUuid();
  const sessionId = newUuid();

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureCanonicalSchema(pool);
  });

  afterAll(async () => {
    if (pool) {
      // Deleting the member cascades the FK-owned session row.
      await pool.query(`DELETE FROM member WHERE id = $1`, [memberId]).catch(() => {});
      await pool.close();
    }
  });

  it("applies the canonical schema and is idempotent on a second run", async () => {
    // A second run applies nothing new — the migration is already recorded.
    const rerun = await ensureCanonicalSchema(pool);
    expect(rerun.skipped).toContain("0001");
    expect(rerun.applied).not.toContain("0001");

    // The canonical singular tables exist (spot-check a representative set).
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [["member", "session", "organization", "video", "comment", "notification"]],
    );
    const names = (rows as Array<{ table_name: string }>).map((r) => r.table_name).sort();
    expect(names).toEqual([
      "comment",
      "member",
      "notification",
      "organization",
      "session",
      "video",
    ]);
  });

  it("round-trips entities through the canonical repository layer on real Postgres", async () => {
    const repos = assemblePostgresRepositories(pool);

    const member: MemberRecord = {
      id: memberId,
      email: `conv-${memberId}@example.com`,
      passwordHash: null,
      createdAt: iso(),
    };
    await repos.members.insert(member);
    const found = await repos.members.findById(memberId);
    expect(found?.email).toBe(member.email);

    // A session references the member via a real FK.
    const session: SessionRecord = {
      id: sessionId,
      memberId,
      issuedAt: iso(),
      expiresAt: iso(),
      revokedAt: null,
    };
    await repos.sessions.insert(session);
    expect((await repos.sessions.findById(sessionId))?.memberId).toBe(memberId);
  });

  it("enforces real foreign keys (an orphan session is rejected)", async () => {
    const client = streetPgPoolClient(pool);
    await expect(
      client.query(
        `INSERT INTO session (id, member_id, issued_at, expires_at) VALUES ($1, $2, now(), now())`,
        [newUuid(), newUuid()],
      ),
    ).rejects.toBeTruthy();
  });
});
