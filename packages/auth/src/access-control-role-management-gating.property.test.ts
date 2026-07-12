import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { MembershipRecord, RoleRecord } from "@streetstudio/database";
import { AppError } from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";
import {
  RbacAccessControl,
  ROLE_MANAGEMENT_PERMISSION,
  type RbacStore,
} from "./access-control.js";
import type { AuthContext } from "./service.js";

/**
 * Property 53: Role management is permission-gated and membership-checked.
 *
 * Feature: streetstudio, Property 53: Role management is permission-gated and membership-checked
 *
 * Validates: Requirements 16.5, 16.6
 *
 * `assignRole(actor, org, target, role)` succeeds ONLY when BOTH hold:
 *
 *  - the actor holds the role-management permission in the target organization
 *    (R16.5) — i.e. the actor is a Member of that organization whose Role
 *    grants {@link ROLE_MANAGEMENT_PERMISSION}; AND
 *  - the target Member already belongs to that organization (R16.6).
 *
 * In every other case — the actor lacks the permission (not a member there, or
 * a member whose role does not grant it), or the target is not a member — the
 * request MUST be rejected (an error is thrown) and NO assignment is made: the
 * stored role assignments are left completely unchanged.
 *
 * The test drives arbitrary combinations of (actor-is-member,
 * actor-role-grants-management, target-is-member) and asserts the success/deny
 * outcome against an independent oracle, while snapshotting the full assignment
 * state before/after to prove nothing changed on any rejection.
 */

/* -------------------------------------------------------------------------
 * In-memory RBAC store (logic-only; no database). Records every mutation
 * through setMembershipRole so the test can detect any state change.
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

  /** A stable snapshot of all (membershipId -> roleId) assignments. */
  snapshot(): Record<string, Uuid> {
    const snap: Record<string, Uuid> = {};
    for (const m of this.memberships.values()) {
      snap[m.id] = m.roleId;
    }
    return snap;
  }
}

const ctx = (memberId: Uuid): AuthContext => ({ memberId });

const ISO = "2024-01-01T00:00:00.000Z" as never;

const ORG = "org" as Uuid;
const MANAGER_ROLE = "role-manager" as Uuid; // grants ROLE_MANAGEMENT_PERMISSION
const PLAIN_ROLE = "role-plain" as Uuid; // does NOT grant it
const TARGET_OLD_ROLE = "role-target-old" as Uuid;
const NEW_ROLE = "role-new" as Uuid; // the role to be assigned

const ACTOR = "member-actor" as Uuid;
const TARGET = "member-target" as Uuid;

const ACTOR_MSHIP = "mship-actor" as Uuid;
const TARGET_MSHIP = "mship-target" as Uuid;

describe("Feature: streetstudio, Property 53: Role management is permission-gated and membership-checked", () => {
  it("assignRole succeeds only when the actor is permitted AND the target is a member; otherwise rejects with no state change (R16.5, R16.6)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), // actorIsMember: does the actor belong to the org?
        fc.boolean(), // actorRoleGrantsManagement: does the actor's role grant it?
        fc.boolean(), // targetIsMember: does the target belong to the org?
        fc.string({ minLength: 1, maxLength: 16 }), // name of the new role to assign
        async (
          actorIsMember,
          actorRoleGrantsManagement,
          targetIsMember,
          newRoleName,
        ) => {
          // Keep the new role's name distinct from the seeded fixed names so
          // findRoleByName resolves it unambiguously.
          fc.pre(
            newRoleName !== "Manager" &&
              newRoleName !== "Plain" &&
              newRoleName !== "TargetOld",
          );

          const store = new InMemoryRbacStore();

          // Roles (organization-scoped). The new role always exists so that a
          // success outcome is gated purely on permission + membership.
          store.roles.set(MANAGER_ROLE, {
            id: MANAGER_ROLE,
            organizationId: ORG,
            name: "Manager",
            permissions: [ROLE_MANAGEMENT_PERMISSION],
          });
          store.roles.set(PLAIN_ROLE, {
            id: PLAIN_ROLE,
            organizationId: ORG,
            name: "Plain",
            permissions: ["video:read"],
          });
          store.roles.set(TARGET_OLD_ROLE, {
            id: TARGET_OLD_ROLE,
            organizationId: ORG,
            name: "TargetOld",
            permissions: ["video:read"],
          });
          store.roles.set(NEW_ROLE, {
            id: NEW_ROLE,
            organizationId: ORG,
            name: newRoleName,
            permissions: ["video:write"],
          });

          // Actor membership: present only when actorIsMember. Its role grants
          // management only when actorRoleGrantsManagement.
          if (actorIsMember) {
            store.memberships.set(ACTOR_MSHIP, {
              id: ACTOR_MSHIP,
              organizationId: ORG,
              memberId: ACTOR,
              roleId: actorRoleGrantsManagement ? MANAGER_ROLE : PLAIN_ROLE,
              createdAt: ISO,
            });
          }

          // Target membership: present only when targetIsMember.
          if (targetIsMember) {
            store.memberships.set(TARGET_MSHIP, {
              id: TARGET_MSHIP,
              organizationId: ORG,
              memberId: TARGET,
              roleId: TARGET_OLD_ROLE,
              createdAt: ISO,
            });
          }

          const rbac = new RbacAccessControl({ store });

          const actorPermitted = actorIsMember && actorRoleGrantsManagement;
          const expectedSuccess = actorPermitted && targetIsMember;

          const before = store.snapshot();

          let threw = false;
          try {
            await rbac.assignRole(ctx(ACTOR), ORG, TARGET, newRoleName);
          } catch (err) {
            threw = true;
            // Rejections are surfaced as domain errors.
            expect(err).toBeInstanceOf(AppError);
          }

          const after = store.snapshot();

          if (expectedSuccess) {
            // The assignment succeeded and the target now points at the new role.
            expect(threw).toBe(false);
            expect(after[TARGET_MSHIP]).toBe(NEW_ROLE);
            // The new role now governs the target's decisions.
            expect(
              await rbac.can(ctx(TARGET), "video:write", {
                organizationId: ORG,
              }),
            ).toBe(true);
          } else {
            // Rejected: an error was thrown and NO assignment was made — the
            // full assignment state is byte-for-byte unchanged (R16.5, R16.6).
            expect(threw).toBe(true);
            expect(after).toEqual(before);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
