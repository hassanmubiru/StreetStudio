/**
 * @streetstudio/organizations
 *
 * Organizations, teams, membership, invitations, and administration. Builds on
 * the authentication/RBAC primitives in `@streetstudio/auth` (AuthContext,
 * role-management permission, clock, timestamps).
 * 
 * Follows Charter-compliant structure:
 * - domain/: Pure business logic with aggregates and domain services
 * - application/: Use cases, application services, and ports 
 * - infrastructure/: Concrete implementations and external adapters
 * - presentation/: DTOs and API contracts
 * - tests/: All test types organized by layer
 */
export const DOMAIN =
  "Organizations, teams, membership, invitations, and administration." as const;

// Domain layer exports
export {
  Organization,
  Invitation,
  Team,
  TeamMembership,
  InvitationToken,
  isValidOrgSettings,
  OrganizationDomainError,
  InvitationDomainError,
  TeamDomainError,
  MAX_ORG_NAME_LENGTH,
  MAX_TEAM_NAME_LENGTH,
  INVITATION_TTL_MS,
  type OrganizationProps,
  type InvitationProps,
  type TeamProps,
  type TeamMembershipProps,
  type OrgSettings,
} from "./domain/index.js";

// Application layer exports  
export {
  OrgService,
  repositoryOrgStore,
  ADMINISTRATOR_ROLE_NAME,
  MEMBER_ROLE_NAME,
  ADMIN_ACTION_SETTINGS_UPDATED,
  ADMIN_ACTION_MEMBER_REMOVED,
  type AdminAuditRecorder,
  type OrgServiceDeps,
  type OrgStore,
} from "./application/index.js";

// Infrastructure layer exports
export {
  ensureOrganizationsSchema,
  postgresOrgStore,
  ORGANIZATIONS_TABLE_DDL,
} from "./infrastructure/index.js";

// Presentation layer exports
export type {
  CreateOrganizationRequest,
  UpdateOrganizationSettingsRequest,
  CreateInvitationRequest,
  AcceptInvitationRequest,
  CreateTeamRequest,
  AssignToTeamRequest,
  RemoveMemberRequest,
  OrganizationDto,
  InvitationDto,
  TeamDto,
  MembershipDto,
  TeamMembershipDto,
  OrganizationListResponse,
  InvitationListResponse,
  TeamListResponse,
  MembershipListResponse,
} from "./presentation/index.js";
