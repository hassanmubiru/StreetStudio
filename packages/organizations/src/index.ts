/**
 * @streetstudio/organizations
 *
 * Organizations, teams, membership, invitations, and administration. Builds on
 * the authentication/RBAC primitives in `@streetstudio/auth` (AuthContext,
 * role-management permission, clock, timestamps).
 */
export const DOMAIN =
  "Organizations, teams, membership, invitations, and administration." as const;

export {
  OrgService,
  repositoryOrgStore,
  isValidOrgSettings,
  ADMINISTRATOR_ROLE_NAME,
  MEMBER_ROLE_NAME,
  ADMIN_ACTION_SETTINGS_UPDATED,
  ADMIN_ACTION_MEMBER_REMOVED,
  INVITATION_TTL_MS,
  MAX_ORG_NAME_LENGTH,
  MAX_TEAM_NAME_LENGTH,
} from "./application/org-service.js";
export type {
  AdminAuditRecorder,
  OrgServiceDeps,
  OrgSettings,
  OrgStore,
} from "./application/org-service.js";

// Real PostgreSQL store adapter (de-seam onto real infrastructure; shares the
// roles/memberships tables with the auth RBAC store).
export {
  ensureOrganizationsSchema,
  postgresOrgStore,
  ORGANIZATIONS_TABLE_DDL,
} from "./postgres-org-store.js";
