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
import { INVITATION_TTL_MS, OrgService, type OrgStore } from "./org-service.js";
import type { AuthContext } from "./service.js";
import type { Clock } from "./clock.js";

/**
 * Property 9: Invitations expire seven days after creation.
 *
 * Feature: streetstudio, Property 9: Invitations expire seven days after creation
 *
 * Validates: Requirements 4.2, 4.8
 *
 * For any well-formed invitation email created at an arbitrary instant,
 * {@link OrgService.invite} produces a *pending* invitation, scoped to the
 * Organization, whose `expiresAt` is exactly INVITATION_TTL_MS (7 days) after
 * its `createdAt` — and whose `createdAt` is the creation instant (R4.2).
 * Conversely, for any malformed email the request is rejected with
 * `VALIDATION_FAILED` and no invitation is persisted (R4.8).
 */

/* -------------------------------------------------------------------------
 * Test doubles — a controllable clock and an in-memory OrgStore, mirroring the
 * tenant-scoping and by-id semantics of the real repository adapter.
 * ---------------------------------------------------------------------- */

/** A clock whose "now" the test controls (mirrors org-service.test.ts). */
class MutableClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  set(next: Date): void {
    this.current = next;
  }
}

/** An in-memory {@link OrgStore} sufficient to exercise the service logic. */
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

const CREATOR = "11111111-1111-4111-8111-111111111111" as Uuid;

function ctx(memberId: Uuid): AuthContext {
  return { memberId };
}

/** Deterministic, monotonically increasing id generator for tests. */
function sequentialIds(): () => Uuid {
  let n = 0;
  return () => {
    n += 1;
    const hex = n.toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${hex}` as Uuid;
  };
}

/**
 * Build a fresh service seeded with an Organization the CREATOR administers,
 * with the clock pinned to `at`. Returns the org id so callers can invite.
 */
async function seed(at: Date): Promise<{
  service: OrgService;
  store: InMemoryOrgStore;
  clock: MutableClock;
  orgId: Uuid;
}> {
  const clock = new MutableClock(at);
  const store = new InMemoryOrgStore();
  let secret = 0;
  const service = new OrgService({
    store,
    clock,
    newId: sequentialIds(),
    generateSecret: () => `secret-${(secret += 1)}`,
  });
  const org = await service.createOrg(ctx(CREATOR), "Acme");
  return { service, store, clock, orgId: org.id };
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

// The service's own well-formed-email predicate, replicated so the generators
// can partition the input space into well-formed and malformed addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isWellFormedEmail(email: string): boolean {
  return (
    typeof email === "string" && email.length <= 254 && EMAIL_RE.test(email)
  );
}

// Local part / label characters: printable, no whitespace and no "@" or ".".
const labelChar = fc.constantFrom(
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_+".split(
    "",
  ),
);
const label = fc.array(labelChar, { minLength: 1, maxLength: 12 }).map((cs) =>
  cs.join(""),
);

// A well-formed address: local@domain.tld, all bounded so the total stays
// comfortably under the 254-char limit.
const wellFormedEmail = fc
  .tuple(label, label, label)
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)
  .filter(isWellFormedEmail);

// A malformed address: any arbitrary string that fails the well-formed check
// (missing "@", whitespace, no dotted domain, empty, over-long, ...).
const malformedEmail = fc
  .string({ maxLength: 40 })
  .filter((s) => !isWellFormedEmail(s));

// Arbitrary creation instants across a wide but valid range. Bounded so that
// created_at + 7 days always remains a serializable ISO timestamp.
const creationInstant = fc.date({
  min: new Date("1970-01-01T00:00:00.000Z"),
  max: new Date("2200-01-01T00:00:00.000Z"),
});

/* -------------------------------------------------------------------------
 * Property
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 9: Invitations expire seven days after creation", () => {
  // R4.2 — a well-formed invite yields a pending, org-scoped invitation whose
  // expiry is exactly 7 days after its creation instant.
  it("creates a pending invitation expiring exactly 7 days after creation", async () => {
    await fc.assert(
      fc.asyncProperty(
        creationInstant,
        wellFormedEmail,
        async (at, email) => {
          const { service, store, orgId } = await seed(at);

          const invitation = await service.invite(ctx(CREATOR), orgId, email);

          // Pending, scoped to the org, and persisted.
          expect(invitation.status).toBe("pending");
          expect(invitation.organizationId).toBe(orgId);
          expect(invitation.email).toBe(email);
          expect(store.invitations.get(invitation.id)).toBeDefined();

          // created_at is the creation instant; expiry is exactly +7 days.
          const createdMs = new Date(invitation.createdAt).getTime();
          const expiresMs = new Date(invitation.expiresAt).getTime();
          expect(createdMs).toBe(at.getTime());
          expect(expiresMs - createdMs).toBe(INVITATION_TTL_MS);
        },
      ),
      { numRuns: 200 },
    );
  });

  // R4.8 — a malformed email is rejected with VALIDATION_FAILED and no
  // invitation is created.
  it("rejects malformed emails with VALIDATION_FAILED and creates no invitation", async () => {
    await fc.assert(
      fc.asyncProperty(
        creationInstant,
        malformedEmail,
        async (at, email) => {
          const { service, store, orgId } = await seed(at);

          await expect(
            service.invite(ctx(CREATOR), orgId, email),
          ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
          await expect(
            service.invite(ctx(CREATOR), orgId, email),
          ).rejects.toBeInstanceOf(AppError);

          // Nothing was persisted.
          expect(store.invitations.size).toBe(0);
        },
      ),
      { numRuns: 200 },
    );
  });
});
