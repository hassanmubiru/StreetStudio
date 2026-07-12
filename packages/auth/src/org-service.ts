/**
 * Organization & Membership Service.
 *
 * Owns the organization, team, and invitation lifecycle described in the
 * design's "Organization & Membership Service" section and Requirement 4. The
 * service is deliberately placed in `@streetstudio/auth` rather than
 * `@streetstudio/database`: it consumes the {@link AuthContext} principal
 * (defined here) and sits alongside the RBAC evaluator and membership machinery,
 * while `@streetstudio/database` stays persistence-only. This keeps the package
 * dependency graph acyclic (`auth` → `database` → `shared`), never the reverse.
 *
 *  - {@link OrgService.createOrg} creates an Organization whose name is 1..200
 *    characters and assigns the creator the Administrator Role; a name outside
 *    that range is rejected with `VALIDATION_FAILED` and no Organization,
 *    Role, or Membership is created (R4.1, R4.7).
 *  - {@link OrgService.invite} creates a pending Invitation, scoped to the
 *    Organization, that expires exactly 7 days after its creation; a malformed
 *    email is rejected with `VALIDATION_FAILED` and no Invitation is created
 *    (R4.2, R4.8).
 *  - {@link OrgService.acceptInvitation} adds the invited user as a Member and
 *    marks the Invitation accepted, but only while it is pending and unexpired;
 *    an expired, already-accepted, or revoked Invitation is rejected with
 *    `INVITATION_INVALID` and no Membership is created (R4.3, R4.9).
 *  - {@link OrgService.createTeam} creates a Team scoped to its Organization
 *    (R4.4) and {@link OrgService.assignToTeam} records a Team membership for a
 *    Member who belongs to that same Organization (R4.5).
 *  - Every organization-scoped operation is authorization-checked: an actor who
 *    does not belong to the target Organization is denied with
 *    `AUTHORIZATION_DENIED`, so a Member can never reach into an Organization
 *    they are not part of (R4.6).
 *
 * Administrative controls — settings updates, member removal, last-Administrator
 * retention, and Administrator-only gating — are layered on separately (task
 * 10.2). This service exposes the membership/role primitives (Administrator and
 * Member roles seeded at creation, org-scoped authorization) those controls
 * build on, and takes no dependency on them.
 *
 * Persistence is reached only through the narrow {@link OrgStore} port, which
 * keeps the service decoupled from the concrete database layer and trivially
 * unit-testable with in-memory fakes. The default production adapter
 * ({@link repositoryOrgStore}) is backed by the repositories exposed by
 * `@streetstudio/database`. Time is read through an injectable {@link Clock} so
 * the +7-day expiry and pending/unexpired checks are deterministic under test.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { newUuid } from "@streetstudio/database";
import type {
  InvitationRecord,
  MembershipRecord,
  OrganizationRecord,
  Repositories,
  RoleRecord,
  TeamMembershipRecord,
  TeamRecord,
} from "@streetstudio/database";
import { AppError } from "@streetstudio/shared";
import type { InvitationStatus, IsoTimestamp, Uuid } from "@streetstudio/shared";
import { ROLE_MANAGEMENT_PERMISSION } from "./access-control.js";
import { systemClock, type Clock } from "./clock.js";
import type { AuthContext } from "./service.js";
import { toIsoTimestamp } from "./tokens.js";

/** Maximum length of an Organization name (Requirement 4.1, 4.7). */
export const MAX_ORG_NAME_LENGTH = 200;

/** Maximum length of a Team name (kept consistent with organizations). */
export const MAX_TEAM_NAME_LENGTH = 200;

/** Invitation lifetime: an invitation expires 7 days after creation (R4.2). */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Name of the Role granted to an Organization's creator (Administrator). */
export const ADMINISTRATOR_ROLE_NAME = "Administrator";

/** Name of the default Role granted to an invited Member on acceptance. */
export const MEMBER_ROLE_NAME = "Member";

