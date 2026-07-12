/**
 * Serialized wire DTOs for StreetStudio domain entities.
 *
 * These types are the JSON-serializable representations of the persisted
 * domain entities (see the Data Models section of the design). They are the
 * single source of truth for the REST API, the WebSocket gateway, and the
 * published SDK, guaranteeing full API/SDK parity (Requirement 2.4).
 *
 * Conventions:
 *  - Identifiers are {@link Uuid} strings.
 *  - Timestamps are {@link IsoTimestamp} (ISO-8601) strings, never `Date`.
 *  - Field names are camelCase (idiomatic JSON), regardless of the underlying
 *    snake_case database columns.
 *  - Secrets and password hashes are NEVER present on a DTO. API-key secrets
 *    are surfaced exactly once through a dedicated reveal DTO at creation.
 */

import type { IsoTimestamp, Uuid } from "./identifiers.js";

/* --------------------------------------------------------------------------
 * Enumerations
 * ------------------------------------------------------------------------ */

/** Lifecycle status of a Video. */
export type VideoStatus =
  | "uploading"
  | "queued"
  | "processing"
  | "ready"
  | "failed";

/** Kind of Asset associated with a Video or Folder. */
export type AssetType =
  | "thumbnail"
  | "preview"
  | "image"
  | "markdown"
  | "code_snippet"
  | "terminal"
  | "api_recording";

/** Lifecycle status of an Invitation. */
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

/** Lifecycle status of an UploadSession. */
export type UploadSessionStatus = "open" | "completed" | "expired" | "aborted";

/** Processing status emitted over realtime channels. */
export type ProcessingStatus = "queued" | "processing" | "ready" | "failed";

/** Kind of target a reaction may be attached to. */
export type ReactionTargetType = "video" | "comment";

/** Category of plugin. */
export type PluginType = "storage" | "ai" | "integration" | "billing";

/** Load state of a plugin. */
export type PluginLoadState = "loaded" | "failed" | "disabled";

/* --------------------------------------------------------------------------
 * Identity & organization
 * ------------------------------------------------------------------------ */

/** A user account. Never carries the password hash. */
export interface MemberDto {
  id: Uuid;
  email: string;
  createdAt: IsoTimestamp;
}

/** An authentication session. */
export interface SessionDto {
  id: Uuid;
  memberId: Uuid;
  issuedAt: IsoTimestamp;
  expiresAt: IsoTimestamp;
  revokedAt?: IsoTimestamp;
}

/** A top-level tenant. */
export interface OrganizationDto {
  id: Uuid;
  name: string;
  settings: Record<string, unknown>;
  createdAt: IsoTimestamp;
}

/** A member's membership within an organization. */
export interface MembershipDto {
  organizationId: Uuid;
  memberId: Uuid;
  roleId: Uuid;
  createdAt: IsoTimestamp;
}

/** A named permission set scoped to a single organization. */
export interface RoleDto {
  id: Uuid;
  organizationId: Uuid;
  name: string;
  /** Machine-readable action identifiers granted by the role. */
  permissions: string[];
}

/** A group of members within an organization. */
export interface TeamDto {
  id: Uuid;
  organizationId: Uuid;
  name: string;
}

/** Association of a member to a team. */
export interface TeamMembershipDto {
  teamId: Uuid;
  memberId: Uuid;
}

/** A pending/accepted/revoked/expired organization invitation. */
export interface InvitationDto {
  id: Uuid;
  organizationId: Uuid;
  email: string;
  status: InvitationStatus;
  createdAt: IsoTimestamp;
  expiresAt: IsoTimestamp;
}

/* --------------------------------------------------------------------------
 * Content hierarchy
 * ------------------------------------------------------------------------ */

/** A container for folders and videos within an organization. */
export interface ProjectDto {
  id: Uuid;
  organizationId: Uuid;
  name: string;
  createdAt: IsoTimestamp;
}

/** A hierarchical container for videos and assets within a project. */
export interface FolderDto {
  id: Uuid;
  projectId: Uuid;
  parentFolderId?: Uuid;
  name: string;
  /** 0-based nesting depth; capped so that there are at most 10 levels. */
  depth: number;
}

/** A collaborative scope for realtime presence and events. */
export interface WorkspaceDto {
  id: Uuid;
  organizationId: Uuid;
  name: string;
  createdAt: IsoTimestamp;
}

/* --------------------------------------------------------------------------
 * Media
 * ------------------------------------------------------------------------ */

/** A recorded media item. Identity is stable across folder moves. */
export interface VideoDto {
  id: Uuid;
  organizationId: Uuid;
  folderId?: Uuid;
  title: string;
  durationSeconds: number;
  status: VideoStatus;
  developerMode: boolean;
  createdAt: IsoTimestamp;
}

