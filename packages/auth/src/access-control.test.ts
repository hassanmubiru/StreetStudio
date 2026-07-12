import { describe, it, expect, beforeEach } from "vitest";
import { AppError } from "@streetstudio/shared";
import type { MembershipRecord, RoleRecord } from "@streetstudio/database";
import type { Uuid } from "@streetstudio/shared";
import {
  RbacAccessControl,
  ROLE_MANAGEMENT_PERMISSION,
  type RbacStore,
} from "./access-control.js";
import type { AuthContext } from "./service.js";

/* -------------------------------------------------------------------------
 * In-memory RBAC store (logic-only; no database).
 * ---------------------------------------------------------------------- */

class InMemoryRbacStore implements RbacStore {
  /** membership id -> record */
  readonly memberships = new Map<Uuid, MembershipRecord>();
  /** role id -> record */
  readonly roles = new Map<Uuid, RoleRecord>();

  async findMembership(
    organizationId: Uuid,
    memberId: Uuid,
  ): Promise<MembershipRecord | null> {
    for (const m of this.memberships.values()) {
      if (m.organizationId === organizationId && m.memberId === memberId) {
        return m;
      }
    }
    return null;
  }
  async findRoleById(
    organizationId: Uuid,
    roleId: Uuid,
  ): Promise<RoleRecord | null> {
    const r = this.roles.get(roleId);
    return r && r.organizationId === organizationId ? r : null;
  }
  async findRoleByName(
    organizationId: Uuid,
    name: string,
  ): Promise<RoleRecord | null> {
    for (const r of this.roles.values()) {
      if (r.organizationId === organizationId && r.name === name) return r;
    }
    return null;
  }
  async setMembershipRole(
    membership: MembershipRecord,
    roleId: Uuid,
  ): Promise<void> {
    this.memberships.set(membership.id, { ...membership, roleId });
  }
}

const ORG_A = "org-a" as Uuid;
const ORG_B = "org-b" as Uuid;
const ADMIN_ROLE = "role-admin" as Uuid;
const VIEWER_ROLE = "role-viewer" as Uuid;
const ADMIN = "member-admin" as Uuid;
const VIEWER = "member-viewer" as Uuid;
const OUTSIDER = "member-outsider" as Uuid;

function ctx(memberId: Uuid): AuthContext {
  return { memberId };
}

describe("RbacAccessControl.can", () => {
  let store: InMemoryRbacStore;
  let rbac: RbacAccessControl;

  beforeEach(() => {
    store = new InMemoryRbacStore();
    store.roles.set(ADMIN_ROLE, {
      id: ADMIN_ROLE,
      organizationId: ORG_A,
      name: "Administrator",
      permissions: [ROLE_MANAGEMENT_PERMISSION, "video:read"],
    });
    store.roles.set(VIEWER_ROLE, {
      id: VIEWER_ROLE,
      organizationId: ORG_A,
      name: "Viewer",
      permissions: ["video:read"],
    });
    store.memberships.set("mship-admin" as Uuid, {
      id: "mship-admin" as Uuid,
      organizationId: ORG_A,
      memberId: ADMIN,
      roleId: ADMIN_ROLE,
      createdAt: "2024-01-01T00:00:00.000Z" as never,
    });
    store.memberships.set("mship-viewer" as Uuid, {
      id: "mship-viewer" as Uuid,
      organizationId: ORG_A,
      memberId: VIEWER,
      roleId: VIEWER_ROLE,
      createdAt: "2024-01-01T00:00:00.000Z" as never,
    });
    rbac = new RbacAccessControl({ store });
  });

  it("grants an action the member's role permits", async () => {
    expect(await rbac.can(ctx(VIEWER), "video:read", { organizationId: ORG_A }))
      .toBe(true);
  });

  it("denies an action the member's role does not permit (deny-by-default)", async () => {
    expect(
      await rbac.can(ctx(VIEWER), "video:delete", { organizationId: ORG_A }),
    ).toBe(false);
  });

  it("denies when the member has no membership in the owning organization", async () => {
    expect(
      await rbac.can(ctx(OUTSIDER), "video:read", { organizationId: ORG_A }),
    ).toBe(false);
  });

  it("does not leak permissions across organizations", async () => {
    // ADMIN has full permissions in ORG_A but no membership in ORG_B.
    expect(
      await rbac.can(ctx(ADMIN), "video:read", { organizationId: ORG_B }),
    ).toBe(false);
  });
});

describe("RbacAccessControl.assignRole", () => {
  let store: InMemoryRbacStore;
  let rbac: RbacAccessControl;

  beforeEach(() => {
    store = new InMemoryRbacStore();
    store.roles.set(ADMIN_ROLE, {
      id: ADMIN_ROLE,
      organizationId: ORG_A,
      name: "Administrator",
      permissions: [ROLE_MANAGEMENT_PERMISSION],
    });
    store.roles.set(VIEWER_ROLE, {
      id: VIEWER_ROLE,
      organizationId: ORG_A,
      name: "Viewer",
      permissions: ["video:read"],
    });
    store.memberships.set("mship-admin" as Uuid, {
      id: "mship-admin" as Uuid,
      organizationId: ORG_A,
      memberId: ADMIN,
      roleId: ADMIN_ROLE,
      createdAt: "2024-01-01T00:00:00.000Z" as never,
    });
    store.memberships.set("mship-viewer" as Uuid, {
      id: "mship-viewer" as Uuid,
      organizationId: ORG_A,
      memberId: VIEWER,
      roleId: VIEWER_ROLE,
      createdAt: "2024-01-01T00:00:00.000Z" as never,
    });
    rbac = new RbacAccessControl({ store });
  });

  it("applies a new role that governs subsequent decisions (R16.2/R26.3)", async () => {
    // Viewer cannot manage roles beforehand.
    expect(
      await rbac.can(ctx(VIEWER), ROLE_MANAGEMENT_PERMISSION, {
        organizationId: ORG_A,
      }),
    ).toBe(false);

    await rbac.assignRole(ctx(ADMIN), ORG_A, VIEWER, "Administrator");

    // After promotion the new role's permissions apply.
    expect(
      await rbac.can(ctx(VIEWER), ROLE_MANAGEMENT_PERMISSION, {
        organizationId: ORG_A,
      }),
    ).toBe(true);
  });

  it("denies a caller lacking role-management permission and changes nothing (R16.5)", async () => {
    await expect(
      rbac.assignRole(ctx(VIEWER), ORG_A, ADMIN, "Viewer"),
    ).rejects.toBeInstanceOf(AppError);
    // The admin's role is unchanged.
    expect(store.memberships.get("mship-admin" as Uuid)?.roleId).toBe(
      ADMIN_ROLE,
    );
  });

  it("rejects assigning a role to a non-member and makes no assignment (R16.6)", async () => {
    await expect(
      rbac.assignRole(ctx(ADMIN), ORG_A, OUTSIDER, "Viewer"),
    ).rejects.toBeInstanceOf(AppError);
    expect(await store.findMembership(ORG_A, OUTSIDER)).toBeNull();
  });
});
