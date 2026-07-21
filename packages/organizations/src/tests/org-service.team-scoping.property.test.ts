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
import type { AuthContext } from "@streetstudio/auth";
import type { Clock } from "@streetstudio/auth";

/**
 * Property 11: Team creation and membership are organization-scoped.
 *
 * Feature: streetstudio, Property 11: Team creation and membership are organization-scoped
 *
 * Validates: Requirements 4.4, 4.5
 *
 * For any team created within an organization and any organization Member
 * assigned to it, the team and its recorded memberships belong exclusively to
 * that organization:
 *
 *  - `createTeam(actor, orgId, name)` creates a Team whose `organizationId` is
 *    exactly the organization the actor created it in (R4.4). No team is ever
 *    scoped to a different organization.
 *  - `assignToTeam(actor, teamId, member)` records a Team membership ONLY when
 *    `member` belongs to the Team's owning Organization; a member who is not a
 *    Member of that Organization is rejected with `VALIDATION_FAILED` and no
 *    Team membership is recorded (R4.5). Recorded memberships therefore never
 *    include an outsider, and every recorded membership names a member of the
 *    team's own organization.
 */

/* -------------------------------------------------------------------------
 * Test doubles (logic-only; no database). A fixed-time clock is sufficient:
 * team scoping does not depend on time.
 * ---------------------------------------------------------------------- */

class FixedClock implements Clock {
  constructor(private readonly current: Date) {}
  now(): Date {
    return this.current;
  }
}

/**
 * In-memory {@link OrgStore} mirroring the tenant-scoping and by-id semantics
 * of the production repository adapter: organization-scoped reads are keyed by
 * `organizationId`, teams resolve by their global id, and team memberships are
 * appended verbatim.
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

/* -------------------------------------------------------------------------
 * Fixtures & generators. A small pool of members forces frequent overlap
 * between org members and outsiders so both branches of R4.5 are exercised.
 * ---------------------------------------------------------------------- */

const CLOCK = new FixedClock(new Date("2024-01-01T00:00:00.000Z"));

function ctx(memberId: Uuid): AuthContext {
  return { memberId };
}

/** Deterministic, monotonically increasing id generator (unique per service). */
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
  const service = new OrgService({
    store,
    clock: CLOCK,
    newId: sequentialIds(),
  });
  return { service, store };
}

/** A small pool of member identifiers, referenced by index in the scenario. */
const MEMBER_POOL = [
  "aaaaaaaa-0000-4000-8000-000000000001",
  "bbbbbbbb-0000-4000-8000-000000000002",
  "cccccccc-0000-4000-8000-000000000003",
  "dddddddd-0000-4000-8000-000000000004",
  "eeeeeeee-0000-4000-8000-000000000005",
  "ffffffff-0000-4000-8000-000000000006",
] as const;

const memberIndex = () => fc.nat({ max: MEMBER_POOL.length - 1 });

/** A team belongs to one org (by index) and has a valid name. */
const teamSpecGen = fc.record({
  orgIndex: fc.nat({ max: 2 }),
  name: fc
    .string({ minLength: 1, maxLength: 40 })
    .filter((s) => s.length >= 1 && s.length <= 200),
});

/** An assignment names a team (by index) and a member (by pool index). */
const assignmentGen = fc.record({
  teamIndex: fc.nat({ max: 11 }),
  memberIndex: memberIndex(),
});

interface Scenario {
  /** Number of organizations to create (each gets a distinct creator). */
  orgCount: number;
  /** Membership matrix: which pool members belong to which org index. */
  orgMembers: number[][];
  teams: { orgIndex: number; name: string }[];
  assignments: { teamIndex: number; memberIndex: number }[];
}

const scenarioGen: fc.Arbitrary<Scenario> = fc
  .record({
    orgCount: fc.integer({ min: 1, max: 3 }),
    // For each of the (up to 3) orgs, an arbitrary subset of pool members.
    orgMemberSubsets: fc.array(
      fc.uniqueArray(memberIndex(), { minLength: 0, maxLength: 4 }),
      { minLength: 3, maxLength: 3 },
    ),
    teams: fc.array(teamSpecGen, { minLength: 1, maxLength: 6 }),
    assignments: fc.array(assignmentGen, { minLength: 0, maxLength: 15 }),
  })
  .map(({ orgCount, orgMemberSubsets, teams, assignments }) => ({
    orgCount,
    orgMembers: orgMemberSubsets
      .slice(0, orgCount)
      .map((subset) => [...subset]),
    // Keep only teams whose org index is within the created range.
    teams: teams
      .filter((t) => t.orgIndex < orgCount)
      .map((t) => ({ orgIndex: t.orgIndex, name: t.name })),
    assignments,
  }));