/** Audit `action` recorded when an Organization's settings are updated (R26.7). */
export const ADMIN_ACTION_SETTINGS_UPDATED = "org.settings.updated";

/** Audit `action` recorded when a Member is removed from an Organization (R26.7). */
export const ADMIN_ACTION_MEMBER_REMOVED = "org.member.removed";

/**
 * Permissions seeded on the Administrator Role. Includes the role-management
 * permission the RBAC evaluator gates role assignment on, so the creator can
 * administer the Organization from the outset.
 */
const ADMINISTRATOR_PERMISSIONS: readonly string[] = [
  ROLE_MANAGEMENT_PERMISSION,
];

/** Permissions seeded on the default Member Role. */
const MEMBER_PERMISSIONS: readonly string[] = [];

/** Prefix on every invitation token, used as a cheap malformed-input guard. */
const INVITATION_TOKEN_PREFIX = "ssi";

/** Random bytes in the token's secret component (256 bits of entropy). */
const TOKEN_SECRET_BYTES = 32;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when `email` is a syntactically well-formed, bounded email address. */
function isWellFormedEmail(email: string): boolean {
  return (
    typeof email === "string" && email.length <= 254 && EMAIL_RE.test(email)
  );
}

/**
 * Organization settings payload. A free-form JSON object; individual keys are
 * not constrained by this service. Structural validation (R26.5) lives in
 * {@link isValidOrgSettings} and can be replaced with a domain-specific
 * validator via {@link OrgServiceDeps.validateOrgSettings}.
 */
export type OrgSettings = Record<string, unknown>;

/**
 * Default structural validator for Organization settings. Accepts a plain,
 * JSON-serializable object and rejects everything else — non-objects, arrays,
 * and objects carrying values that do not survive a JSON round-trip (functions,
 * `undefined`, cyclic references). This makes {@link OrgService.updateSettings}
 * validation atomic: a settings payload is either wholly acceptable and
 * persisted, or rejected with nothing stored (R26.1, R26.5).
 */
export function isValidOrgSettings(settings: unknown): settings is OrgSettings {
  if (
    typeof settings !== "object" ||
    settings === null ||
    Array.isArray(settings)
  ) {
    return false;
  }
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(settings);
  } catch {
    return false; // cyclic or otherwise non-serializable
  }
  if (serialized === undefined) return false;
  // A dropped top-level key (function/undefined/symbol value) means the object
  // would not round-trip faithfully — treat it as invalid rather than silently
  // mutating the caller's payload.
  const roundTripped = JSON.parse(serialized) as Record<string, unknown>;
  return (
    Object.keys(roundTripped).length ===
    Object.keys(settings as Record<string, unknown>).length
  );
}

/**
 * Narrow recorder seam for the Audit Log used to record successful
 * administrative actions (R26.7). Structurally compatible with the
 * `AuditLog.append` surface exposed by `@streetstudio/database`, so the
 * production `AuditLog` can be injected directly while tests supply a trivial
 * fake. Recording is best-effort from the service's perspective: it is invoked
 * only after the administrative change has already been persisted.
 */
export interface AdminAuditRecorder {
  append(input: {
    readonly actor: Uuid;
    readonly action: string;
    readonly targetId: Uuid;
    readonly orgId: Uuid;
    readonly at?: Date;
  }): Promise<void>;
}

/**
 * Persistence port for the Organization & Membership Service. Deliberately
 * narrow: the service creates organizations/roles/memberships/teams/invitations,
 * resolves them by their owning scope, and flips an invitation's status. Every
 * organization-scoped read is keyed by `organizationId` so no query can reach
 * across tenants; the two by-global-id lookups
 * ({@link OrgStore.findTeamById}, {@link OrgStore.findMembershipsOfMember})
 * exist so the service can resolve a resource and then authorize against its
 * owning organization (R4.6).
 */
export interface OrgStore {
  /** Persist a new Organization and return it. */
  createOrganization(record: OrganizationRecord): Promise<OrganizationRecord>;
  /** Find an Organization by id, or null when absent. */
  findOrganizationById(id: Uuid): Promise<OrganizationRecord | null>;

