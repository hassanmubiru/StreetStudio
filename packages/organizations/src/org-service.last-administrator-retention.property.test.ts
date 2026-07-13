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
import {
  ADMINISTRATOR_ROLE_NAME,
  MEMBER_ROLE_NAME,
  OrgService,
  type OrgStore,
} from "./org-service.js";
import type { AuthContext } from "@streetstudio/auth";
import type { Clock } from "@streetstudio/auth";

/**
 * Property 78: An organization always retains at least one Administrator.
 *
 * Feature: streetstudio, Property 78: An organization always retains at least one Administrator
 *
 * Validates: Requirements 26.6
 *
 * *For any* organization, an attempt to remove its only remaining Administrator
 * is rejected (with `CONFLICT`) and that Member's access and Role are retained
 * unchanged — so the organization always keeps at least one Administrator.
 * Conversely, removing an Administrator while at least one other Administrator
 * remains, or removing an ordinary Member, always succeeds and revokes that
 * Member's access.
 *
 * The test builds organizations with an arbitrary number of Administrators
 * (always >= 1, the creator) and ordinary Members, picks an arbitrary Member to
 * remove, and asserts the success/deny outcome against an independent oracle:
 * removal is refused exactly when the target is the last remaining
 * Administrator. On refusal the target's Membership (and its Role) is proven
 * byte-for-byte unchanged; on success the Membership is proven gone.
 */

/* -------------------------------------------------------------------------
 * Test doubles (logic-only; no database).
 * ---------------------------------------------------------------------- */

const FIXED_NOW = new Date("2024-01-01T00:00:00.000Z");

class FixedClock implements Clock {
  now(): Date {
    return FIXED_NOW;
  }
}

/**
 * An in-memory {@link OrgStore} that mirrors the tenant-scoping and by-id
 * semantics of the real repository adapter, sufficient to exercise
 * {@link OrgService.removeMember}.
 */
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

/** Deterministic, monotonically increasing id generator for a service run. */
function sequentialIds(): () => Uuid {
  let n = 0;
  return () => {
    n += 1;
    const hex = n.toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${hex}` as Uuid;
  };
}

/** A stable member id derived from an index (distinct from service-minted ids). */
function memberId(i: number): Uuid {
  const hex = (i + 1).toString(16).padStart(12, "0");
  return `11111111-1111-4111-8111-${hex}` as Uuid;
}

describe("Feature: streetstudio, Property 78: An organization always retains at least one Administrator", () => {
  it("refuses to remove the last Administrator (retaining access & Role), but removes any other Member", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: 3 }), // extra Administrators beyond the creator
        fc.nat({ max: 3 }), // ordinary Members
        fc.nat({ max: 7 }), // raw index used to pick a target Member
        async (extraAdmins, ordinaryMembers, targetSeed) => {
          const store = new InMemoryOrgStore();
          const service = new OrgService({
            store,
            clock: new FixedClock(),
            newId: sequentialIds(),
            generateSecret: () => "secret",
          });

          // The creator becomes the first Administrator (R4.1).
          const creator = memberId(0);
          const org = await service.createOrg(ctx(creator), "Acme");
          const adminRole = await store.findRoleByName(
            org.id,
            ADMINISTRATOR_ROLE_NAME,
          );
          const memberRole = await store.findRoleByName(
            org.id,
            MEMBER_ROLE_NAME,
          );
          expect(adminRole).not.toBeNull();
          expect(memberRole).not.toBeNull();

          // Track every Member we place and whether they hold the Admin role.
          const members: { id: Uuid; isAdmin: boolean }[] = [
            { id: creator, isAdmin: true },
          ];

          let idx = 1;
          // Additional Administrators.
          for (let i = 0; i < extraAdmins; i += 1, idx += 1) {
            const id = memberId(idx);
            await store.createMembership({
              id: `00000000-0000-4000-9000-${idx.toString(16).padStart(12, "0")}` as Uuid,
              organizationId: org.id,
              memberId: id,
              roleId: adminRole!.id,
              createdAt: FIXED_NOW.toISOString() as never,
            });
            members.push({ id, isAdmin: true });
          }
          // Ordinary Members.
          for (let i = 0; i < ordinaryMembers; i += 1, idx += 1) {
            const id = memberId(idx);
            await store.createMembership({
              id: `00000000-0000-4000-a000-${idx.toString(16).padStart(12, "0")}` as Uuid,
              organizationId: org.id,
              memberId: id,
              roleId: memberRole!.id,
              createdAt: FIXED_NOW.toISOString() as never,
            });
            members.push({ id, isAdmin: false });
          }

          const totalAdmins = 1 + extraAdmins;
          const target = members[targetSeed % members.length]!;

          // Oracle: removal is refused exactly when the target is the last
          // remaining Administrator (R26.6). All other removals succeed.
          const expectedRefusal = target.isAdmin && totalAdmins === 1;

          const before = await store.findMembership(org.id, target.id);
          expect(before).not.toBeNull();

          if (expectedRefusal) {
            await expect(
              service.removeMember(ctx(creator), org.id, target.id),
            ).rejects.toMatchObject({ code: "CONFLICT" });

            // Access and Role retained byte-for-byte (R26.6).
            const after = await store.findMembership(org.id, target.id);
            expect(after).toEqual(before);

            // The organization still has at least one Administrator.
            const remaining = await store.listMemberships(org.id);
            const admins = remaining.filter((m) => m.roleId === adminRole!.id);
            expect(admins.length).toBeGreaterThanOrEqual(1);
          } else {
            await expect(
              service.removeMember(ctx(creator), org.id, target.id),
            ).resolves.toBeUndefined();

            // Access revoked: the Membership no longer resolves.
            expect(await store.findMembership(org.id, target.id)).toBeNull();

            // The organization still retains at least one Administrator.
            const remaining = await store.listMemberships(org.id);
            const admins = remaining.filter((m) => m.roleId === adminRole!.id);
            expect(admins.length).toBeGreaterThanOrEqual(1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
