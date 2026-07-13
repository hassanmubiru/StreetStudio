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
  INVITATION_TTL_MS,
  MEMBER_ROLE_NAME,
  OrgService,
  type OrgStore,
} from "./org-service.js";
import type { AuthContext } from "./service.js";
import type { Clock } from "./clock.js";

/**
 * Property 10: Invitation acceptance is valid only while pending and unexpired.
 *
 * Feature: streetstudio, Property 10: Invitation acceptance is valid only while pending and unexpired
 *
 * Validates: Requirements 4.3, 4.9
 *
 * For any invitation, {@link OrgService.acceptInvitation} succeeds *only* while
 * the invitation is pending AND unexpired AND the presented token is the
 * genuine, untampered token — adding the invited user as a Member (granted the
 * default Member Role) and marking the invitation accepted (R4.3). Conversely,
 * an expired, already-accepted, or revoked invitation — or a malformed/tampered
 * token — is rejected with `INVITATION_INVALID`, and no Membership is created
 * and the invitation's stored status is left unchanged (R4.9).
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
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
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
const INVITEE = "22222222-2222-4222-8222-222222222222" as Uuid;

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
 * Build a fresh service seeded with an Organization the CREATOR administers and
 * a single pending invitation, with the clock pinned to `at`. The invitation's
 * `createdAt` is therefore `at` and its `expiresAt` is `at + INVITATION_TTL_MS`.
 */
async function seed(at: Date): Promise<{
  service: OrgService;
  store: InMemoryOrgStore;
  clock: MutableClock;
  orgId: Uuid;
  invitation: InvitationRecord;
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
  const invitation = await service.invite(ctx(CREATOR), org.id, "u@ex.com");
  return { service, store, clock, orgId: org.id, invitation };
}

/* -------------------------------------------------------------------------
 * Generators — a scenario tag partitions the input space so that exactly one
 * precondition of "pending AND unexpired AND genuine token" is broken per
 * failure case, while "ok" exercises the success path.
 * ---------------------------------------------------------------------- */

type Scenario = "ok" | "expired" | "accepted" | "revoked" | "malformed" | "tampered";

const scenario = fc.constantFrom<Scenario>(
  "ok",
  "expired",
  "accepted",
  "revoked",
  "malformed",
  "tampered",
);

// Arbitrary creation instants across a wide but valid range, bounded so that
// created_at + 2 * TTL remains a serializable ISO timestamp.
const creationInstant = fc.date({
  min: new Date("1970-01-01T00:00:00.000Z"),
  max: new Date("2200-01-01T00:00:00.000Z"),
});

// An unexpired offset: strictly less than the TTL (isExpired uses now >= expiry).
const unexpiredOffset = fc.integer({ min: 0, max: INVITATION_TTL_MS - 1 });
// An expired offset: at or beyond the TTL.
const expiredOffset = fc
  .integer({ min: 0, max: INVITATION_TTL_MS })
  .map((extra) => INVITATION_TTL_MS + extra);

// A guaranteed-malformed token: wrong shape, wrong prefix, or empty. None of
// these can parse-and-match the genuine `ssi.<b64>.<b64>.secret-N` token.
const malformedToken = fc.oneof(
  fc.constant(""),
  fc.constant("garbage"),
  fc.constant("ssi.only.three"),
  fc.constant("ssi.a.b.c.d.e"),
  fc.string({ minLength: 1, maxLength: 30 }).map((s) => `nope.${s}`),
);

// How to tamper with the genuine token so it no longer matches in constant time.
const tamperKind = fc.constantFrom<"suffix" | "truncate" | "swapSecret">(
  "suffix",
  "truncate",
  "swapSecret",
);

function tamper(token: string, kind: "suffix" | "truncate" | "swapSecret"): string {
  switch (kind) {
    case "suffix":
      return `${token}x`;
    case "truncate":
      return token.slice(0, -1);
    case "swapSecret": {
      const parts = token.split(".");
      parts[parts.length - 1] = "tampered-secret";
      return parts.join(".");
    }
  }
}

/* -------------------------------------------------------------------------
 * Property
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 10: Invitation acceptance is valid only while pending and unexpired", () => {
  it("accepts iff pending, unexpired, and presented with the genuine token; otherwise rejects with INVITATION_INVALID and creates no membership (R4.3, R4.9)", async () => {
    await fc.assert(
      fc.asyncProperty(
        creationInstant,
        scenario,
        unexpiredOffset,
        expiredOffset,
        malformedToken,
        tamperKind,
        async (at, kind, okOffset, badOffset, badToken, tamperWith) => {
          const { service, store, clock, orgId, invitation } = await seed(at);

          // Arrange the scenario: break exactly one precondition (or none for "ok").
          let presentedToken = invitation.token;
          let expectedStatusIfRejected: InvitationStatus = "pending";

          switch (kind) {
            case "ok":
              clock.advance(okOffset); // still pending + unexpired + genuine token
              break;
            case "expired":
              clock.advance(badOffset); // pending + genuine token, but expired
              break;
            case "accepted":
              await store.setInvitationStatus(invitation, "accepted");
              expectedStatusIfRejected = "accepted";
              clock.advance(okOffset); // unexpired + genuine token, but not pending
              break;
            case "revoked":
              await store.setInvitationStatus(invitation, "revoked");
              expectedStatusIfRejected = "revoked";
              clock.advance(okOffset); // unexpired + genuine token, but not pending
              break;
            case "malformed":
              presentedToken = badToken; // pending + unexpired, but malformed token
              clock.advance(okOffset);
              break;
            case "tampered":
              presentedToken = tamper(invitation.token, tamperWith);
              clock.advance(okOffset); // pending + unexpired, but tampered token
              break;
          }

          const membershipsBefore = store.memberships.size;

          if (kind === "ok") {
            // R4.3 — success adds the invitee as a Member (default Member Role)
            // and marks the invitation accepted.
            const membership = await service.acceptInvitation(
              presentedToken,
              INVITEE,
            );
            expect(membership.organizationId).toBe(orgId);
            expect(membership.memberId).toBe(INVITEE);

            const role = store.roles.get(membership.roleId);
            expect(role?.name).toBe(MEMBER_ROLE_NAME);

            // The invitee is now a resolvable Member and the invitation accepted.
            expect(await store.findMembership(orgId, INVITEE)).not.toBeNull();
            expect(store.invitations.get(invitation.id)?.status).toBe(
              "accepted",
            );
            // Exactly one Membership was added (on top of the creator's).
            expect(store.memberships.size).toBe(membershipsBefore + 1);
          } else {
            // R4.9 — every broken precondition is rejected with INVITATION_INVALID.
            await expect(
              service.acceptInvitation(presentedToken, INVITEE),
            ).rejects.toMatchObject({ code: "INVITATION_INVALID" });
            await expect(
              service.acceptInvitation(presentedToken, INVITEE),
            ).rejects.toBeInstanceOf(AppError);

            // No Membership was created for the invitee, and the stored
            // invitation status is left unchanged by the failed attempt.
            expect(await store.findMembership(orgId, INVITEE)).toBeNull();
            expect(store.memberships.size).toBe(membershipsBefore);
            expect(store.invitations.get(invitation.id)?.status).toBe(
              expectedStatusIfRejected,
            );
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