describe("Feature: streetstudio, Property 11: Team creation and membership are organization-scoped", () => {
  it("scopes teams to their org and records memberships only for org members (R4.4, R4.5)", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioGen, async (scenario) => {
        // Guard: need at least one team to exercise the property meaningfully.
        fc.pre(scenario.teams.length > 0);

        const { service, store } = makeService();

        /* ----- Build organizations and their memberships ----- */
        // Each org is created by a distinct synthetic creator so createOrg's
        // authorization (creator is Administrator) is satisfied. We then attach
        // the org's designated pool members via the store directly (the invite
        // flow is covered elsewhere; here we isolate team scoping).
        const orgIds: Uuid[] = [];
        const orgMemberSets: Set<string>[] = [];
        for (let i = 0; i < scenario.orgCount; i += 1) {
          const creator = `10000000-0000-4000-8000-00000000000${i}` as Uuid;
          const org = await service.createOrg(ctx(creator), `Org-${i}`);
          orgIds.push(org.id);

          const memberSet = new Set<string>();
          // The creator is already an Administrator Member of the org.
          memberSet.add(creator);
          const memberRole = await store.findRoleByName(org.id, "Member");
          for (const idx of scenario.orgMembers[i] ?? []) {
            const memberId = MEMBER_POOL[idx] as Uuid;
            if (memberSet.has(memberId)) continue;
            await store.createMembership({
              id: `${org.id}-m-${idx}` as Uuid,
              organizationId: org.id,
              memberId,
              roleId: memberRole!.id,
              createdAt: "2024-01-01T00:00:00.000Z" as never,
            });
            memberSet.add(memberId);
          }
          orgMemberSets.push(memberSet);
        }

        /* ----- Create teams; R4.4: each team is scoped to its org ----- */
        const createdTeams: { team: TeamRecord; orgIndex: number }[] = [];
        for (const spec of scenario.teams) {
          const orgId = orgIds[spec.orgIndex];
          // Use the org's creator as the acting Administrator.
          const creator = `10000000-0000-4000-8000-00000000000${spec.orgIndex}` as Uuid;
          const team = await service.createTeam(ctx(creator), orgId, spec.name);

          // R4.4 — the team is scoped exactly to the org it was created in.
          expect(team.organizationId).toBe(orgId);
          expect(store.teams.get(team.id)?.organizationId).toBe(orgId);

          createdTeams.push({ team, orgIndex: spec.orgIndex });
        }

        /* ----- Assign members; R4.5: only org members are recorded ----- */
        for (const a of scenario.assignments) {
          if (createdTeams.length === 0) break;
          const { team, orgIndex } = createdTeams[a.teamIndex % createdTeams.length];
          const orgId = orgIds[orgIndex];
          const creator = `10000000-0000-4000-8000-00000000000${orgIndex}` as Uuid;
          const memberId = MEMBER_POOL[a.memberIndex] as Uuid;

          const belongs = orgMemberSets[orgIndex].has(memberId);
          const before = (await store.findTeamMemberships(team.id)).length;

          if (belongs) {
            await service.assignToTeam(ctx(creator), team.id, memberId);
            const rows = await store.findTeamMemberships(team.id);
            // The membership is recorded for this team.
            expect(rows.some((tm) => tm.memberId === memberId)).toBe(true);
          } else {
            // R4.5 — a member outside the team's org is rejected...
            await expect(
              service.assignToTeam(ctx(creator), team.id, memberId),
            ).rejects.toBeInstanceOf(AppError);
            // ...and no team membership is recorded for the outsider.
            const rows = await store.findTeamMemberships(team.id);
            expect(rows.some((tm) => tm.memberId === memberId)).toBe(false);
            expect(rows.length).toBe(before);
          }
        }

        /* ----- Global invariant: every recorded team membership names a
         * member of that team's OWN organization, and never leaks across
         * organizations. ----- */
        for (const tm of store.teamMemberships) {
          const team = store.teams.get(tm.teamId);
          expect(team).toBeDefined();
          const owningOrgIndex = orgIds.indexOf(team!.organizationId);
          expect(owningOrgIndex).toBeGreaterThanOrEqual(0);
          expect(orgMemberSets[owningOrgIndex].has(tm.memberId as string)).toBe(
            true,
          );
        }
      }),
      { numRuns: 200 },
    );
  });
});
