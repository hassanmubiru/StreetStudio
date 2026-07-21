import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PgPool } from "streetjs";
import { AppError } from "@streetstudio/shared";
import { ROLE_MANAGEMENT_PERMISSION } from "@streetstudio/auth";
import { assemblePostgresAuth, ensureApiAuthSchema } from "../security/postgres-auth.js";
import { createApiService, type HandlerResolver } from "./composition-root.js";
import { PUBLIC_OPERATIONS, type PublicOperation } from "./operations.js";
import type { ApiRequest, AuditEvent, AuditSink } from "./lifecycle.js";
import { RateLimiter } from "../security/rate-limiter.js";

/**
 * Auth de-seam (ADR-0020): the concrete, config-driven `assemblePostgresAuth`
 * wiring drives BOTH lifecycle stages — authenticate (real `AuthService` token
 * verification) and RBAC (real deny-by-default evaluator) — against real
 * PostgreSQL, through the real `createApiService`. Runs when
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

suite("apps/api real Postgres auth assembly (authenticate + RBAC)", () => {
  const JWT_SECRET = "assembly-integration-secret-at-least-32-chars";
  let pool: PgPool;
  const org = randomUUID();
  const email = `assembly-${randomUUID()}@example.com`;
  const password = "a-strong-password-123";
  const audits: AuditEvent[] = [];
  const projectsCreate = PUBLIC_OPERATIONS.find((o) => o.id === "projects.create") as PublicOperation;

  let auth: ReturnType<typeof assemblePostgresAuth>;
  let memberId: string;
  let token: string;

  function makeService() {
    const handlers: HandlerResolver = { resolve: () => async () => ({ ok: true }) };
    const auditSink: AuditSink = { record: (e) => void audits.push(e) };
    return createApiService({
      container: { resolve: () => undefined, has: () => true },
      handlers,
      rateLimiter: new RateLimiter({ limit: 1_000_000 }),
      authenticator: auth.authenticator,
      accessControl: auth.accessControl,
      auditSink,
      operations: [projectsCreate],
    });
  }

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureApiAuthSchema(pool);
    await pool.query(`DELETE FROM members WHERE email = $1`, [email]);
    await pool.query(`DELETE FROM memberships WHERE organization_id = $1`, [org]);
    await pool.query(`DELETE FROM roles WHERE organization_id = $1`, [org]);

    auth = assemblePostgresAuth(pool, JWT_SECRET);

    // Register a real member through the real auth core, then grant a role.
    const member = await auth.authService.register({ email, password });
    memberId = member.id;
    const roleId = randomUUID();
    await pool.query(
      `INSERT INTO roles (id, organization_id, name, permissions) VALUES ($1, $2, $3, $4::jsonb)`,
      [roleId, org, "Administrator", JSON.stringify([ROLE_MANAGEMENT_PERMISSION, "project:create"])],
    );
    await pool.query(
      `INSERT INTO memberships (id, organization_id, member_id, role_id, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), org, memberId, roleId, new Date().toISOString()],
    );

    token = (await auth.authService.login({ email, password })).accessToken;
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(`DELETE FROM memberships WHERE organization_id = $1`, [org]);
      await pool.query(`DELETE FROM roles WHERE organization_id = $1`, [org]);
      await pool.query(`DELETE FROM members WHERE email = $1`, [email]);
      await pool.close();
    }
  });

  const request = (credential: string | undefined): ApiRequest => ({
    method: "POST",
    path: "/projects",
    clientKey: credential ?? "anon",
    ...(credential !== undefined ? { credential } : {}),
    organizationId: org,
    body: { name: "New project" },
  });

  it("authenticates the real token and authorizes via the member's real role", async () => {
    const svc = makeService();
    const result = await svc.router.dispatch(request(token));
    expect(result).toEqual({ ok: true });
  });

  it("rejects an unauthenticated request at the authenticate stage", async () => {
    const svc = makeService();
    await expect(svc.router.dispatch(request(undefined))).rejects.toBeInstanceOf(AppError);
  });

  it("denies an authenticated member lacking the role (no membership) at the RBAC stage", async () => {
    // A different real member with no membership in this org.
    const other = `assembly-other-${randomUUID()}@example.com`;
    await auth.authService.register({ email: other, password });
    const otherToken = (await auth.authService.login({ email: other, password })).accessToken;
    audits.length = 0;
    const svc = makeService();
    await expect(svc.router.dispatch(request(otherToken))).rejects.toBeInstanceOf(AppError);
    expect(audits.some((e) => e.outcome === "authorization_denied")).toBe(true);
    await pool.query(`DELETE FROM members WHERE email = $1`, [other]);
  });
});
