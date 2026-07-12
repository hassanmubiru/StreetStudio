import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { MembershipRecord, RoleRecord } from "@streetstudio/database";
import type { Uuid } from "@streetstudio/shared";
import {
  RbacAccessControl,
  type Action,
  type RbacStore,
  type ResourceRef,
} from "./access-control.js";
import type { AuthContext } from "./service.js";

/**
 * Property 50: Authorization is evaluated in the owning organization's scope.
 *
 * Feature: streetstudio, Property 50: Authorization is evaluated in the owning organization's scope
 *
 * Validates: Requirements 16.1, 16.3
 *
 * For arbitrary members, roles, memberships, and resources,
 * `can(ctx, action, resource)` is decided strictly inside the Organization that
 * OWNS the resource (`resource.organizationId`) and is deny-by-default:
 *
 *  - It resolves `true` ONLY when the requesting Member holds a Membership in
 *    the owning Organization AND the Role that Membership points at (resolved
 *    within that same owning Organization) grants the requested action (R16.1).
 *  - Every other case — no membership in the owning org, a role that resolves
 *    to a different org, or a role that simply lacks the action — is denied,
 *    and thus every non-granted action is denied (R16.3).
 *
 * The test compares the evaluator against an independent oracle computed purely
 * from the owning organization's scope, so any decision that consulted a
 * different organization's membership/role, or that granted an ungranted
 * action, would be caught.
 */

/* -------------------------------------------------------------------------
 * In-memory RBAC store double (logic-only; no database). Mirrors the store
 * semantics: memberships/roles are organization-scoped and roles are keyed by
 * id, exactly as the production repository adapter guarantees.
 * ---------------------------------------------------------------------- */
class InMemoryRbacStore implements RbacStore {
  readonly memberships: MembershipRecord[] = [];
  readonly roles = new Map<Uuid, RoleRecord>();