  /** Persist a new Role and return it. */
  createRole(record: RoleRecord): Promise<RoleRecord>;
  /** Find a Role by name within an Organization, or null when absent. */
  findRoleByName(organizationId: Uuid, name: string): Promise<RoleRecord | null>;

  /** Persist a new Membership and return it. */
  createMembership(record: MembershipRecord): Promise<MembershipRecord>;
  /** The Member's Membership in `organizationId`, or null when not a member. */
  findMembership(
    organizationId: Uuid,
    memberId: Uuid,
  ): Promise<MembershipRecord | null>;

  /** Persist a new Invitation and return it. */
  createInvitation(record: InvitationRecord): Promise<InvitationRecord>;
  /** Find an Invitation by id within its Organization, or null when absent. */
  findInvitationById(
    organizationId: Uuid,
    invitationId: Uuid,
  ): Promise<InvitationRecord | null>;
  /** Replace `record` with its status set to `status`, retaining other fields. */
  setInvitationStatus(
    record: InvitationRecord,
    status: InvitationStatus,
  ): Promise<void>;

  /** Persist a new Team and return it. */
  createTeam(record: TeamRecord): Promise<TeamRecord>;
  /** Resolve a Team by its global id (org discovered from the record), or null. */
  findTeamById(teamId: Uuid): Promise<TeamRecord | null>;

  /** Persist a Team membership. */
  createTeamMembership(
    record: TeamMembershipRecord,
  ): Promise<TeamMembershipRecord>;
  /** Existing memberships of a Team, used to keep assignment idempotent. */
  findTeamMemberships(teamId: Uuid): Promise<TeamMembershipRecord[]>;
}

/** Dependencies required to construct an {@link OrgService}. */
export interface OrgServiceDeps {
  /** Organization/membership persistence port. */
  readonly store: OrgStore;
  /** Time source; defaults to the system clock. */
  readonly clock?: Clock;
  /** UUID generator; defaults to the database id generator. */
  readonly newId?: () => Uuid;
  /** Random-secret generator for invitation tokens; defaults to a CSPRNG token. */
  readonly generateSecret?: () => string;
}

/** Generate a URL-safe, 256-bit random invitation-token secret component. */
function defaultGenerateSecret(): string {
  return randomBytes(TOKEN_SECRET_BYTES).toString("base64url");
}

/** The parsed components of a presented invitation token. */
interface ParsedToken {
  readonly organizationId: Uuid;
  readonly invitationId: Uuid;
}

export class OrgService {
  private readonly store: OrgStore;
  private readonly clock: Clock;
  private readonly newId: () => Uuid;
  private readonly generateSecret: () => string;

  constructor(deps: OrgServiceDeps) {
    this.store = deps.store;
    this.clock = deps.clock ?? systemClock;
    this.newId = deps.newId ?? newUuid;
    this.generateSecret = deps.generateSecret ?? defaultGenerateSecret;
  }

  /**
   * Create an Organization on behalf of `actor` and assign the creator the
   * Administrator Role (R4.1). The name must be 1..200 characters; a name that
   * is empty or longer than {@link MAX_ORG_NAME_LENGTH} is rejected with
   * `VALIDATION_FAILED` and nothing is persisted (R4.7).
   *
   * On success the Organization is seeded with an Administrator Role (holding
   * the role-management permission) and a default Member Role, and the creator
   * is recorded as an Administrator Member. The Member Role is what invited
   * users receive when they accept an invitation.
   */
  async createOrg(actor: AuthContext, name: string): Promise<OrganizationRecord> {
    if (name.length < 1 || name.length > MAX_ORG_NAME_LENGTH) {
      throw new AppError("VALIDATION_FAILED");
    }

    const now = this.nowIso();
    const organization: OrganizationRecord = {
      id: this.newId(),
      name,
      settings: {},
      createdAt: now,
    };
    await this.store.createOrganization(organization);

    const adminRole: RoleRecord = {
      id: this.newId(),
      organizationId: organization.id,
      name: ADMINISTRATOR_ROLE_NAME,
      permissions: [...ADMINISTRATOR_PERMISSIONS],
    };
    await this.store.createRole(adminRole);

    // Seed a default Member role so invited users have a role to be granted.
    const memberRole: RoleRecord = {
      id: this.newId(),
      organizationId: organization.id,
      name: MEMBER_ROLE_NAME,
      permissions: [...MEMBER_PERMISSIONS],
    };
    await this.store.createRole(memberRole);

    const membership: MembershipRecord = {
      id: this.newId(),
      organizationId: organization.id,
      memberId: actor.memberId,
      roleId: adminRole.id,
      createdAt: now,
    };
    await this.store.createMembership(membership);

    return organization;
  }

