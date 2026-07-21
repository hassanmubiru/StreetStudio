/**
 * Organizations domain layer exports.
 * 
 * Pure business logic with no framework dependencies.
 * Contains aggregates, entities, value objects, and domain services.
 */

// Organization aggregate
export {
  Organization,
  OrganizationDomainError,
  isValidOrgSettings,
  MAX_ORG_NAME_LENGTH,
  type OrganizationProps,
  type OrgSettings,
} from "./organization.js";

// Invitation aggregate  
export {
  Invitation,
  InvitationDomainError,
  InvitationToken,
  INVITATION_TTL_MS,
  type InvitationProps,
} from "./invitation.js";

// Team aggregate
export {
  Team,
  TeamMembership,
  TeamDomainError,
  MAX_TEAM_NAME_LENGTH,
  type TeamProps,
  type TeamMembershipProps,
} from "./team.js";