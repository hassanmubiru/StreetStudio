import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PgPool } from "streetjs";
import { AppError } from "@streetstudio/shared";
import type { AuthContext } from "@streetstudio/auth";
import { OrgService } from "../application/org-service.js";
import { ensureOrganizationsSchema, postgresOrgStore } from "../infrastructure/postgres-org-store.js";

/**
 * De-seam (ADR-0020 pattern): the real {@link OrgService} running on the real
 * PostgreSQL {@link OrgStore} — organizations, roles, memberships, invitations
 * on real infrastructure (sharing the roles/memberships tables with the auth
 * RBAC store). Runs when `STREETSTUDIO_IT_DATABASE_URL` is set; skips otherwise.
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

suite("OrgService on real Postgres store", () => {
  let pool: PgPool;
  let svc: OrgService;
  const creator = randomUUID();
  const invitee = randomUUID();
  const stranger = randomUUID();
  let orgId: string;

  const actor = (memberId: string): AuthContext => ({ memberId });

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureOrganizationsSchema(pool);
    svc = new OrgService({ store: postgresOrgStore(pool) });
  });

  afterAll(async () => {
    if (pool && orgId) {
      for (const t of ["invitations", "memberships", "roles", "organizations"]) {
        await pool.query(`DELETE FROM ${t} WHERE ${t === "organizations" ? "id" : "organization_id"} = $1`, [orgId]);
      }
      await pool.close();
    } else if (pool) {
      await pool.close();
    }
  });

  it("creates an org (creator = Administrator) and enforces cross-org access", async () => {
    const org = await svc.createOrg(actor(creator), "Acme");
    orgId = org.id;
    expect(org.name).toBe("Acme");

    // The creator is a member (Administrator) of the new org.
    const store = postgresOrgStore(pool);
    expect(await store.findMembership(orgId, creator)).not.toBeNull();

    // A non-member cannot invite into the org (R4.6).
    await expect(svc.invite(actor(stranger), orgId, "x@example.com")).rejects.toBeInstanceOf(AppError);
  });

  it("invites and accepts, creating a real membership", async () => {
    const invitation = await svc.invite(actor(creator), orgId, "invitee@example.com");
    expect(invitation.status).toBe("pending");

    const membership = await svc.acceptInvitation(invitation.token, invitee);
    expect(membership.organizationId).toBe(orgId);
    expect(membership.memberId).toBe(invitee);

    const store = postgresOrgStore(pool);
    expect(await store.findMembership(orgId, invitee)).not.toBeNull();
  });

  it("removes a member (revoking access) but retains the last administrator", async () => {
    await svc.removeMember(actor(creator), orgId, invitee);
    const store = postgresOrgStore(pool);
    expect(await store.findMembership(orgId, invitee)).toBeNull();

    // Removing the only remaining Administrator is refused (R26.6).
    await expect(svc.removeMember(actor(creator), orgId, creator)).rejects.toBeInstanceOf(AppError);
    expect(await store.findMembership(orgId, creator)).not.toBeNull();
  });
});