  /**
   * Invite a user to an Organization by email (R4.2). The `actor` must belong
   * to `orgId`, otherwise the request is denied with `AUTHORIZATION_DENIED` and
   * no Invitation is created (R4.6). A malformed email is rejected with
   * `VALIDATION_FAILED` and no Invitation is created (R4.8). On success a
   * pending Invitation is created whose `expiresAt` is exactly
   * {@link INVITATION_TTL_MS} (7 days) after its `createdAt`.
   *
   * The returned record carries the opaque `token`; the token is the invitation
   * deliverable (transported to the invitee out of band) and is required by
   * {@link acceptInvitation}.
   */
  async invite(
    actor: AuthContext,
    orgId: Uuid,
    email: string,
  ): Promise<InvitationRecord> {
    await this.requireMembership(orgId, actor.memberId);

    if (!isWellFormedEmail(email)) {
      throw new AppError("VALIDATION_FAILED");
    }

    const createdAt = this.clock.now();
    const expiresAt = new Date(createdAt.getTime() + INVITATION_TTL_MS);
    const invitationId = this.newId();
    const invitation: InvitationRecord = {
      id: invitationId,
      organizationId: orgId,
      email,
      token: formatToken(orgId, invitationId, this.generateSecret()),
      status: "pending",
      createdAt: toIsoTimestamp(createdAt),
      expiresAt: toIsoTimestamp(expiresAt),
    };
    return this.store.createInvitation(invitation);
  }

  /**
   * Accept an Invitation identified by its `token`, adding `member` to the
   * Organization and marking the Invitation accepted (R4.3). Acceptance is
   * valid only while the Invitation is pending and unexpired; a malformed,
   * unknown, expired, already-accepted, or revoked token is rejected with
   * `INVITATION_INVALID` and no Membership is created (R4.9).
   *
   * The new Member is granted the Organization's default Member Role. Accepting
   * again when the invitee already belongs to the Organization returns the
   * existing Membership and marks the Invitation accepted (idempotent).
   */
  async acceptInvitation(
    token: string,
    member: Uuid,
  ): Promise<MembershipRecord> {
    const parsed = parseToken(token);
    if (!parsed) {
      throw new AppError("INVITATION_INVALID");
    }

    const invitation = await this.store.findInvitationById(
      parsed.organizationId,
      parsed.invitationId,
    );
    if (
      !invitation ||
      !tokensMatch(invitation.token, token) ||
      invitation.status !== "pending" ||
      this.isExpired(invitation.expiresAt)
    ) {
      throw new AppError("INVITATION_INVALID");
    }

    const orgId = invitation.organizationId;
    const existing = await this.store.findMembership(orgId, member);
    if (existing) {
      await this.store.setInvitationStatus(invitation, "accepted");
      return existing;
    }

    const memberRole = await this.store.findRoleByName(orgId, MEMBER_ROLE_NAME);
    if (!memberRole) {
      // The Organization is missing its seeded Member role — a data-integrity
      // fault, not a client error.
      throw new AppError("CONFIGURATION_INVALID");
    }

    const membership: MembershipRecord = {
      id: this.newId(),
      organizationId: orgId,
      memberId: member,
      roleId: memberRole.id,
      createdAt: this.nowIso(),
    };
    const created = await this.store.createMembership(membership);
    await this.store.setInvitationStatus(invitation, "accepted");
    return created;
  }

