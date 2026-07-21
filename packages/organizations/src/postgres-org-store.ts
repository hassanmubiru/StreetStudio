/**
 * Real PostgreSQL adapter for the {@link OrgStore} port, composing the StreetJS
 * `PgPool` (de-seam onto real infrastructure). Satisfies the same port the
 * in-memory/repository adapter does, so {@link OrgService} runs unchanged on
 * real data.
 *
 * Roles and memberships live in the **same `roles`/`memberships` tables** the
 * auth RBAC store persists (`@streetstudio/auth` `ensureRbacSchema`), so
 * organization administration and RBAC evaluation share one store of record.
 * Organizations, invitations, teams, and team memberships get their own tables
 * here. All queries are parameterized; DDL is idempotent.
 */
import { PgPool } from "streetjs";
import { ensureRbacSchema } from "@streetstudio/auth";
import type {
  InvitationRecord,
  MembershipRecord,
  OrganizationRecord,
  RoleRecord,
  TeamMembershipRecord,
  TeamRecord,
} from "@streetstudio/database";
import type { InvitationStatus, IsoTimestamp, Uuid } from "@streetstudio/shared";
import type { OrgStore } from "./org-service.js";

type Row = Record<string, string | null>;

const iso = (v: string): IsoTimestamp => new Date(v).toISOString() as IsoTimestamp;

