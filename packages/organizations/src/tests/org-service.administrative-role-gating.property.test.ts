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
 * Property 77: Administrative actions require Administrator role.
 *
 * Feature: streetstudio, Property 77: Administrative actions require Administrator role
 *
 * Validates: Requirements 26.4
 *
 * An administrative action (`updateSettings`, `removeMember`) succeeds ONLY
 * when the actor is a Member of the target Organization holding the
 * Administrator Role (the Role that grants the role-management permission the
 * service gates administration on). For any actor that is NOT an Administrator
 * of the Organization — a Member whose Role does not grant that permission, or
 * a principal who is not a Member at all — the action MUST be denied with an
 * `AUTHORIZATION_DENIED` error and the target resource MUST be left completely
 * unchanged: the Organization's settings and the full set of Memberships are
 * byte-for-byte identical before and after the rejected request (R26.4).
 *
 * The test drives arbitrary combinations of (actor role, administrative action,
 * settings patch) and asserts the success/deny outcome against an independent
 * oracle — success iff the actor is the Administrator — while snapshotting the
 * complete Organization settings and Membership state to prove nothing changed
 * on any denial.
 */

/* -------------------------------------------------------------------------
 * In-memory OrgStore (logic-only; mirrors the tenant-scoping and by-id
 * semantics of the real repository adapter). Self-contained so this file
 * modifies no existing test.
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

  /**
   * A stable snapshot of the target-resource state R26.4 protects: every
   * Organization's settings plus the full set of (membershipId -> roleId)
   * Memberships. Equality of two snapshots means "no change was made".
   */
  snapshot(): string {
    const orgSettings: Record<string, unknown> = {};
    for (const o of this.organizations.values()) {
      orgSettings[o.id] = o.settings;
    }
    const memberships: Record<string, { member: Uuid; role: Uuid }> = {};
    for (const m of this.memberships.values()) {
      memberships[m.id] = { member: m.memberId, role: m.roleId };
    }
    return JSON.stringify({ orgSettings, memberships });
  }
}

/** A fixed clock; administrative gating is time-independent. */
class FixedClock implements Clock {
  constructor(private readonly current: Date) {}
  now(): Date {
    return this.current;
  }
}

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

const CREATOR = "11111111-1111-4111-8111-111111111111" as Uuid; // Administrator
const PLAIN = "22222222-2222-4222-8222-222222222222" as Uuid; // non-admin member
const OUTSIDER = "33333333-3333-4333-8333-333333333333" as Uuid; // not a member

type ActorKind = "administrator" | "plain-member" | "outsider";
type Action = "updateSettings" | "removeMember";

/**
 * Build a fresh service seeded with an Organization whose Administrator is
 * CREATOR and whose non-admin Member is PLAIN (granted the default Member
 * Role via a genuine invitation acceptance). Returns the org id too.
 */
async function seed(): Promise<{
  service: OrgService;
  store: InMemoryOrgStore;
  orgId: Uuid;
}> {
  const store = new InMemoryOrgStore();
  let secret = 0;
  const service = new OrgService({
    store,
    clock: new FixedClock(new Date("2024-01-01T00:00:00.000Z")),
    newId: sequentialIds(),
    generateSecret: () => `secret-${(secret += 1)}`,
  });
  const org = await service.createOrg(ctx(CREATOR), "Acme");
  const invitation = await service.invite(ctx(CREATOR), org.id, "u@ex.com");
  await service.acceptInvitation(invitation.token, PLAIN);
  return { service, store, orgId: org.id };
}

describe("Feature: streetstudio, Property 77: Administrative actions require Administrator role", () => {
  it("updateSettings/removeMember succeed only for the Administrator; a non-Administrator is denied with no change to the target resource (R26.4)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<ActorKind>(
          "administrator",
          "plain-member",
          "outsider",
        ),
        fc.constantFrom<Action>("updateSettings", "removeMember"),
        // An always-valid settings patch (plain JSON-serializable object).
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 8 }),
          fc.oneof(
            fc.string({ maxLength: 16 }),
            fc.integer(),
            fc.boolean(),
          ),
          { maxKeys: 4 },
        ),
        async (actorKind, action, patch) => {
          const { service, store, orgId } = await seed();

          const actor =
            actorKind === "administrator"
              ? CREATOR
              : actorKind === "plain-member"
                ? PLAIN
                : OUTSIDER;

          // The independent oracle: an administrative action succeeds iff the
          // actor is the Administrator of the Organization.
          const expectedSuccess = actorKind === "administrator";

          const before = store.snapshot();

          let threw = false;
          let error: unknown;
          try {
            if (action === "updateSettings") {
              await service.updateSettings(ctx(actor), orgId, patch);
            } else {
              // Target the removable non-admin Member so an Administrator's
              // removal is not blocked by the last-Administrator guard (R26.6);
              // the gating outcome (R26.4) is what this property asserts.
              await service.removeMember(ctx(actor), orgId, PLAIN);
            }
          } catch (err) {
            threw = true;
            error = err;
          }

          const after = store.snapshot();

          if (expectedSuccess) {
            // The Administrator is permitted to perform the action.
            expect(threw).toBe(false);
          } else {
            // A non-Administrator is denied with an authorization error and the
            // target resource (settings + memberships) is byte-for-byte
            // unchanged (R26.4).
            expect(threw).toBe(true);
            expect(error).toBeInstanceOf(AppError);
            expect((error as AppError).code).toBe("AUTHORIZATION_DENIED");
            expect(after).toBe(before);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
