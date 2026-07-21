import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PgPool } from "streetjs";
import { AppError } from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";
import {
  RbacAccessControl,
  ROLE_MANAGEMENT_PERMISSION,
  ensureRbacSchema,
  postgresRbacStore,
} from "@streetstudio/auth";
import { createApiService, type HandlerResolver } from "./composition-root.js";
import { PUBLIC_OPERATIONS, type PublicOperation } from "./operations.js";
import type { ApiRequest, AuditEvent, AuditSink, Authenticator } from "./lifecycle.js";
import type { AuthStatus } from "../security/auth-required.js";
import { RateLimiter } from "../security/rate-limiter.js";

/**
 * Auth de-seam (ADR-0020): the API request lifecycle's RBAC stage running on the
 * REAL deny-by-default `RbacAccessControl` backed by REAL PostgreSQL. A member
 * whose role grants `project:create` is allowed through the full lifecycle; a
 * member whose role lacks it is denied with `AUTHORIZATION_DENIED` and the
 * denial is audited — no service runs. Runs when `STREETSTUDIO_IT_DATABASE_URL`
 * is set; skips otherwise.
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

/** Minimal authenticator: a bearer token is taken to be the member id. The
 *  authenticate stage is proven separately; this test isolates the RBAC stage. */
function tokenIsMemberIdAuthenticator(): Authenticator {
  return {
    async authenticate(request: ApiRequest): Promise<AuthStatus> {
      const token = request.credential;
      if (!token) return { kind: "unauthenticated" };
      return { kind: "authenticated", principal: { memberId: token as Uuid } };
    },
  };
}

suite("API RBAC lifecycle stage on real Postgres (deny-by-default)", () => {
  let pool: PgPool;
  const org = randomUUID();
  const admin = randomUUID();
  const viewer = randomUUID();
  const audits: AuditEvent[] = [];
  const projectsCreate = PUBLIC_OPERATIONS.find((o) => o.id === "projects.create") as PublicOperation;

  async function seedRole(id: string, name: string, permissions: string[]) {
    await pool.query(
      `INSERT INTO roles (id, organization_id, name, permissions) VALUES ($1, $2, $3, $4::jsonb)`,
      [id, org, name, JSON.stringify(permissions)],
    );
  }
  async function seedMembership(memberId: string, roleId: string) {
    await pool.query(
      `INSERT INTO memberships (id, organization_id, member_id, role_id, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), org, memberId, roleId, new Date().toISOString()],
    );
  }

  function makeService() {
    const handlers: HandlerResolver = { resolve: () => async () => ({ ok: true }) };
    const auditSink: AuditSink = { record: (e) => void audits.push(e) };
    return createApiService({
      container: { resolve: () => undefined, has: () => true },
      handlers,
      rateLimiter: new RateLimiter({ limit: 1_000_000 }),
      authenticator: tokenIsMemberIdAuthenticator(),
      accessControl: new RbacAccessControl({ store: postgresRbacStore(pool) }),
      auditSink,
      operations: [projectsCreate],
    });
  }

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureRbacSchema(pool);
    await pool.query(`DELETE FROM memberships WHERE organization_id = $1`, [org]);
    await pool.query(`DELETE FROM roles WHERE organization_id = $1`, [org]);
    const adminRole = randomUUID();
    const viewerRole = randomUUID();
    await seedRole(adminRole, "Administrator", [ROLE_MANAGEMENT_PERMISSION, "project:create", "project:read"]);
    await seedRole(viewerRole, "Viewer", ["project:read"]);
    await seedMembership(admin, adminRole);
    await seedMembership(viewer, viewerRole);
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(`DELETE FROM memberships WHERE organization_id = $1`, [org]);
      await pool.query(`DELETE FROM roles WHERE organization_id = $1`, [org]);
      await pool.close();
    }
  });

  const request = (memberId: string): ApiRequest => ({
    method: "POST",
    path: "/projects",
    clientKey: memberId,
    credential: memberId,
    organizationId: org,
    body: { name: "New project" },
  });

  it("allows a member whose role grants the action (RBAC passes → service runs)", async () => {
    const svc = makeService();
    const result = await svc.router.dispatch(request(admin));
    expect(result).toEqual({ ok: true });
  });

  it("denies a member whose role lacks the action, and audits the denial (no service runs)", async () => {
    const svc = makeService();
    audits.length = 0;
    await expect(svc.router.dispatch(request(viewer))).rejects.toBeInstanceOf(AppError);
    expect(audits.some((e) => e.outcome === "authorization_denied" && e.action === "project:create")).toBe(true);
  });
});
