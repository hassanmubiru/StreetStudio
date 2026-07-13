import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type {
  InvitationRecord,
  MembershipRecord,
  OrganizationRecord,
  RoleRecord,
  TeamMembershipRecord,
  TeamRecord,
} from "@streetstudio/database";
import type { InvitationStatus, Uuid } from "@streetstudio/shared";
import { OrgService, type OrgStore } from "./org-service.js";
import type { AuthContext } from "./service.js";
import type { Clock } from "./clock.js";

/**
 * Property 76: Removing a member revokes access.
 *
 * Feature: streetstudio, Property 76: Removing a member revokes access
 *
 * Validates: Requirements 26.2
 *
 * *For any* Member removed from an organization, subsequent requests from that
 * Member to the organization's resources are denied with an authorization
 * error. Concretely, once {@link OrgService.removeMember} succeeds for a target
 * Member:
 *
 *  - the target's Membership no longer resolves in that organization
 *    (`findMembership` returns null), so the RBAC evaluator denies by default;
 *  - subsequent organization-scoped operations attempted by the removed Member
 *    (e.g. inviting, creating a team) are rejected with `AUTHORIZATION_DENIED`;
 *  - every Member who was NOT removed keeps their Membership unchanged, so the
 *    revocation is surgical rather than wholesale.
 *
 * The test builds an organization with an Administrator (the creator) plus an
 * arbitrary number of ordinary Members, removes an arbitrarily-chosen ordinary
 * Member, and asserts the revocation holds for that Member while the rest are
 * untouched.
 */

/* -------------------------------------------------------------------------
 * Test doubles (logic-only; no database)
 * ---------------------------------------------------------------------- */

/** A clock whose "now" is fixed; the property does not depend on time. */
class FixedClock implements Clock {
  constructor(private readonly current: Date) {}
  now(): Date {
    return this.current;
  }
}

/** In-memory {@link OrgStore} mirroring the tenant-scoped repository semantics. */
class InMemoryOrgStore implements OrgStore {
  readonly organizations = new Map<Uuid, OrganizationRecord>();
  readonly roles = new Map<Uuid, RoleRecord>();
  readonly memberships = new Map<Uuid, MembershipRecord>();
  readonly invitations = new Map<Uuid, InvitationRecord>();
  readonly teams = new Map<Uuid, TeamRecord>();
  readonly teamMemberships: TeamMembershipRecord[] = [];