  /**
   * Create a Team scoped to `orgId` (R4.4). The `actor` must belong to `orgId`,
   * otherwise the request is denied with `AUTHORIZATION_DENIED` and no Team is
   * created (R4.6). The name must be 1..{@link MAX_TEAM_NAME_LENGTH} characters.
   */
  async createTeam(
    actor: AuthContext,
    orgId: Uuid,
    name: string,
  ): Promise<TeamRecord> {
    await this.requireMembership(orgId, actor.memberId);

    if (name.length < 1 || name.length > MAX_TEAM_NAME_LENGTH) {
      throw new AppError("VALIDATION_FAILED");
    }

    const team: TeamRecord = {
      id: this.newId(),
      organizationId: orgId,
      name,
    };
    return this.store.createTeam(team);
  }

  /**
   * Assign `member` to the Team identified by `teamId`, recording the Team
   * membership (R4.5). The Team is resolved from its global id, then the request
   * is authorized in the Team's owning Organization: the `actor` must belong to
   * that Organization (R4.6) and so must the `member` being assigned (R4.5).
   * An unknown Team is `NOT_FOUND`; a `member` outside the Organization is
   * rejected with `VALIDATION_FAILED`. The assignment is idempotent.
   */
  async assignToTeam(
    actor: AuthContext,
    teamId: Uuid,
    member: Uuid,
  ): Promise<void> {
    const team = await this.store.findTeamById(teamId);
    if (!team) {
      throw new AppError("NOT_FOUND");
    }

    const orgId = team.organizationId;
    // R4.6 — the actor must belong to the Team's owning Organization.
    await this.requireMembership(orgId, actor.memberId);

    // R4.5 — the assignee must belong to that same Organization.
    const memberMembership = await this.store.findMembership(orgId, member);
    if (!memberMembership) {
      throw new AppError("VALIDATION_FAILED");
    }

    const existing = await this.store.findTeamMemberships(teamId);
    if (existing.some((tm) => tm.memberId === member)) {
      return; // already assigned — idempotent
    }

    await this.store.createTeamMembership({ teamId, memberId: member });
  }

  /* -------------------------- internals -------------------------------- */

  /**
   * Ensure `memberId` belongs to `organizationId`; deny cross-organization
   * access otherwise (R4.6). Returns the Membership on success.
   */
  private async requireMembership(
    organizationId: Uuid,
    memberId: Uuid,
  ): Promise<MembershipRecord> {
    const membership = await this.store.findMembership(
      organizationId,
      memberId,
    );
    if (!membership) {
      throw new AppError("AUTHORIZATION_DENIED");
    }
    return membership;
  }

  private isExpired(expiresAt: IsoTimestamp): boolean {
    return this.clock.now().getTime() >= new Date(expiresAt).getTime();
  }

  private nowIso(): IsoTimestamp {
    return toIsoTimestamp(this.clock.now());
  }
}

/* ---------------------------- token helpers ---------------------------- */

/**
 * Build an invitation token from its parts. The organization and invitation
 * ids are base64url-encoded (so they cannot collide with the `.` delimiter) and
 * the random secret is appended last. Embedding the ids lets
 * {@link OrgService.acceptInvitation} locate the tenant-scoped Invitation
 * without a cross-organization scan; security rests on the random secret, which
 * is compared against the stored token in constant time.
 */
function formatToken(
  organizationId: Uuid,
  invitationId: Uuid,
  secret: string,
): string {
  return [
    INVITATION_TOKEN_PREFIX,
    Buffer.from(organizationId, "utf8").toString("base64url"),
    Buffer.from(invitationId, "utf8").toString("base64url"),
    secret,
  ].join(".");
}

