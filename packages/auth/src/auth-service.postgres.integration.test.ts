import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PgPool } from "streetjs";
import { AppError } from "@streetstudio/shared";
import { AuthService } from "./service.js";
import { Argon2idPasswordHasher } from "./password-hasher.js";
import { HmacAccessTokenIssuer } from "./tokens.js";
import { ensureAuthSchema, postgresAuthStores } from "./postgres-stores.js";

/**
 * Auth de-seam step 2 (ADR-0020): the REAL {@link AuthService} core wired to the
 * REAL PostgreSQL stores + Argon2id hasher + HMAC token issuer, exercised
 * end-to-end (register → login → verify → logout) against a real database. This
 * proves the authentication core runs on real infrastructure, not seams. Runs
 * when `STREETSTUDIO_IT_DATABASE_URL` is set; skips otherwise.
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

suite("AuthService on real Postgres stores (end-to-end)", () => {
  let pool: PgPool;
  let auth: AuthService;
  const email = `authsvc-${randomUUID()}@example.com`;
  const password = "a-strong-password-123";

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureAuthSchema(pool);
    await pool.query(`DELETE FROM members WHERE email = $1`, [email]);
    auth = new AuthService({
      stores: postgresAuthStores(pool),
      passwordHasher: new Argon2idPasswordHasher(),
      tokenIssuer: new HmacAccessTokenIssuer("integration-secret-at-least-32-characters!!"),
    });
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(`DELETE FROM members WHERE email = $1`, [email]);
      await pool.close();
    }
  });

  it("registers, then rejects a duplicate registration uniformly", async () => {
    const member = await auth.register({ email, password });
    expect(member.email).toBe(email);
    await expect(auth.register({ email, password })).rejects.toBeInstanceOf(AppError);
  });

  it("logs in, verifies the token, then rejects it after logout", async () => {
    const result = await auth.login({ email, password });
    expect(result.accessToken).toBeTruthy();

    const ctx = await auth.verifyAccessToken(result.accessToken);
    expect(ctx.sessionId).toBe(result.sessionId);

    await auth.logout(result.sessionId);
    await expect(auth.verifyAccessToken(result.accessToken)).rejects.toBeInstanceOf(AppError);
  });

  it("rejects a wrong password uniformly", async () => {
    await expect(auth.login({ email, password: "wrong-password-xx" })).rejects.toBeInstanceOf(AppError);
  });
});
