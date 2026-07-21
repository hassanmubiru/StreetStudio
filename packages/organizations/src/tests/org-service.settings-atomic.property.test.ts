import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type {
  InvitationRecord,
  MembershipRecord,
  OrganizationRecord,
  RoleRecord,
  TeamMembershipRecord,
  TeamRecord,
} from "@streetstudio/database";
import { AppError } from "@streetstudio/shared";
import type { InvitationStatus, Uuid } from "@streetstudio/shared";
import {
  isValidOrgSettings,
  OrgService,
  type OrgSettings,
  type OrgStore,
} from "./org-service.js";
import type { AuthContext } from "@streetstudio/auth";
import type { Clock } from "@streetstudio/auth";

/**
 * Property 75: Organization settings updates are validated atomically.
 *
 * Feature: streetstudio, Property 75: Organization settings updates are validated atomically
 *
 * Validates: Requirements 26.1, 26.5
 *
 * `updateSettings(actor, org, patch)` applies a settings update all-or-nothing:
 *
 *  - WHEN the update is valid (both the patch and the settings that result from
 *    merging it over the current settings survive validation), the merged
 *    settings are persisted and returned (R26.1); AND
 *  - IF the update fails validation, the request is rejected with
 *    `VALIDATION_FAILED` and the Organization's previously-stored settings are
 *    retained byte-for-byte unchanged — no partial application (R26.5).
 *
 * The test seeds an Organization with arbitrary valid settings, snapshots the
 * whole Organization record, then applies an arbitrary patch (which may or may
 * not be valid) and asserts the outcome against an independent oracle
 * ({@link isValidOrgSettings}). On any rejection the entire stored record must
 * be identical to the snapshot.
 */

/* -------------------------------------------------------------------------
 * Test doubles (logic-only; no database)
 * ---------------------------------------------------------------------- */

/** A clock whose "now" is fixed; time is irrelevant to settings validation. */
class FixedClock implements Clock {
  constructor(private readonly current: Date) {}
  now(): Date {
    return this.current;
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

const ADMIN = "11111111-1111-4111-8111-111111111111" as Uuid;
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

/* -------------------------------------------------------------------------
 * Generators
 *
 * `validValue` produces JSON-round-trippable values; `invalidValue` produces
 * values that a plain object would silently drop on a JSON round-trip
 * (undefined, functions, symbols), which the default validator rejects. A patch
 * built with any invalid value is therefore invalid, letting the test explore
 * both the success and the rejection branch of updateSettings.
 * ---------------------------------------------------------------------- */

const validLeaf = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
);

const validValue: fc.Arbitrary<unknown> = fc.oneof(
  validLeaf,
  fc.array(validLeaf, { maxLength: 4 }),
  fc.dictionary(fc.string(), validLeaf, { maxKeys: 4 }),
);

const invalidValue: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(undefined),
  fc.constant(function noop() {}),
  fc.constant(Symbol("s")),
);

/** A valid settings object used to seed the Organization before the update. */
const validSettings: fc.Arbitrary<OrgSettings> = fc.dictionary(
  fc.string(),
  validValue,
  { maxKeys: 5 },
);

/**
 * An arbitrary settings patch: a plain object whose entries mix valid and
 * (occasionally) invalid values, so both branches of the validation contract
 * are exercised.
 */
const settingsPatch: fc.Arbitrary<OrgSettings> = fc
  .array(
    fc.tuple(
      fc.string({ maxLength: 12 }),
      fc.oneof({ weight: 4, arbitrary: validValue }, { weight: 1, arbitrary: invalidValue }),
    ),
    { maxLength: 6 },
  )
  .map((entries) => {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of entries) obj[key] = value;
    return obj;
  });

describe("Feature: streetstudio, Property 75: Organization settings updates are validated atomically", () => {
  it("applies valid updates and, on validation failure, retains prior settings unchanged with no partial application (R26.1, R26.5)", async () => {
    await fc.assert(
      fc.asyncProperty(
        validSettings,
        settingsPatch,
        async (initialSettings, patch) => {
          const { service, store } = makeService();
          const org = await service.createOrg(ctx(ADMIN), "Acme");

          // Seed arbitrary, valid prior settings. This always succeeds because
          // initialSettings is generated to be valid.
          await service.updateSettings(ctx(ADMIN), org.id, initialSettings);

          // Snapshot the ENTIRE stored record before the update under test, so
          // we can prove atomicity: on failure nothing (not just settings)
          // changes.
          const beforeRecord = store.organizations.get(org.id)!;
          const priorSettings = beforeRecord.settings;
          const beforeSnapshot = structuredCloneish(beforeRecord);

          // Oracle: the update is accepted iff BOTH the patch and the merged
          // result pass the same validator the service uses.
          const merged: OrgSettings = { ...priorSettings, ...patch };
          const expectedValid =
            isValidOrgSettings(patch) && isValidOrgSettings(merged);

          let threw: unknown;
          let result: OrganizationRecord | undefined;
          try {
            result = await service.updateSettings(ctx(ADMIN), org.id, patch);
          } catch (err) {
            threw = err;
          }

          const afterRecord = store.organizations.get(org.id)!;

          if (expectedValid) {
            // R26.1 — the merged settings are persisted and returned.
            expect(threw).toBeUndefined();
            expect(result).toBeDefined();
            expect(result!.settings).toEqual(merged);
            expect(afterRecord.settings).toEqual(merged);
          } else {
            // R26.5 — rejected with a validation error and the prior record is
            // retained byte-for-byte unchanged (atomic: no partial write).
            expect(threw).toBeInstanceOf(AppError);
            expect((threw as AppError).code).toBe("VALIDATION_FAILED");
            expect(structuredCloneish(afterRecord)).toEqual(beforeSnapshot);
            expect(afterRecord.settings).toEqual(priorSettings);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

/** A structural clone that survives our valid-value space (JSON round-trip). */
function structuredCloneish<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