/** Parse an invitation token, returning null for any malformed input. */
function parseToken(token: unknown): ParsedToken | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [prefix, orgB64, invB64, secret] = parts as [
    string,
    string,
    string,
    string,
  ];
  if (prefix !== INVITATION_TOKEN_PREFIX || secret.length === 0) return null;
  const organizationId = decodeSegment(orgB64);
  const invitationId = decodeSegment(invB64);
  if (organizationId === null || invitationId === null) return null;
  return { organizationId, invitationId };
}

/** Decode a base64url id segment, returning null when it is empty/invalid. */
function decodeSegment(segment: string): string | null {
  if (segment.length === 0) return null;
  const decoded = Buffer.from(segment, "base64url").toString("utf8");
  return decoded.length > 0 ? decoded : null;
}

/** Constant-time comparison of a presented token against the stored token. */
function tokensMatch(stored: string, presented: string): boolean {
  const a = Buffer.from(stored, "utf8");
  const b = Buffer.from(presented, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---------------------------- repository adapter ----------------------- */

/**
 * Default {@link OrgStore} backed by the repositories exposed by
 * `@streetstudio/database`.
 *
 * Organization-scoped reads/writes go through the tenant-scoped repositories,
 * which constrain every query to a single organization. Two operations resolve
 * a resource by a globally-unique id before authorization happens in the owning
 * scope: {@link OrgStore.findTeamById} uses the tenant repository's unscoped
 * lookup. Status changes on an Invitation use a delete + re-insert soft update
 * (the tenant repository exposes no in-place update), preserving the record's
 * identity and other fields — the same pattern the API-key and RBAC stores use.
 */
export function repositoryOrgStore(
  repositories: Pick<
    Repositories,
    | "organizations"
    | "roles"
    | "memberships"
    | "invitations"
    | "teams"
    | "teamMemberships"
  >,
): OrgStore {
  const {
    organizations,
    roles,
    memberships,
    invitations,
    teams,
    teamMemberships,
  } = repositories;
  return {
    createOrganization(
      record: OrganizationRecord,
    ): Promise<OrganizationRecord> {
      return organizations.insert(record);
    },
    findOrganizationById(id: Uuid): Promise<OrganizationRecord | null> {
      return organizations.findById(id);
    },
    createRole(record: RoleRecord): Promise<RoleRecord> {
      return roles.insert(record);
    },
    async findRoleByName(
      organizationId: Uuid,
      name: string,
    ): Promise<RoleRecord | null> {
      const all = await roles.listByOrganization(organizationId);
      return all.find((r) => r.name === name) ?? null;
    },
    createMembership(record: MembershipRecord): Promise<MembershipRecord> {
      return memberships.insert(record);
    },
    async findMembership(
      organizationId: Uuid,
      memberId: Uuid,
    ): Promise<MembershipRecord | null> {
      const all = await memberships.listByOrganization(organizationId);
      return all.find((m) => m.memberId === memberId) ?? null;
    },
    createInvitation(record: InvitationRecord): Promise<InvitationRecord> {
      return invitations.insert(record);
    },
    findInvitationById(
      organizationId: Uuid,
      invitationId: Uuid,
    ): Promise<InvitationRecord | null> {
      return invitations.findById(organizationId, invitationId);
    },
    async setInvitationStatus(
      record: InvitationRecord,
      status: InvitationStatus,
    ): Promise<void> {
      await invitations.deleteById(record.organizationId, record.id);
      await invitations.insert({ ...record, status });
    },
    createTeam(record: TeamRecord): Promise<TeamRecord> {
      return teams.insert(record);
    },
    findTeamById(teamId: Uuid): Promise<TeamRecord | null> {
      return teams.findByIdUnscoped(teamId);
    },
    createTeamMembership(
      record: TeamMembershipRecord,
    ): Promise<TeamMembershipRecord> {
      return teamMemberships.insert(record);
    },
    findTeamMemberships(teamId: Uuid): Promise<TeamMembershipRecord[]> {
      return teamMemberships.listByTeam(teamId);
    },
  };
}