  async createOrganization(
    record: OrganizationRecord,
  ): Promise<OrganizationRecord> {
    this.organizations.set(record.id, record);
    return record;
  }
  async findOrganizationById(id: Uuid): Promise<OrganizationRecord | null> {
    return this.organizations.get(id) ?? null;
  }
  async updateOrganizationSettings(
    record: OrganizationRecord,
    settings: Record<string, unknown>,
  ): Promise<OrganizationRecord> {
    const updated = { ...record, settings };
    this.organizations.set(record.id, updated);
    return updated;
  }
  async createRole(record: RoleRecord): Promise<RoleRecord> {
    this.roles.set(record.id, record);
    return record;
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
  async findRoleById(
    organizationId: Uuid,
    roleId: Uuid,
  ): Promise<RoleRecord | null> {
    const r = this.roles.get(roleId);
    return r && r.organizationId === organizationId ? r : null;
  }
  async createMembership(record: MembershipRecord): Promise<MembershipRecord> {
    this.memberships.set(record.id, record);
    return record;
  }
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
  async listMemberships(organizationId: Uuid): Promise<MembershipRecord[]> {
    const out: MembershipRecord[] = [];
    for (const m of this.memberships.values()) {
      if (m.organizationId === organizationId) out.push(m);
    }
    return out;
  }
  async deleteMembership(record: MembershipRecord): Promise<void> {
    this.memberships.delete(record.id);
  }
  async createInvitation(record: InvitationRecord): Promise<InvitationRecord> {
    this.invitations.set(record.id, record);
    return record;
  }
  async findInvitationById(
    organizationId: Uuid,
    invitationId: Uuid,
  ): Promise<InvitationRecord | null> {
    const found = this.invitations.get(invitationId);
    return found && found.organizationId === organizationId ? found : null;
  }
  async setInvitationStatus(
    record: InvitationRecord,
    status: InvitationStatus,
  ): Promise<void> {
    this.invitations.set(record.id, { ...record, status });
  }
  async createTeam(record: TeamRecord): Promise<TeamRecord> {
    this.teams.set(record.id, record);
    return record;
  }
  async findTeamById(teamId: Uuid): Promise<TeamRecord | null> {
    return this.teams.get(teamId) ?? null;
  }
  async createTeamMembership(
    record: TeamMembershipRecord,
  ): Promise<TeamMembershipRecord> {
    this.teamMemberships.push(record);
    return record;
  }
  async findTeamMemberships(teamId: Uuid): Promise<TeamMembershipRecord[]> {
    return this.teamMemberships.filter((tm) => tm.teamId === teamId);
  }
}

const ctx = (memberId: Uuid): AuthContext => ({ memberId });

/** The Administrator who creates the organization. */
const CREATOR = "11111111-1111-4111-8111-111111111111" as Uuid;

/** Deterministic distinct member UUIDs for the invited (ordinary) Members. */
function memberId(i: number): Uuid {
  const hex = i.toString(16).padStart(12, "0");
  return `22222222-2222-4222-8222-${hex}` as Uuid;
}

/** Deterministic, monotonically increasing id generator for the service. */
function sequentialIds(): () => Uuid {
  let n = 0;
  return () => {
    n += 1;
    const hex = n.toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${hex}` as Uuid;
  };
}

function makeService(): { service: OrgService; store: InMemoryOrgStore } {
  const store = new InMemoryOrgStore();
  let secret = 0;
  const service = new OrgService({
    store,
    clock: new FixedClock(new Date("2024-01-01T00:00:00.000Z")),
    newId: sequentialIds(),
    generateSecret: () => `secret-${(secret += 1)}`,
  });
  return { service, store };
}

describe("Feature: streetstudio, Property 76: Removing a member revokes access", () => {
  it("revokes the removed Member's access while leaving other Members untouched (R26.2)", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Number of ordinary Members to add alongside the Administrator.
        fc.integer({ min: 1, max: 8 }),
        // Selector for which ordinary Member to remove.
        fc.nat(),
        async (memberCount, removalSeed) => {
          const { service, store } = makeService();
          const org = await service.createOrg(ctx(CREATOR), "Acme");

          // Invite and accept `memberCount` ordinary Members (each gets the
          // default Member role, so none is an Administrator and all are
          // removable without tripping the last-Administrator guard).
          const members: Uuid[] = [];
          for (let i = 0; i < memberCount; i += 1) {
            const m = memberId(i + 1);
            const invitation = await service.invite(
              ctx(CREATOR),
              org.id,
              `user${i}@example.com`,
            );
            await service.acceptInvitation(invitation.token, m);
            members.push(m);
          }

          // Pick an ordinary Member to remove.
          const removed = members[removalSeed % members.length]!;
          const survivors = members.filter((m) => m !== removed);

          // Precondition: the target currently has access.
          expect(await store.findMembership(org.id, removed)).not.toBeNull();

          await service.removeMember(ctx(CREATOR), org.id, removed);

          // 1) The removed Member's Membership no longer resolves — RBAC denies
          //    by default because there is no Membership to authorize against.
          expect(await store.findMembership(org.id, removed)).toBeNull();

          // 2) Subsequent organization-scoped requests by the removed Member are
          //    rejected with an authorization error (R26.2).
          await expect(
            service.invite(ctx(removed), org.id, "someone@example.com"),
          ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
          await expect(
            service.createTeam(ctx(removed), org.id, "Ghost Team"),
          ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });

          // 3) Revocation is surgical: every other Member (and the
          //    Administrator) retains their Membership unchanged.
          expect(await store.findMembership(org.id, CREATOR)).not.toBeNull();
          for (const s of survivors) {
            expect(await store.findMembership(org.id, s)).not.toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
