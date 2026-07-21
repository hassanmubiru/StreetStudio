/**
 * Real PostgreSQL adapter for the RBAC persistence port ({@link RbacStore}),
 * composing the StreetJS `PgPool` (auth de-seam, ADR-0020). Satisfies the same
 * port the in-memory/repository adapter does, so the deny-by-default
 * {@link RbacAccessControl} evaluator runs unchanged on real data.
 *
 * Every query is organization-scoped, reinforcing the no-cross-organization-leak
 * guarantee (R16.4) at the storage boundary. Roles and memberships live in the
 * `roles`/`memberships` tables (the organization domain's eventual store of
 * record); DDL is idempotent so it converges with a future organizations
 * de-seam.
 */
import { PgPool } from "streetjs";
import type { MembershipRecord, RoleRecord } from "@streetstudio/database";
import type { Uuid, IsoTimestamp } from "@streetstudio/shared";
import type { RbacStore, RoleName } from "./access-control.js";

type Row = Record<string, string | null>;

export const RBAC_ROLES_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS roles (
  id              UUID PRIMARY KEY,
  organization_id UUID  NOT NULL,
  name            TEXT  NOT NULL,
  permissions     JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (organization_id, name)
);
`;

export const RBAC_MEMBERSHIPS_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS memberships (
  id              UUID PRIMARY KEY,
  organization_id UUID        NOT NULL,
  member_id       UUID        NOT NULL,
  role_id         UUID        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL,
  UNIQUE (organization_id, member_id)
);
CREATE INDEX IF NOT EXISTS memberships_org_member_idx ON memberships (organization_id, member_id);
`;

/** Create the RBAC schema (roles + memberships). Idempotent. */
export async function ensureRbacSchema(pool: PgPool): Promise<void> {
  await pool.query(RBAC_ROLES_TABLE_DDL);
  await pool.query(RBAC_MEMBERSHIPS_TABLE_DDL);
}

function parsePermissions(value: string | null): string[] {
  if (!value) return [];
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
}

function mapMembership(row: Row): MembershipRecord {
  return {
    id: row["id"] as Uuid,
    organizationId: row["organization_id"] as Uuid,
    memberId: row["member_id"] as Uuid,
    roleId: row["role_id"] as Uuid,
    createdAt: new Date(row["created_at"] as string).toISOString() as IsoTimestamp,
  };
}

function mapRole(row: Row): RoleRecord {
  return {
    id: row["id"] as Uuid,
    organizationId: row["organization_id"] as Uuid,
    name: row["name"] as string,
    permissions: parsePermissions(row["permissions"] ?? null),
  };
}

/** A {@link RbacStore} backed by real PostgreSQL. */
export function postgresRbacStore(pool: PgPool): RbacStore {
  return {
    async findMembership(organizationId: Uuid, memberId: Uuid): Promise<MembershipRecord | null> {
      const { rows } = await pool.query(
        `SELECT * FROM memberships WHERE organization_id = $1 AND member_id = $2`,
        [organizationId, memberId],
      );
      const row = rows[0] as Row | undefined;
      return row ? mapMembership(row) : null;
    },
    async findRoleById(organizationId: Uuid, roleId: Uuid): Promise<RoleRecord | null> {
      const { rows } = await pool.query(
        `SELECT * FROM roles WHERE organization_id = $1 AND id = $2`,
        [organizationId, roleId],
      );
      const row = rows[0] as Row | undefined;
      return row ? mapRole(row) : null;
    },
    async findRoleByName(organizationId: Uuid, name: RoleName): Promise<RoleRecord | null> {
      const { rows } = await pool.query(
        `SELECT * FROM roles WHERE organization_id = $1 AND name = $2`,
        [organizationId, name],
      );
      const row = rows[0] as Row | undefined;
      return row ? mapRole(row) : null;
    },
    async setMembershipRole(membership: MembershipRecord, roleId: Uuid): Promise<void> {
      await pool.query(
        `UPDATE memberships SET role_id = $3 WHERE organization_id = $1 AND id = $2`,
        [membership.organizationId, membership.id, roleId],
      );
    },
  };
}
