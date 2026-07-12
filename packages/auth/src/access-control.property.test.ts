import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { MembershipRecord, RoleRecord } from "@streetstudio/database";
import type { Uuid } from "@streetstudio/shared";
import {
  RbacAccessControl,
  ROLE_MANAGEMENT_PERMISSION,
  type RbacStore,
} from "./access-control.js";
import type { AuthContext } from "./service.js";

/**
 * Property 51: Role assignment governs subsequent decisions.
 *
 * Feature: streetstudio, Property 51: Role assignment governs subsequent decisions
 *
 * Validates: Requirements 16.2, 26.3
 *
 * After an authorized actor (a Member holding the role-management permission in
 * the organization) assigns a NEW Role to a target Member of that organization,
 * subsequent {@link RbacAccessControl.can} decisions for that Member must
 * reflect the NEW Role's permissions in the assigned scope:
 *
 *  - Every action the NEW Role grants is permitted.
 *  - Every action that only the OLD Role granted (and the new one does not) is
 *    no longer permitted (deny-by-default once the old role no longer applies).
 *
 * This exercises the same guarantee the sanity test asserts for a single fixed
 * example, but across arbitrary permission sets, role names, and identifiers.
 */

/* -------------------------------------------------------------------------
 * In-memory RBAC store (logic-only; no database).
 * ---------------------------------------------------------------------- */

class InMemoryRbacStore implements RbacStore {
  readonly memberships = new Map<Uuid, MembershipRecord>();
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

const ctx = (memberId: Uuid): AuthContext => ({ memberId });

// A fixed action vocabulary so that OLD and NEW permission sets can meaningfully
// overlap or diverge. ROLE_MANAGEMENT_PERMISSION is deliberately excluded here
// so the target member's own permissions never accidentally include it.
const ACTION_POOL = [
  "video:read",
  "video:write",
  "video:delete",
  "project:read",
  "project:write",
  "doc:read",
  "doc:write",
] as const;

const actionSet = fc.uniqueArray(fc.constantFrom(...ACTION_POOL), {
  minLength: 0,
  maxLength: ACTION_POOL.length,
});

describe("Property 51: Role assignment governs subsequent decisions", () => {
  it("subsequent can() decisions reflect the newly assigned role's permissions", async () => {
    await fc.assert(
      fc.asyncProperty(
        actionSet, // permissions granted by the OLD role
        actionSet, // permissions granted by the NEW role
        fc.string({ minLength: 1, maxLength: 12 }), // OLD role name
        fc.string({ minLength: 1, maxLength: 12 }), // NEW role name
        async (oldPerms, newPerms, oldName, newNameRaw) => {
          // Role names must be distinct within the organization.
          fc.pre(oldName !== newNameRaw);
          const newName = newNameRaw;

          const org = "org" as Uuid;
          const adminRoleId = "role-admin" as Uuid;
          const oldRoleId = "role-old" as Uuid;
          const newRoleId = "role-new" as Uuid;
          const admin = "member-admin" as Uuid;
          const target = "member-target" as Uuid;

          const store = new InMemoryRbacStore();

          // Admin role: can manage roles (authorized actor).
          store.roles.set(adminRoleId, {
            id: adminRoleId,
            organizationId: org,
            name: "Administrator",
            permissions: [ROLE_MANAGEMENT_PERMISSION],
          });
          // Old role assigned to the target before reassignment.
          store.roles.set(oldRoleId, {
            id: oldRoleId,
            organizationId: org,
            name: oldName,
            permissions: [...oldPerms],
          });
          // New role that will be assigned.
          store.roles.set(newRoleId, {
            id: newRoleId,
            organizationId: org,
            name: newName,
            permissions: [...newPerms],
          });

          store.memberships.set("mship-admin" as Uuid, {
            id: "mship-admin" as Uuid,
            organizationId: org,
            memberId: admin,
            roleId: adminRoleId,
            createdAt: "2024-01-01T00:00:00.000Z" as never,
          });
          store.memberships.set("mship-target" as Uuid, {
            id: "mship-target" as Uuid,
            organizationId: org,
            memberId: target,
            roleId: oldRoleId,
            createdAt: "2024-01-01T00:00:00.000Z" as never,
          });

          const rbac = new RbacAccessControl({ store });

          // Authorized actor assigns the NEW role to the target member.
          await rbac.assignRole(ctx(admin), org, target, newName);

          // Every action the NEW role grants is now permitted.
          for (const action of newPerms) {
            expect(
              await rbac.can(ctx(target), action, { organizationId: org }),
            ).toBe(true);
          }

          // Every action that only the OLD role granted is no longer permitted.
          const newSet = new Set<string>(newPerms);
          for (const action of oldPerms) {
            if (!newSet.has(action)) {
              expect(
                await rbac.can(ctx(target), action, { organizationId: org }),
              ).toBe(false);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
