import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PgPool } from "streetjs";
import {
  AuthService,
  Argon2idPasswordHasher,
  HmacAccessTokenIssuer,
  ensureAuthSchema,
  postgresAuthStores,
} from "@streetstudio/auth";
import { authServiceAuthenticator } from "./auth-service-authenticator.js";
import type { ApiRequest } from "../http/lifecycle.js";

/**
 * Auth de-seam (ADR-0020): the API lifecycle's authenticate stage runs on the
 * REAL `AuthService` backed by REAL PostgreSQL stores. A member registered and
 * logged in through the real auth core gets a real token that the API
 * authenticator verifies; missing/garbage/post-logout tokens are rejected.
 * Runs when `STREETSTUDIO_IT_DATABASE_URL` is set; skips otherwise.
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

const req = (credential?: string): ApiRequest => ({
  method: "GET",
  path: "/organizations",
  clientKey: "test",
  ...(credential !== undefined ? { credential } : {}),
});

suite("API authenticator over the real AuthService (real Postgres)", () => {
  let pool: PgPool;
  let auth: AuthService;
  const email = `api-auth-${randomUUID()}@example.com`;
  const password = "a-strong-password-123";

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureAuthSchema(pool);
    await pool.query(`DELETE FROM members WHERE email = $1`, [email]);
    auth = new AuthService({
      stores: postgresAuthStores(pool),
      passwordHasher: new Argon2idPasswordHasher(),
      tokenIssuer: new HmacAccessTokenIssuer("api-integration-secret-at-least-32-chars!!"),
    });
    await auth.register({ email, password });
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(`DELETE FROM members WHERE email = $1`, [email]);
      await pool.close();
    }
  });

  it("authenticates a real token and resolves the member principal", async () => {
    const { accessToken } = await auth.login({ email, password });
    const authenticator = authServiceAuthenticator(auth);

    const status = await authenticator.authenticate(req(accessToken));
    expect(status.kind).toBe("authenticated");
    if (status.kind === "authenticated") {
      expect((status.principal as { memberId: string }).memberId).toBeTruthy();
    }
  });

  it("reports unauthenticated (no credential) and invalid (garbage token)", async () => {
    const authenticator = authServiceAuthenticator(auth);
    expect((await authenticator.authenticate(req())).kind).toBe("unauthenticated");
    expect((await authenticator.authenticate(req("not-a-real-token"))).kind).toBe("invalid");
  });

  it("treats a token as invalid after its session is logged out", async () => {
    const { accessToken, sessionId } = await auth.login({ email, password });
    const authenticator = authServiceAuthenticator(auth);
    expect((await authenticator.authenticate(req(accessToken))).kind).toBe("authenticated");

    await auth.logout(sessionId);
    expect((await authenticator.authenticate(req(accessToken))).kind).toBe("invalid");
  });
});
