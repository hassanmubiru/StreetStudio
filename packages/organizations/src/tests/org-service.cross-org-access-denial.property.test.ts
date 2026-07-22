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
import { OrgService, type OrgStore } from "../application/org-service.js";
import type { AuthContext } from "@streetstudio/auth";
import type { Clock } from "@streetstudio/auth";

/**
 * Property 12: Cross-organization access is denied.
 *
 * Feature: streetstudio, Property 12: Cross-organization access is denied
 *
 * Validates: Requirements 4.6
 *
 * For any Member and any Organization the Member does not belong to, requests to
 * access that Organization's resources are denied with an authorization error
 * (R4.6). This test exercises every organization-scoped operation the service
 * exposes — {@link OrgService.invite}, {@link OrgService.createTeam}, and
 * {@link OrgService.assignToTeam} — with an arbitrary actor who holds no
 * Membership in the target Organization, and asserts that:
 *
 *  - each operation rejects with `AUTHORIZATION_DENIED`, and
 *  - the persisted state (organizations, roles, memberships, invitations,
 *    teams, and team memberships) is byte-for-byte unchanged by the denial.
 *
 * The Organization is seeded with a legitimate member (the creator) and a Team
 * so the authorization gate — not a missing resource or empty scope — is what
 * drives the denial. `assignToTeam` in particular resolves the Team first, so
 * targeting a real Team proves the actor is denied at the membership check
 * rather than short-circuiting on `NOT_FOUND`.
 */

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

/** A clock pinned to a fixed instant; expiry is irrelevant to this property. */
const FIXED = new Date("2024-01-01T00:00:00.000Z");
const fixedClock: Clock = { now: () => FIXED };

/**
 * An in-memory {@link OrgStore} sufficient to exercise the service logic
 * without a database. Mirrors the tenant-scoping and by-id semantics of the
 * real repository adapter.
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

/** Deterministic, monotonically increasing id generator for service internals. */
function sequentialIds(): () => Uuid {
  let n = 0;
  return () => {
    n += 1;
    const hex = n.toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${hex}` as Uuid;
  };
}

const ctx = (memberId: Uuid): AuthContext => ({ memberId });

/** A stable, comparable snapshot of everything the store persists. */
function snapshot(store: InMemoryOrgStore): string {
  return JSON.stringify({
    organizations: [...store.organizations.entries()],
    roles: [...store.roles.entries()],
    memberships: [...store.memberships.entries()],
    invitations: [...store.invitations.entries()],
    teams: [...store.teams.entries()],
    teamMemberships: store.teamMemberships,
  });
}

/* -------------------------------------------------------------------------
 * Generators. A distinct creator (legitimate member) and outsider (non-member)
 * actor, plus arbitrary valid names/emails and an arbitrary assignee.
 * ---------------------------------------------------------------------- */

const uuid = fc.uuid() as fc.Arbitrary<Uuid>;
const orgName = fc.string({ minLength: 1, maxLength: 200 });
const teamName = fc.string({ minLength: 1, maxLength: 200 });
// A well-formed email so `invite` reaches (and fails at) the authorization gate
// rather than short-circuiting on VALIDATION_FAILED.
const email = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[^\s@]+$/.test(s)),
    fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[^\s@]+$/.test(s)),
  )
  .map(([local, domain]) => `${local}@${domain}.com`);

describe("Feature: streetstudio, Property 12: Cross-organization access is denied", () => {
  it("denies org-scoped operations for a non-member actor with no state change (R4.6)", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuid, // creator (legitimate member of the org)
        uuid, // outsider (actor that does not belong to the org)
        uuid, // arbitrary assignee for assignToTeam
        orgName,
        teamName,
        email,
        async (creator, outsider, assignee, oName, tName, mail) => {
          // The actor under test must genuinely not be the creator/member.
          fc.pre(outsider !== creator);

          const store = new InMemoryOrgStore();
          const service = new OrgService({
            store,
            clock: fixedClock,
            newId: sequentialIds(),
            generateSecret: () => "secret",
          });

          // Seed a real Organization (with its creator as an Administrator
          // member) and a real Team so the authorization gate — not a missing
          // resource — is what drives every denial.
          const org = await service.createOrg(ctx(creator), oName);
          const team = await service.createTeam(ctx(creator), org.id, tName);

          // The outsider must not have been made a member by the setup.
          expect(await store.findMembership(org.id, outsider)).toBeNull();

          const before = snapshot(store);

          // invite — R4.6
          await expect(
            service.invite(ctx(outsider), org.id, mail),
          ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
          expect(snapshot(store)).toBe(before);

          // createTeam — R4.6
          await expect(
            service.createTeam(ctx(outsider), org.id, tName),
          ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
          expect(snapshot(store)).toBe(before);

          // assignToTeam — R4.6 (Team resolves, then the membership gate denies)
          await expect(
            service.assignToTeam(ctx(outsider), team.id, assignee),
          ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
          expect(snapshot(store)).toBe(before);

          // Every rejection was an authorization error, not some other failure.
          for (const op of [
            service.invite(ctx(outsider), org.id, mail),
            service.createTeam(ctx(outsider), org.id, tName),
            service.assignToTeam(ctx(outsider), team.id, assignee),
          ]) {
            await expect(op).rejects.toBeInstanceOf(AppError);
          }
          expect(snapshot(store)).toBe(before);
        },
      ),
      { numRuns: 200 },
    );
  });
});
