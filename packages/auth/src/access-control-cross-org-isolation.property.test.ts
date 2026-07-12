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
 * Property 52: Role permissions never leak across organizations.
 *
 * Feature: streetstudio, Property 52: Role permissions never leak across organizations
 *
 * Validates: Requirements 16.4
 *
 * A Role's permissions are scoped to the Organization in which the Role is
 * assigned and are NEVER applied in any other Organization (R16.4). For a
 * single requesting Member who holds Roles across several Organizations, the
 * decision for a resource owned by a particular Organization must depend ONLY
 * on that Member's Role WITHIN that owning Organization:
 *
 *  - If the Member has no Membership in the owning Organization, no action is
 *    permitted there — regardless of how permissive their Roles are in other
 *    Organizations.
 *  - If the Member does have a Membership in the owning Organization, only the
 *    actions granted by THAT Organization's Role are permitted. An action a
 *    Member holds solely by virtue of a Role in a DIFFERENT Organization must
 *    not become permitted here (it does not "leak" in).
 *
 * The test contrasts each owning Organization's own grant set against the union
 * of permissions the same Member holds in every OTHER Organization, and asserts
 * that any purely-foreign permission is denied while the owning-scope grants are
 * honored. Any implementation that consulted a different Organization's
 * Membership/Role would be caught.
 */

/* -------------------------------------------------------------------------
 * In-memory RBAC store double (logic-only; no database). Memberships and roles
 * are strictly organization-scoped, mirroring the production repository
 * adapter's tenant isolation.
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
    // Unused by `can`.
  }
}

/* -------------------------------------------------------------------------
 * Generators. A single requester holds an independently-generated Role in each
 * of several organizations. Small action/org pools force dense overlap so that
 * "this permission is granted somewhere else but not here" cases occur often.
 * ---------------------------------------------------------------------- */

const ORG_IDS = ["org-a", "org-b", "org-c", "org-d"] as const;
const GRANTABLE_ACTIONS = [
  "video:read",
  "video:write",
  "video:delete",
  "project:manage",
  "org:manage_roles",
] as const;
/** An action no Role ever grants — always deny-by-default. */
const NEVER_GRANTED: Action = "never:granted";

const REQUESTER = "member-under-test" as Uuid;

/** Per-organization membership for the requester with a chosen permission set. */
interface OrgMembership {
  readonly org: (typeof ORG_IDS)[number];
  readonly permissions: readonly Action[];
}

const orgMembershipGen: fc.Arbitrary<OrgMembership> = fc.record({
  org: fc.constantFrom(...ORG_IDS),
  permissions: fc.uniqueArray(fc.constantFrom(...GRANTABLE_ACTIONS), {
    minLength: 0,
    maxLength: GRANTABLE_ACTIONS.length,
  }),
});

interface Scenario {
  /** The organizations (deduped) in which the requester holds a membership. */
  readonly memberships: readonly OrgMembership[];
}

/**
 * Build a scenario: the requester belongs to a subset of organizations, each
 * with its own Role and permission set. Memberships are deduped by org so a
 * single org resolves to a single membership.
 */
const scenarioGen: fc.Arbitrary<Scenario> = fc
  .array(orgMembershipGen, { minLength: 0, maxLength: ORG_IDS.length })
  .map((raw) => {
    const byOrg = new Map<string, OrgMembership>();
    for (const m of raw) {
      if (!byOrg.has(m.org)) byOrg.set(m.org, m);
    }
    return { memberships: [...byOrg.values()] };
  });

function buildStore(scenario: Scenario): InMemoryRbacStore {
  const store = new InMemoryRbacStore();
  scenario.memberships.forEach((m, i) => {
    const roleId = `role-${m.org}` as Uuid;
    store.roles.set(roleId, {
      id: roleId,
      organizationId: m.org as unknown as Uuid,
      name: `role-in-${m.org}`,
      permissions: [...m.permissions],
    });
    store.memberships.push({
      id: `mship-${i}` as Uuid,
      organizationId: m.org as unknown as Uuid,
      memberId: REQUESTER,
      roleId,
      createdAt: "2024-01-01T00:00:00.000Z" as never,
    });
  });
  return store;
}

const ctx = (memberId: Uuid): AuthContext => ({ memberId });

describe("Feature: streetstudio, Property 52: Role permissions never leak across organizations", () => {
  it("permissions held only in other organizations never grant access in the owning org (R16.4)", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioGen, async (scenario) => {
        const store = buildStore(scenario);
        const rbac = new RbacAccessControl({ store });

        const permsByOrg = new Map<string, Set<Action>>(
          scenario.memberships.map((m) => [m.org, new Set(m.permissions)]),
        );

        // Evaluate the decision for a resource owned by EVERY organization,
        // including organizations the requester is NOT a member of.
        for (const owningOrg of ORG_IDS) {
          const resource: ResourceRef = {
            organizationId: owningOrg as unknown as Uuid,
            type: "video",
          };
          const ownGrants = permsByOrg.get(owningOrg) ?? new Set<Action>();

          // Permissions the requester holds in any OTHER organization.
          const foreignGrants = new Set<Action>();
          for (const m of scenario.memberships) {
            if (m.org === owningOrg) continue;
            for (const p of m.permissions) foreignGrants.add(p);
          }

          for (const action of GRANTABLE_ACTIONS) {
            const actual = await rbac.can(ctx(REQUESTER), action, resource);

            // The decision must equal the owning org's own grant — never the
            // union with foreign grants.
            expect(actual).toBe(ownGrants.has(action));

            // Explicit leak check: an action granted ONLY elsewhere must be
            // denied in this owning org.
            if (foreignGrants.has(action) && !ownGrants.has(action)) {
              expect(actual).toBe(false);
            }
          }

          // Deny-by-default: an action no role anywhere grants is always denied.
          expect(
            await rbac.can(ctx(REQUESTER), NEVER_GRANTED, resource),
          ).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("a fully-privileged role in one org grants nothing in an org the member does not belong to (R16.4)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ORG_IDS), // org the member belongs to (all perms)
        fc.constantFrom(...ORG_IDS), // owning org of the target resource
        fc.constantFrom(...GRANTABLE_ACTIONS),
        async (homeOrg, resourceOrg, action) => {
          // Only interesting when the resource is owned by a DIFFERENT org.
          fc.pre(homeOrg !== resourceOrg);

          const store = new InMemoryRbacStore();
          const roleId = `role-${homeOrg}` as Uuid;
          store.roles.set(roleId, {
            id: roleId,
            organizationId: homeOrg as unknown as Uuid,
            name: "Administrator",
            permissions: [...GRANTABLE_ACTIONS],
          });
          store.memberships.push({
            id: "mship-0" as Uuid,
            organizationId: homeOrg as unknown as Uuid,
            memberId: REQUESTER,
            roleId,
            createdAt: "2024-01-01T00:00:00.000Z" as never,
          });
          const rbac = new RbacAccessControl({ store });

          // Fully permitted in the home org.
          expect(
            await rbac.can(ctx(REQUESTER), action, {
              organizationId: homeOrg as unknown as Uuid,
            }),
          ).toBe(true);

          // Denied in the foreign owning org — no leak despite full privileges.
          expect(
            await rbac.can(ctx(REQUESTER), action, {
              organizationId: resourceOrg as unknown as Uuid,
            }),
          ).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