export const ORGANIZATIONS_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS organizations (
  id         UUID PRIMARY KEY,
  name       TEXT        NOT NULL,
  settings   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS invitations (
  id              UUID PRIMARY KEY,
  organization_id UUID        NOT NULL,
  email           TEXT        NOT NULL,
  token           TEXT        NOT NULL,
  status          TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS teams (
  id              UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  name            TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS team_memberships (
  team_id   UUID NOT NULL,
  member_id UUID NOT NULL,
  PRIMARY KEY (team_id, member_id)
);
`;

/** Create the organizations schema (+ shared roles/memberships). Idempotent. */
export async function ensureOrganizationsSchema(pool: PgPool): Promise<void> {
  await ensureRbacSchema(pool); // shared roles + memberships tables
  await pool.query(ORGANIZATIONS_TABLE_DDL);
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapOrg(row: Row): OrganizationRecord {
  return {
    id: row["id"] as Uuid,
    name: row["name"] as string,
    settings: parseJson<Record<string, unknown>>(row["settings"] ?? null, {}),
    createdAt: iso(row["created_at"] as string),
  };
}
function mapRole(row: Row): RoleRecord {
  return {
    id: row["id"] as Uuid,
    organizationId: row["organization_id"] as Uuid,
    name: row["name"] as string,
    permissions: parseJson<string[]>(row["permissions"] ?? null, []),
  };
}
function mapMembership(row: Row): MembershipRecord {
  return {
    id: row["id"] as Uuid,
    organizationId: row["organization_id"] as Uuid,
    memberId: row["member_id"] as Uuid,
    roleId: row["role_id"] as Uuid,
    createdAt: iso(row["created_at"] as string),
  };
}
function mapInvitation(row: Row): InvitationRecord {
  return {
    id: row["id"] as Uuid,
    organizationId: row["organization_id"] as Uuid,
    email: row["email"] as string,
    token: row["token"] as string,
    status: row["status"] as InvitationStatus,
    createdAt: iso(row["created_at"] as string),
    expiresAt: iso(row["expires_at"] as string),
  };
}
function mapTeam(row: Row): TeamRecord {
  return {
    id: row["id"] as Uuid,
    organizationId: row["organization_id"] as Uuid,
    name: row["name"] as string,
  };
}

/** An {@link OrgStore} backed by real PostgreSQL. */
export function postgresOrgStore(pool: PgPool): OrgStore {
  const one = async (sql: string, params: unknown[]): Promise<Row | undefined> => {
    const { rows } = await pool.query(sql, params);
    return rows[0] as Row | undefined;
  };
  return {
    async createOrganization(record) {
      await pool.query(
        `INSERT INTO organizations (id, name, settings, created_at) VALUES ($1, $2, $3::jsonb, $4)`,
        [record.id, record.name, JSON.stringify(record.settings), record.createdAt],
      );
      return record;
    },
    async findOrganizationById(id) {
      const row = await one(`SELECT * FROM organizations WHERE id = $1`, [id]);
      return row ? mapOrg(row) : null;
    },
    async updateOrganizationSettings(record, settings) {
      await pool.query(`UPDATE organizations SET settings = $2::jsonb WHERE id = $1`, [
        record.id,
        JSON.stringify(settings),
      ]);
      return { ...record, settings };
    },

    async createRole(record) {
      await pool.query(
        `INSERT INTO roles (id, organization_id, name, permissions) VALUES ($1, $2, $3, $4::jsonb)`,
        [record.id, record.organizationId, record.name, JSON.stringify(record.permissions)],
      );
      return record;
    },
    async findRoleByName(organizationId, name) {
      const row = await one(`SELECT * FROM roles WHERE organization_id = $1 AND name = $2`, [organizationId, name]);
      return row ? mapRole(row) : null;
    },
    async findRoleById(organizationId, roleId) {
      const row = await one(`SELECT * FROM roles WHERE organization_id = $1 AND id = $2`, [organizationId, roleId]);
      return row ? mapRole(row) : null;
    },

    async createMembership(record) {
      await pool.query(
        `INSERT INTO memberships (id, organization_id, member_id, role_id, created_at) VALUES ($1, $2, $3, $4, $5)`,
        [record.id, record.organizationId, record.memberId, record.roleId, record.createdAt],
      );
      return record;
    },
    async findMembership(organizationId, memberId) {
      const row = await one(
        `SELECT * FROM memberships WHERE organization_id = $1 AND member_id = $2`,
        [organizationId, memberId],
      );
      return row ? mapMembership(row) : null;
    },
    async listMemberships(organizationId) {
      const { rows } = await pool.query(`SELECT * FROM memberships WHERE organization_id = $1`, [organizationId]);
      return (rows as Row[]).map(mapMembership);
    },
    async deleteMembership(record) {
      await pool.query(`DELETE FROM memberships WHERE id = $1`, [record.id]);
    },

    async createInvitation(record) {
      await pool.query(
        `INSERT INTO invitations (id, organization_id, email, token, status, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [record.id, record.organizationId, record.email, record.token, record.status, record.createdAt, record.expiresAt],
      );
      return record;
    },
    async findInvitationById(organizationId, invitationId) {
      const row = await one(
        `SELECT * FROM invitations WHERE organization_id = $1 AND id = $2`,
        [organizationId, invitationId],
      );
      return row ? mapInvitation(row) : null;
    },
    async setInvitationStatus(record, status) {
      await pool.query(`UPDATE invitations SET status = $2 WHERE id = $1`, [record.id, status]);
    },

    async createTeam(record) {
      await pool.query(`INSERT INTO teams (id, organization_id, name) VALUES ($1, $2, $3)`, [
        record.id,
        record.organizationId,
        record.name,
      ]);
      return record;
    },
    async findTeamById(teamId) {
      const row = await one(`SELECT * FROM teams WHERE id = $1`, [teamId]);
      return row ? mapTeam(row) : null;
    },

    async createTeamMembership(record) {
      await pool.query(
        `INSERT INTO team_memberships (team_id, member_id) VALUES ($1, $2)
         ON CONFLICT (team_id, member_id) DO NOTHING`,
        [record.teamId, record.memberId],
      );
      return record;
    },
    async findTeamMemberships(teamId) {
      const { rows } = await pool.query(`SELECT * FROM team_memberships WHERE team_id = $1`, [teamId]);
      return (rows as Row[]).map((r) => ({ teamId: r["team_id"] as Uuid, memberId: r["member_id"] as Uuid }));
    },
  };
}