  async findMembership(
    organizationId: Uuid,
    memberId: Uuid,
  ): Promise<MembershipRecord | null> {
    return (
      this.memberships.find(
        (m) => m.organizationId === organizationId && m.memberId === memberId,
      ) ?? null
    );
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
  async setMembershipRole(): Promise<void> {
    // Unused by `can`; assignRole is exercised elsewhere.
  }
}

/* -------------------------------------------------------------------------
 * Generators. Small pools force frequent collisions so grants, cross-org
 * misses, and deny-by-default cases are all exercised densely.
 * ---------------------------------------------------------------------- */

const ORG_IDS = ["org-0", "org-1", "org-2", "org-3"] as const;
const MEMBER_IDS = ["m-0", "m-1", "m-2", "m-3", "m-4"] as const;
/** Actions that may be granted by a role. */
const GRANTABLE_ACTIONS = ["a:read", "a:write", "a:delete", "a:manage"] as const;
/** An action that is NEVER placed in any role — always deny-by-default. */
const NEVER_GRANTED: Action = "never:granted";

const orgId = () => fc.constantFrom(...ORG_IDS).map((s) => s as unknown as Uuid);
const memberId = () =>
  fc.constantFrom(...MEMBER_IDS).map((s) => s as unknown as Uuid);
const action = () =>
  fc.constantFrom<Action>(...GRANTABLE_ACTIONS, NEVER_GRANTED);

const ISO = "2024-01-01T00:00:00.000Z" as never;

/** A role with a stable id (assigned by index), owning org, and permissions. */
const roleGen = fc.record({
  organizationId: orgId(),
  permissions: fc.uniqueArray(fc.constantFrom(...GRANTABLE_ACTIONS), {
    minLength: 0,
    maxLength: GRANTABLE_ACTIONS.length,
  }),
});

/** A membership referencing a role slot index (resolved after roles exist). */
const membershipGen = fc.record({
  organizationId: orgId(),
  memberId: memberId(),
  roleSlot: fc.nat({ max: 15 }),
});

interface Scenario {
  roles: RoleRecord[];
  memberships: MembershipRecord[];
}

const scenarioGen: fc.Arbitrary<Scenario> = fc
  .record({
    roles: fc.array(roleGen, { minLength: 1, maxLength: 8 }),
    memberships: fc.array(membershipGen, { minLength: 0, maxLength: 12 }),
  })
  .map(({ roles: rawRoles, memberships: rawMemberships }) => {
    const roles: RoleRecord[] = rawRoles.map((r, i) => ({
      id: `r-${i}` as Uuid,
      organizationId: r.organizationId,
      name: `role-${i}`,
      permissions: [...r.permissions],
    }));

    // Dedupe memberships by (org, member) keeping first, matching how the store
    // resolves the first matching membership deterministically.
    const seen = new Set<string>();
    const memberships: MembershipRecord[] = [];
    rawMemberships.forEach((m, i) => {
      const key = `${m.organizationId}::${m.memberId}`;
      if (seen.has(key)) return;
      seen.add(key);
      memberships.push({
        id: `ms-${i}` as Uuid,
        organizationId: m.organizationId,
        memberId: m.memberId,
        roleId: roles[m.roleSlot % roles.length].id,
        createdAt: ISO,
      });
    });

    return { roles, memberships };
  });

/** Independent oracle: decide strictly within the owning organization's scope. */
function expectedCan(
  scenario: Scenario,
  memberIdValue: Uuid,
  act: Action,
  resource: ResourceRef,
): boolean {
  const owningOrg = resource.organizationId;
  if (!owningOrg || !memberIdValue) return false;

  const membership = scenario.memberships.find(
    (m) => m.organizationId === owningOrg && m.memberId === memberIdValue,
  );
  if (!membership) return false;

  const role = scenario.roles.find(
    (r) => r.id === membership.roleId && r.organizationId === owningOrg,
  );
  if (!role) return false;

  return role.permissions.includes(act);
}

function ctx(id: Uuid): AuthContext {
  return { memberId: id };
}

describe("Feature: streetstudio, Property 50: Authorization is evaluated in the owning organization's scope", () => {
  it("decides in the owning org's scope and denies by default (R16.1, R16.3)", async () => {
    await fc.assert(
      fc.asyncProperty(
        scenarioGen,
        memberId(),
        action(),
        orgId(),
        async (scenario, requester, act, resourceOrg) => {
          const store = new InMemoryRbacStore();
          for (const r of scenario.roles) store.roles.set(r.id, r);
          store.memberships.push(...scenario.memberships);
          const rbac = new RbacAccessControl({ store });

          const resource: ResourceRef = {
            organizationId: resourceOrg,
            type: "video",
          };

          const actual = await rbac.can(ctx(requester), act, resource);
          const expected = expectedCan(scenario, requester, act, resource);

          // The decision matches an oracle computed only from the owning org's
          // scope: no other org's membership/role can flip the result.
          expect(actual).toBe(expected);

          // Deny-by-default: an action no role ever grants is always denied.
          expect(
            await rbac.can(ctx(requester), NEVER_GRANTED, resource),
          ).toBe(false);

          // When permitted, a matching membership+role must exist in the
          // owning org (positive confirmation of scoped grant).
          if (actual) {
            const m = scenario.memberships.find(
              (mm) =>
                mm.organizationId === resourceOrg &&
                mm.memberId === requester,
            );
            expect(m).toBeDefined();
            const role = scenario.roles.find(
              (rr) =>
                rr.id === m!.roleId && rr.organizationId === resourceOrg,
            );
            expect(role).toBeDefined();
            expect(role!.permissions).toContain(act);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("does not apply a role granted in another organization to the owning org (R16.1)", async () => {
    // A member with full permissions in org-0 must be denied on a resource
    // owned by org-1 where they hold no membership.
    await fc.assert(
      fc.asyncProperty(
        memberId(),
        fc.constantFrom(...GRANTABLE_ACTIONS),
        async (requester, act) => {
          const store = new InMemoryRbacStore();
          const grantingRole: RoleRecord = {
            id: "r-grant" as Uuid,
            organizationId: "org-0" as Uuid,
            name: "Administrator",
            permissions: [...GRANTABLE_ACTIONS],
          };
          store.roles.set(grantingRole.id, grantingRole);
          store.memberships.push({
            id: "ms-0" as Uuid,
            organizationId: "org-0" as Uuid,
            memberId: requester,
            roleId: grantingRole.id,
            createdAt: ISO,
          });
          const rbac = new RbacAccessControl({ store });

          // Granted in the owning org where the member belongs.
          expect(
            await rbac.can(ctx(requester), act, {
              organizationId: "org-0" as Uuid,
            }),
          ).toBe(true);

          // Denied in a different owning org: the role does not leak.
          expect(
            await rbac.can(ctx(requester), act, {
              organizationId: "org-1" as Uuid,
            }),
          ).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
