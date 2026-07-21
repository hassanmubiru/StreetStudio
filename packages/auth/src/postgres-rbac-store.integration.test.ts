import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PgPool } from "streetjs";
import { AppError } from "@streetstudio/shared";
import { RbacAccessControl, ROLE_MANAGEMENT_PERMISSION } from "./access-control.js";
import { ensureRbacSchema, postgresRbacStore } from "./postgres-rbac-store.js";

/**
 * Auth de-seam (ADR-0020): the deny-by-default {@link RbacAccessControl}
 * evaluator running on the REAL PostgreSQL RBAC store. Runs when
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

suite("RBAC on real Postgres (deny-by-default)", () => {
  let pool: PgPool;
  const org = randomUUID();
  const otherOrg = randomUUID();
  const admin = randomUUID();
  const viewer = randomUUID();
  const stranger = randomUUID();
  const adminRoleId = randomUUID();
  const viewerRoleId = randomUUID();

  const now = () => new Date().toISOString();

  async function seedRole(id: string, orgId: string, name: string, permissions: string[]) {
    await pool.query(
      `INSERT INTO roles (id, organization_id, name, permissions) VALUES ($1, $2, $3, $4::jsonb)`,
      [id, orgId, name, JSON.stringify(permissions)],
    );
  }
  async function seedMembership(orgId: string, memberId: string, roleId: string) {
    await pool.query(
      `INSERT INTO memberships (id, organization_id, member_id, role_id, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), orgId, memberId, roleId, now()],
    );
  }

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureRbacSchema(pool);
    for (const o of [org, otherOrg]) {
      await pool.query(`DELETE FROM memberships WHERE organization_id = $1`, [o]);
      await pool.query(`DELETE FROM roles WHERE organization_id = $1`, [o]);
    }
    await seedRole(adminRoleId, org, "Administrator", [ROLE_MANAGEMENT_PERMISSION, "video:read", "project:create"]);
    await seedRole(viewerRoleId, org, "Viewer", ["video:read"]);
    await seedMembership(org, admin, adminRoleId);
    await seedMembership(org, viewer, viewerRoleId);
  });

  afterAll(async () => {
    if (pool) {
      for (const o of [org, otherOrg]) {
        await pool.query(`DELETE FROM memberships WHERE organization_id = $1`, [o]);
        await pool.query(`DELETE FROM roles WHERE organization_id = $1`, [o]);
      }
      await pool.close();
    }
  });

  it("grants only actions the member's role includes; denies otherwise", async () => {
    const rbac = new RbacAccessControl({ store: postgresRbacStore(pool) });
    expect(await rbac.can({ memberId: admin }, "video:read", { organizationId: org })).toBe(true);
    expect(await rbac.can({ memberId: viewer }, "video:read", { organizationId: org })).toBe(true);
    // deny-by-default: viewer lacks project:create
    expect(await rbac.can({ memberId: viewer }, "project:create", { organizationId: org })).toBe(false);
    // non-member is denied
    expect(await rbac.can({ memberId: stranger }, "video:read", { organizationId: org })).toBe(false);
    // no cross-org leakage: admin here has no membership in otherOrg
    expect(await rbac.can({ memberId: admin }, "video:read", { organizationId: otherOrg })).toBe(false);
  });

  it("assignRole is permission-gated and membership-checked", async () => {
    const rbac = new RbacAccessControl({ store: postgresRbacStore(pool) });

    // Admin (has org:manage_roles) promotes the viewer to Administrator.
    await rbac.assignRole({ memberId: admin }, org, viewer, "Administrator");
    expect(await rbac.can({ memberId: viewer }, "project:create", { organizationId: org })).toBe(true);

    // A non-manager (now-demoted? no — stranger, not a member) cannot assign.
    await expect(
      rbac.assignRole({ memberId: stranger }, org, viewer, "Viewer"),
    ).rejects.toBeInstanceOf(AppError);

    // Assigning to a non-member is rejected with no change.
    await expect(
      rbac.assignRole({ memberId: admin }, org, stranger, "Viewer"),
    ).rejects.toBeInstanceOf(AppError);
  });
});
