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
  MAX_ORG_NAME_LENGTH,
  OrgService,
  type OrgStore,
} from "./org-service.js";
import type { AuthContext } from "@streetstudio/auth";
import type { Clock } from "@streetstudio/auth";

/**
 * Property 8: Organization creation validity and administrator assignment.
 *
 * Feature: streetstudio, Property 8: Organization creation validity and administrator assignment
 *
 * Validates: Requirements 4.1, 4.7
 *
 * For any organization name, `createOrg(actor, name)` succeeds if and only if
 * the name length is between 1 and {@link MAX_ORG_NAME_LENGTH} (200) characters
 * inclusive:
 *
 *  - On success (1..200 chars) the Organization is created and persisted, and
 *    the creator is assigned a Membership whose Role is the Administrator Role
 *    (R4.1).
 *  - On failure (empty, or longer than 200 chars) the request is rejected with
 *    `VALIDATION_FAILED` and NOTHING is persisted — no Organization, Role, or
 *    Membership (R4.7).
 *
 * The test drives arbitrary names spanning both sides of the boundary and
 * asserts the success/reject outcome against the length oracle, snapshotting
 * the store to prove nothing is written on rejection.
 */

/* -------------------------------------------------------------------------
 * In-memory OrgStore (logic-only; no database), mirroring the tenant-scoping
 * and by-id semantics of the real repository adapter.
 * ---------------------------------------------------------------------- */
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

  /** Total number of persisted rows across every collection. */
  totalPersisted(): number {
    return (
      this.organizations.size +
      this.roles.size +
      this.memberships.size +
      this.invitations.size +
      this.teams.size +
      this.teamMemberships.length
    );
  }
}

/** A fixed clock so ids/timestamps stay deterministic across runs. */
class FixedClock implements Clock {
  constructor(private readonly current: Date) {}
  now(): Date {
    return this.current;
  }
}

const CREATOR = "11111111-1111-4111-8111-111111111111" as Uuid;

const ctx = (memberId: Uuid): AuthContext => ({ memberId });

/** Deterministic, monotonically increasing id generator for tests. */
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
    clock: new FixedClock(new Date("2024-01-01T00:00:00.000Z")),
    newId: sequentialIds(),
    generateSecret: () => "secret",
  });
  return { service, store };
}

describe("Feature: streetstudio, Property 8: Organization creation validity and administrator assignment", () => {
  it("createOrg succeeds iff the name is 1..200 chars, assigning the creator Administrator; otherwise rejects with VALIDATION_FAILED and persists nothing (R4.1, R4.7)", async () => {
    await fc.assert(
      fc.asyncProperty(
        // A name whose length spans both sides of the [1, 200] boundary,
        // including the empty string and over-long names.
        fc.string({ minLength: 0, maxLength: MAX_ORG_NAME_LENGTH + 50 }),
        async (name) => {
          const { service, store } = makeService();

          const expectedSuccess =
            name.length >= 1 && name.length <= MAX_ORG_NAME_LENGTH;

          if (expectedSuccess) {
            const org = await service.createOrg(ctx(CREATOR), name);

            // The Organization is created and persisted with the given name.
            expect(org.name).toBe(name);
            expect(store.organizations.get(org.id)).toBeDefined();

            // The creator is assigned a Membership whose Role is Administrator.
            const membership = await store.findMembership(org.id, CREATOR);
            expect(membership).not.toBeNull();
            const role = store.roles.get(membership!.roleId);
            expect(role).toBeDefined();
            expect(role!.organizationId).toBe(org.id);
            expect(role!.name).toBe(ADMINISTRATOR_ROLE_NAME);
          } else {
            // Rejected with VALIDATION_FAILED and nothing persisted.
            let error: unknown;
            try {
              await service.createOrg(ctx(CREATOR), name);
            } catch (err) {
              error = err;
            }
            expect(error).toBeInstanceOf(AppError);
            expect((error as AppError).code).toBe("VALIDATION_FAILED");
            expect(store.totalPersisted()).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