/** An adaptive-bitrate rendition of a video. */
export interface RenditionDto {
  id: Uuid;
  videoId: Uuid;
  quality: string;
  bitrate: number;
}

/** A non-video file associated with a video or folder. */
export interface AssetDto {
  id: Uuid;
  videoId?: Uuid;
  folderId?: Uuid;
  type: AssetType;
  createdAt: IsoTimestamp;
}

/** A single timed transcript segment. */
export interface TranscriptSegmentDto {
  start: number;
  end: number;
  text: string;
}

/** A video transcript composed of timed segments. */
export interface TranscriptDto {
  id: Uuid;
  videoId: Uuid;
  segments: TranscriptSegmentDto[];
  indexedAt?: IsoTimestamp;
}

/** A provider-produced summary of a video. */
export interface SummaryDto {
  id: Uuid;
  videoId: Uuid;
  body: string;
  sourcePluginId: Uuid;
}

/* --------------------------------------------------------------------------
 * Collaboration
 * ------------------------------------------------------------------------ */

/** A comment or threaded reply on a video. */
export interface CommentDto {
  id: Uuid;
  videoId: Uuid;
  parentCommentId?: Uuid;
  authorId: Uuid;
  body: string;
  /** Playback position in seconds the comment is anchored to, if any. */
  timestampSeconds?: number;
  createdAt: IsoTimestamp;
}

/** A reaction of a given type on a video or comment. */
export interface ReactionDto {
  targetType: ReactionTargetType;
  targetId: Uuid;
  memberId: Uuid;
  type: string;
}

/** A notification delivered to a member. */
export interface NotificationDto {
  id: Uuid;
  memberId: Uuid;
  eventType: string;
  sourceResourceId: Uuid;
  createdAt: IsoTimestamp;
  readAt?: IsoTimestamp;
  deliveredAt?: IsoTimestamp;
}

/** A member's per-event-type notification preference. */
export interface NotificationPreferenceDto {
  memberId: Uuid;
  eventType: string;
  enabled: boolean;
}

/* --------------------------------------------------------------------------
 * Sharing & uploads
 * ------------------------------------------------------------------------ */

/**
 * A share link for a video. The raw passcode is never serialized; only whether
 * the link is passcode-protected is exposed.
 */
export interface ShareLinkDto {
  id: Uuid;
  videoId: Uuid;
  credential: string;
  expiresAt?: IsoTimestamp;
  passcodeProtected: boolean;
  revokedAt?: IsoTimestamp;
  lockedUntil?: IsoTimestamp;
}

/** Progress/state of a chunked, resumable upload. */
export interface UploadSessionDto {
  id: Uuid;
  organizationId: Uuid;
  videoId: Uuid;
  totalChunks: number;
  ackedChunks: number;
  lastAckAt?: IsoTimestamp;
  expiresAt: IsoTimestamp;
  status: UploadSessionStatus;
}

/* --------------------------------------------------------------------------
 * Governance & platform
 * ------------------------------------------------------------------------ */

/** An append-only audit record. */
export interface AuditEntryDto {
  id: Uuid;
  organizationId: Uuid;
  actorId: Uuid;
  action: string;
  targetId: Uuid;
  at: IsoTimestamp;
}

/** API-key metadata. The secret is never present on this DTO. */
export interface ApiKeyDto {
  id: Uuid;
  organizationId: Uuid;
  name: string;
  permissions: string[];
  createdAt: IsoTimestamp;
  revokedAt?: IsoTimestamp;
}

/**
 * One-time reveal of a newly created API key. The plaintext `secret` is
 * returned exactly once at creation and is never retrievable afterward.
 */
export interface ApiKeyRevealDto {
  apiKey: ApiKeyDto;
  secret: string;
}

/** A registered outbound webhook. The signing secret is never serialized. */
export interface WebhookDto {
  id: Uuid;
  organizationId: Uuid;
  eventType: string;
  url: string;
  createdAt: IsoTimestamp;
}

/** A link between a video and an external pull request. */
export interface PullRequestLinkDto {
  id: Uuid;
  videoId: Uuid;
  pluginId: Uuid;
  prRef: string;
  createdAt: IsoTimestamp;
}

/** A link between a video and an external documentation URL. */
export interface DocLinkDto {
  id: Uuid;
  videoId: Uuid;
  url: string;
  createdAt: IsoTimestamp;
}

/** A recorded video view event. */
export interface ViewEventDto {
  id: Uuid;
  organizationId: Uuid;
  videoId: Uuid;
  memberId: Uuid;
  at: IsoTimestamp;
}

/** Aggregated analytics metrics for an organization/time range. */
export interface MetricsDto {
  totalViews: number;
  distinctViewers: number;
  totalWatchDuration: number;
}

/** An installed plugin. Secret config values are never serialized. */
export interface PluginDto {
  id: Uuid;
  type: PluginType;
  enabled: boolean;
  loadState: PluginLoadState;
}
