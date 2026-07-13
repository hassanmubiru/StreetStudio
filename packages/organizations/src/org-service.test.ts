import { describe, it, expect, beforeEach } from "vitest";
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
  ADMIN_ACTION_MEMBER_REMOVED,
  ADMIN_ACTION_SETTINGS_UPDATED,
  ADMINISTRATOR_ROLE_NAME,
  INVITATION_TTL_MS,
  isValidOrgSettings,
  MEMBER_ROLE_NAME,
  OrgService,
  type AdminAuditRecorder,
  type OrgStore,
} from "./org-service.js";
import type { AuthContext } from "@streetstudio/auth";
import type { Clock } from "@streetstudio/auth";

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

/** A clock whose "now" the test controls. */
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
  async createMembership(
    record: MembershipRecord,
  ): Promise<MembershipRecord> {
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
  async createInvitation(
    record: InvitationRecord,
  ): Promise<InvitationRecord> {
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
 * Fixtures
 * ---------------------------------------------------------------------- */

const CREATOR = "11111111-1111-4111-8111-111111111111" as Uuid;
const INVITEE = "22222222-2222-4222-8222-222222222222" as Uuid;
const OUTSIDER = "33333333-3333-4333-8333-333333333333" as Uuid;

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

/** Captures audit entries appended by administrative actions (R26.7). */
class RecordingAuditLog implements AdminAuditRecorder {
  readonly entries: {
    actor: Uuid;
    action: string;
    targetId: Uuid;
    orgId: Uuid;
    at?: Date;
  }[] = [];
  async append(input: {
    readonly actor: Uuid;
    readonly action: string;
    readonly targetId: Uuid;
    readonly orgId: Uuid;
    readonly at?: Date;
  }): Promise<void> {
    this.entries.push({ ...input });
  }
}

function makeService(
  clock: MutableClock,
  auditLog?: AdminAuditRecorder,
): {
  service: OrgService;
  store: InMemoryOrgStore;
} {
  const store = new InMemoryOrgStore();
  let secret = 0;
  const service = new OrgService({
    store,
    clock,
    newId: sequentialIds(),
    generateSecret: () => `secret-${(secret += 1)}`,
    auditLog,
  });
  return { service, store };
}

/* -------------------------------------------------------------------------
 * createOrg
 * ---------------------------------------------------------------------- */

describe("OrgService.createOrg", () => {
  let clock: MutableClock;
  beforeEach(() => {
    clock = new MutableClock(new Date("2024-01-01T00:00:00.000Z"));
  });

  it("creates an organization and assigns the creator Administrator", async () => {
    const { service, store } = makeService(clock);
    const org = await service.createOrg(ctx(CREATOR), "Acme");

    expect(org.name).toBe("Acme");
    expect(store.organizations.get(org.id)).toBeDefined();

    const membership = await store.findMembership(org.id, CREATOR);
    expect(membership).not.toBeNull();
    const role = store.roles.get(membership!.roleId);
    expect(role?.name).toBe(ADMINISTRATOR_ROLE_NAME);

    // A default Member role is seeded for invited users.
    expect(await store.findRoleByName(org.id, MEMBER_ROLE_NAME)).not.toBeNull();
  });

  it("accepts boundary names (1 and 200 chars)", async () => {
    const { service } = makeService(clock);
    await expect(service.createOrg(ctx(CREATOR), "a")).resolves.toBeDefined();
    await expect(
      service.createOrg(ctx(CREATOR), "b".repeat(200)),
    ).resolves.toBeDefined();
  });

  it("rejects empty or over-long names and persists nothing", async () => {
    const { service, store } = makeService(clock);
    await expect(service.createOrg(ctx(CREATOR), "")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(
      service.createOrg(ctx(CREATOR), "x".repeat(201)),
    ).rejects.toBeInstanceOf(AppError);
    expect(store.organizations.size).toBe(0);
    expect(store.memberships.size).toBe(0);
  });
});

/* -------------------------------------------------------------------------
 * invite
 * ---------------------------------------------------------------------- */

describe("OrgService.invite", () => {
  let clock: MutableClock;
  beforeEach(() => {
    clock = new MutableClock(new Date("2024-01-01T00:00:00.000Z"));
  });

  it("creates a pending invitation expiring exactly 7 days later", async () => {
    const { service } = makeService(clock);
    const org = await service.createOrg(ctx(CREATOR), "Acme");

    const invitation = await service.invite(ctx(CREATOR), org.id, "u@ex.com");
    expect(invitation.status).toBe("pending");
    const delta =
      new Date(invitation.expiresAt).getTime() -
      new Date(invitation.createdAt).getTime();
    expect(delta).toBe(INVITATION_TTL_MS);
  });

  it("rejects malformed emails without creating an invitation", async () => {
    const { service, store } = makeService(clock);
    const org = await service.createOrg(ctx(CREATOR), "Acme");
    await expect(
      service.invite(ctx(CREATOR), org.id, "not-an-email"),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(store.invitations.size).toBe(0);
  });

  it("denies an actor who does not belong to the organization (R4.6)", async () => {
    const { service } = makeService(clock);
    const org = await service.createOrg(ctx(CREATOR), "Acme");
    await expect(
      service.invite(ctx(OUTSIDER), org.id, "u@ex.com"),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });
});

/* -------------------------------------------------------------------------
 * acceptInvitation
 * ---------------------------------------------------------------------- */

describe("OrgService.acceptInvitation", () => {
  let clock: MutableClock;
  beforeEach(() => {
    clock = new MutableClock(new Date("2024-01-01T00:00:00.000Z"));
  });

  it("adds the invitee as a Member and marks the invitation accepted", async () => {
    const { service, store } = makeService(clock);
    const org = await service.createOrg(ctx(CREATOR), "Acme");
    const invitation = await service.invite(ctx(CREATOR), org.id, "u@ex.com");

    const membership = await service.acceptInvitation(invitation.token, INVITEE);
    expect(membership.organizationId).toBe(org.id);
    expect(membership.memberId).toBe(INVITEE);
    expect(store.invitations.get(invitation.id)?.status).toBe("accepted");

    const role = store.roles.get(membership.roleId);
    expect(role?.name).toBe(MEMBER_ROLE_NAME);
  });

  it("rejects an expired invitation and creates no membership", async () => {
    const { service, store } = makeService(clock);
    const org = await service.createOrg(ctx(CREATOR), "Acme");
    const invitation = await service.invite(ctx(CREATOR), org.id, "u@ex.com");

    clock.advance(INVITATION_TTL_MS + 1);
    await expect(
      service.acceptInvitation(invitation.token, INVITEE),
    ).rejects.toMatchObject({ code: "INVITATION_INVALID" });
    expect(await store.findMembership(org.id, INVITEE)).toBeNull();
  });

  it("rejects an already-accepted invitation", async () => {
    const { service } = makeService(clock);
    const org = await service.createOrg(ctx(CREATOR), "Acme");
    const invitation = await service.invite(ctx(CREATOR), org.id, "u@ex.com");
    await service.acceptInvitation(invitation.token, INVITEE);

    await expect(
      service.acceptInvitation(invitation.token, OUTSIDER),
    ).rejects.toMatchObject({ code: "INVITATION_INVALID" });
  });

  it("rejects a malformed or tampered token", async () => {
    const { service } = makeService(clock);
    const org = await service.createOrg(ctx(CREATOR), "Acme");
    const invitation = await service.invite(ctx(CREATOR), org.id, "u@ex.com");

    await expect(
      service.acceptInvitation("garbage", INVITEE),
    ).rejects.toMatchObject({ code: "INVITATION_INVALID" });
    await expect(
      service.acceptInvitation(invitation.token + "x", INVITEE),
    ).rejects.toMatchObject({ code: "INVITATION_INVALID" });
  });
});

/* -------------------------------------------------------------------------
 * createTeam / assignToTeam
 * ---------------------------------------------------------------------- */

describe("OrgService teams", () => {
  let clock: MutableClock;
  beforeEach(() => {
    clock = new MutableClock(new Date("2024-01-01T00:00:00.000Z"));
  });

  it("creates a team scoped to the organization", async () => {
    const { service } = makeService(clock);
    const org = await service.createOrg(ctx(CREATOR), "Acme");
    const team = await service.createTeam(ctx(CREATOR), org.id, "Eng");
    expect(team.organizationId).toBe(org.id);
    expect(team.name).toBe("Eng");
  });

  it("records a team membership for an org member", async () => {
    const { service, store } = makeService(clock);
    const org = await service.createOrg(ctx(CREATOR), "Acme");
    const team = await service.createTeam(ctx(CREATOR), org.id, "Eng");
    const invitation = await service.invite(ctx(CREATOR), org.id, "u@ex.com");
    await service.acceptInvitation(invitation.token, INVITEE);

    await service.assignToTeam(ctx(CREATOR), team.id, INVITEE);
    const rows = await store.findTeamMemberships(team.id);
    expect(rows).toEqual([{ teamId: team.id, memberId: INVITEE }]);

    // Idempotent — a second assignment adds no duplicate.
    await service.assignToTeam(ctx(CREATOR), team.id, INVITEE);
    expect(await store.findTeamMemberships(team.id)).toHaveLength(1);
  });

  it("rejects assigning a member outside the organization (R4.5)", async () => {
    const { service } = makeService(clock);
    const org = await service.createOrg(ctx(CREATOR), "Acme");
    const team = await service.createTeam(ctx(CREATOR), org.id, "Eng");
    await expect(
      service.assignToTeam(ctx(CREATOR), team.id, OUTSIDER),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("denies team creation by a non-member (R4.6)", async () => {
    const { service } = makeService(clock);
    const org = await service.createOrg(ctx(CREATOR), "Acme");
    await expect(
      service.createTeam(ctx(OUTSIDER), org.id, "Eng"),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("reports an unknown team as NOT_FOUND", async () => {
    const { service } = makeService(clock);
    await service.createOrg(ctx(CREATOR), "Acme");
    await expect(
      service.assignToTeam(ctx(CREATOR), "00000000-0000-4000-8000-ffffffffffff" as Uuid, INVITEE),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

/* -------------------------------------------------------------------------
 * Administrative controls (task 10.2)
 * ---------------------------------------------------------------------- */

describe("OrgService.updateSettings", () => {
  let clock: MutableClock;
  beforeEach(() => {
    clock = new MutableClock(new Date("2024-01-01T00:00:00.000Z"));
  });

  it("persists valid settings, returns the org, and audits (R26.1, R26.7)", async () => {
    const audit = new RecordingAuditLog();
    const { service, store } = makeService(clock, audit);
    const org = await service.createOrg(ctx(CREATOR), "Acme");

    const updated = await service.updateSettings(ctx(CREATOR), org.id, {
      theme: "dark",
      retentionDays: 30,
    });

    expect(updated.settings).toEqual({ theme: "dark", retentionDays: 30 });
    expect(store.organizations.get(org.id)?.settings).toEqual({
      theme: "dark",
      retentionDays: 30,
    });
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      actor: CREATOR,
      action: ADMIN_ACTION_SETTINGS_UPDATED,
      targetId: org.id,
      orgId: org.id,
    });
  });

  it("rejects invalid settings and retains existing settings (R26.5)", async () => {
    const { service, store } = makeService(clock);
    const org = await service.createOrg(ctx(CREATOR), "Acme");
    await service.updateSettings(ctx(CREATOR), org.id, { theme: "light" });

    // A value that does not survive a JSON round-trip is invalid.
    await expect(
      service.updateSettings(ctx(CREATOR), org.id, { broken: undefined }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    // The previously-stored settings are untouched.
    expect(store.organizations.get(org.id)?.settings).toEqual({
      theme: "light",
    });
  });

  it("denies a non-Administrator and makes no change (R26.4)", async () => {
    const { service, store } = makeService(clock);
    const org = await service.createOrg(ctx(CREATOR), "Acme");
    const invitation = await service.invite(ctx(CREATOR), org.id, "u@ex.com");
    await service.acceptInvitation(invitation.token, INVITEE);

    await expect(
      service.updateSettings(ctx(INVITEE), org.id, { theme: "dark" }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    // An outsider is likewise denied.
    await expect(
      service.updateSettings(ctx(OUTSIDER), org.id, { theme: "dark" }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(store.organizations.get(org.id)?.settings).toEqual({});
  });
});

describe("OrgService.removeMember", () => {
  let clock: MutableClock;
  beforeEach(() => {
    clock = new MutableClock(new Date("2024-01-01T00:00:00.000Z"));
  });

  it("revokes a Member's access and audits (R26.2, R26.7)", async () => {
    const audit = new RecordingAuditLog();
    const { service, store } = makeService(clock, audit);
    const org = await service.createOrg(ctx(CREATOR), "Acme");
    const invitation = await service.invite(ctx(CREATOR), org.id, "u@ex.com");
    await service.acceptInvitation(invitation.token, INVITEE);
    expect(await store.findMembership(org.id, INVITEE)).not.toBeNull();

    await service.removeMember(ctx(CREATOR), org.id, INVITEE);

    // Access revoked: the membership no longer resolves, so RBAC denies.
    expect(await store.findMembership(org.id, INVITEE)).toBeNull();
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      actor: CREATOR,
      action: ADMIN_ACTION_MEMBER_REMOVED,
      targetId: INVITEE,
      orgId: org.id,
    });
  });

  it("rejects removing the only remaining Administrator (R26.6)", async () => {
    const { service, store } = makeService(clock);
    const org = await service.createOrg(ctx(CREATOR), "Acme");

    await expect(
      service.removeMember(ctx(CREATOR), org.id, CREATOR),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // The Administrator's access and Role are retained unchanged.
    expect(await store.findMembership(org.id, CREATOR)).not.toBeNull();
  });

  it("denies a non-Administrator and removes no membership (R26.4)", async () => {
    const { service, store } = makeService(clock);
    const org = await service.createOrg(ctx(CREATOR), "Acme");
    const invitation = await service.invite(ctx(CREATOR), org.id, "u@ex.com");
    await service.acceptInvitation(invitation.token, INVITEE);

    await expect(
      service.removeMember(ctx(INVITEE), org.id, CREATOR),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(await store.findMembership(org.id, CREATOR)).not.toBeNull();
  });

  it("reports an unknown member as NOT_FOUND", async () => {
    const { service } = makeService(clock);
    const org = await service.createOrg(ctx(CREATOR), "Acme");
    await expect(
      service.removeMember(ctx(CREATOR), org.id, OUTSIDER),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("isValidOrgSettings", () => {
  it("accepts plain JSON-serializable objects", () => {
    expect(isValidOrgSettings({})).toBe(true);
    expect(isValidOrgSettings({ a: 1, b: "x", c: { nested: true } })).toBe(true);
  });

  it("rejects non-objects, arrays, and non-round-tripping values", () => {
    expect(isValidOrgSettings(null)).toBe(false);
    expect(isValidOrgSettings("nope")).toBe(false);
    expect(isValidOrgSettings([1, 2, 3])).toBe(false);
    expect(isValidOrgSettings({ fn: () => 1 })).toBe(false);
    expect(isValidOrgSettings({ u: undefined })).toBe(false);
  });
});
