/**
 * @streetstudio/shared
 *
 * Public entry point for cross-cutting types, DTOs, errors, and constants.
 * This is the ONLY module other packages may import from. Internal modules
 * are not part of the public surface and must not be imported directly.
 */

/** Marker identifying the primary domain responsibility of this package. */
export const DOMAIN =
  "Cross-cutting types, DTOs, errors, and constants shared across all packages." as const;

// Cross-cutting scalar types.
export type { Uuid, IsoTimestamp } from "./identifiers.js";

// Shared error taxonomy (codes, categories, catalog, AppError, ErrorDto).
export {
  ERROR_CATALOG,
  ERROR_CODES,
  isErrorCode,
  getErrorDefinition,
  toErrorDto,
  AppError,
} from "./errors.js";
export type {
  ErrorCategory,
  ErrorCode,
  ErrorDefinition,
  ErrorDto,
  AppErrorOptions,
} from "./errors.js";

// Serialized wire DTOs mirroring the domain entities.
export type {
  VideoStatus,
  AssetType,
  InvitationStatus,
  UploadSessionStatus,
  ProcessingStatus,
  ReactionTargetType,
  PluginType,
  PluginLoadState,
  MemberDto,
  SessionDto,
  OrganizationDto,
  MembershipDto,
  RoleDto,
  TeamDto,
  TeamMembershipDto,
  InvitationDto,
  ProjectDto,
  FolderDto,
  WorkspaceDto,
  VideoDto,
  RenditionDto,
  AssetDto,
  TranscriptSegmentDto,
  TranscriptDto,
  SummaryDto,
  CommentDto,
  ReactionDto,
  NotificationDto,
  NotificationPreferenceDto,
  ShareLinkDto,
  UploadSessionDto,
  AuditEntryDto,
  ApiKeyDto,
  ApiKeyRevealDto,
  WebhookDto,
  PullRequestLinkDto,
  DocLinkDto,
  ViewEventDto,
  MetricsDto,
  PluginDto,
} from "./dto.js";
