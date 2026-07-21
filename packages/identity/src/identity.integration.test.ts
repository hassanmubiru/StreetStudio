import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { PgPool, container, JwtService } from "streetjs";
import { ensureIdentitySchema } from "./persistence/schema.js";
import { createIdentityApp } from "./api/app.js";

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

suite("identity: register + login (real Postgres, real HTTP)", () => {
  const JWT_SECRET = "identity-integration-secret-at-least-32-chars";
  const email = `user-${randomUUID()}@example.com`;
  const password = "a-strong-password-123";
  let pool: PgPool;
  let app: ReturnType<typeof createIdentityApp>;
  let base: string;

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureIdentitySchema(pool);
    await pool.query(`DELETE FROM members WHERE email = $1`, [email]);

    app = createIdentityApp(pool, { jwtSecret: JWT_SECRET, port: 0, host: "127.0.0.1" });
    await app.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (pool) {
      await pool.query(`DELETE FROM members WHERE email = $1`, [email]);
      await pool.close();
    }
    container.reset();
  });

  const post = (path: string, body: unknown) =>
    fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("registers a member, rejecting duplicates and weak passwords", async () => {
    const res = await post("/auth/register", { email, password });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { member: { id: string; email: string; passwordHash?: string } };
    expect(body.member.email).toBe(email);
    expect(body.member.passwordHash).toBeUndefined();

    expect((await post("/auth/register", { email, password })).status).toBe(409);
    expect((await post("/auth/register", { email: `x-${randomUUID()}@e.com`, password: "short" })).status).toBe(400);
  });

  it("logs in with correct credentials and issues a verifiable JWT", async () => {
    const res = await post("/auth/login", { email, password });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; member: { id: string } };
    const payload = new JwtService(JWT_SECRET).verify(body.token);
    expect(payload?.sub).toBe(body.member.id);
    expect(payload?.email).toBe(email);
  });

  it("rejects wrong password and unknown email with 401 (non-disclosing)", async () => {
    expect((await post("/auth/login", { email, password: "wrong-password-xx" })).status).toBe(401);
    expect((await post("/auth/login", { email: `nobody-${randomUUID()}@e.com`, password })).status).toBe(401);
  });
});
