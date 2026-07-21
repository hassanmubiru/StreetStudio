import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PgPool } from "streetjs";
import type { MemberRecord, SessionRecord } from "@streetstudio/database";
import { ensureAuthSchema, postgresAuthStores } from "./postgres-stores.js";

/**
 * Integration test for the real PostgreSQL auth stores (ADR-0020 step 1).
 * Proves the Postgres adapters satisfy the same MemberStore/SessionStore ports
 * the in-memory adapters do, against a real database. Runs when
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

suite("auth Postgres stores (real database)", () => {
  let pool: PgPool;
  const email = `auth-${randomUUID()}@example.com`;
  const memberId = randomUUID();
  const sessionId = randomUUID();

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureAuthSchema(pool);
    await pool.query(`DELETE FROM members WHERE email = $1`, [email]);
    await pool.query(`DELETE FROM auth_sessions WHERE id = $1`, [sessionId]);
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(`DELETE FROM auth_sessions WHERE id = $1`, [sessionId]);
      await pool.query(`DELETE FROM members WHERE email = $1`, [email]);
      await pool.close();
    }
  });

  it("member store: create, indexed findByEmail, findById", async () => {
    const { members } = postgresAuthStores(pool);
    const record: MemberRecord = {
      id: memberId,
      email,
      passwordHash: "$argon2id$hash",
      createdAt: new Date().toISOString() as never,
    };
    await members.create(record);

    const byEmail = await members.findByEmail(email.toUpperCase()); // normalized lookup
    expect(byEmail?.id).toBe(memberId);
    const byId = await members.findById(memberId);
    expect(byId?.email).toBe(email);
    expect(await members.findByEmail(`missing-${randomUUID()}@e.com`)).toBeNull();
  });

  it("session store: create, findById, invalidate → null (R3.4)", async () => {
    const { sessions } = postgresAuthStores(pool);
    const record: SessionRecord = {
      id: sessionId,
      memberId,
      issuedAt: new Date().toISOString() as never,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString() as never,
      revokedAt: null,
    };
    await sessions.create(record);
    expect((await sessions.findById(sessionId))?.memberId).toBe(memberId);

    await sessions.invalidate(sessionId);
    expect(await sessions.findById(sessionId)).toBeNull();
    // Idempotent: invalidating an unknown/again session is a no-op.
    await sessions.invalidate(sessionId);
    await sessions.invalidate(randomUUID());
  });
});
