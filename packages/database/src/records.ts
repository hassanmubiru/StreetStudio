/**
 * Persistence record types for StreetStudio entities.
 *
 * A record is the full, in-memory representation of a database row: every
 * column, including sensitive fields (password hashes, signing secrets, share
 * passcodes) that are deliberately absent from the public DTOs in
 * `@streetstudio/shared`. Repositories read and write records; higher layers
 * project them onto DTOs, stripping secrets.
 *
 * Field names are the camelCase form of the snake_case columns declared in
 * {@link ./schema}, so the generic repository can map between them
 * mechanically.
 */
import type {
  AssetType,
  InvitationStatus,
  IsoTimestamp,
  PluginLoadState,
  PluginType,
  ReactionTargetType,
  TranscriptSegmentDto,
  UploadSessionStatus,
  Uuid,
  VideoStatus,
} from "@streetstudio/shared";

/** A user account. `passwordHash` is null for SSO-only accounts. */
export interface MemberRecord {
  id: Uuid;
  email: string;
  passwordHash: string | null;
  createdAt: IsoTimestamp;
}

/** An authentication session. */
export interface SessionRecord {
  id: Uuid;
  memberId: Uuid;
  issuedAt: IsoTimestamp;
  expiresAt: IsoTimestamp;
  revokedAt: IsoTimestamp | null;
}

/** A top-level tenant. */
export interface OrganizationRecord {
  id: Uuid;
  name: string;
  settings: Record<string, unknown>;
  createdAt: IsoTimestamp;
}

/** A permission set scoped to an organization. */
export interface RoleRecord {
  id: Uuid;
  organizationId: Uuid;
  name: string;
  permissions: string[];
}

/** A member's membership within an organization. */
export interface MembershipRecord {
  id: Uuid;
  organizationId: Uuid;
  memberId: Uuid;
  roleId: Uuid;
  createdAt: IsoTimestamp;
}

/** A group of members within an organization. */
export interface TeamRecord {
  id: Uuid;
  organizationId: Uuid;
  name: string;
}

/** Association of a member to a team. */
export interface TeamMembershipRecord {
  teamId: Uuid;
  memberId: Uuid;
}

/** A pending/accepted/revoked/expired organization invitation. */
export interface InvitationRecord {
  id: Uuid;
  organizationId: Uuid;
  email: string;
  token: string;
  status: InvitationStatus;
  createdAt: IsoTimestamp;
  expiresAt: IsoTimestamp;
}

/** A collaborative scope for realtime presence and events. */
export interface WorkspaceRecord {
  id: Uuid;
  organizationId: Uuid;
  name: string;
  createdAt: IsoTimestamp;
}

/** A container for folders and videos within an organization. */
export interface ProjectRecord {
  id: Uuid;
  organizationId: Uuid;
  name: string;
  createdAt: IsoTimestamp;
}

/** A hierarchical container for videos and assets within a project. */
export interface FolderRecord {
  id: Uuid;
  projectId: Uuid;
  parentFolderId: Uuid | null;
  name: string;
  depth: number;
}

/** A recorded media item. */
export interface VideoRecord {
  id: Uuid;
  organizationId: Uuid;
  folderId: Uuid | null;
  title: string;
  durationSeconds: number;
  status: VideoStatus;
  sourceObjectKey: string | null;
  developerMode: boolean;
  createdAt: IsoTimestamp;
}

/** An adaptive-bitrate rendition of a video. */
export interface RenditionRecord {
  id: Uuid;
  videoId: Uuid;
  quality: string;
  objectKey: string;
  bitrate: number;
}

/** A non-video file associated with a video or folder. */
export interface AssetRecord {
  id: Uuid;
  videoId: Uuid | null;
  folderId: Uuid | null;
  type: AssetType;
  objectKeyOrBody: string | null;
  createdAt: IsoTimestamp;
}

/** A video transcript composed of timed segments. */
export interface TranscriptRecord {
  id: Uuid;
  videoId: Uuid;
  segments: TranscriptSegmentDto[];
  indexedAt: IsoTimestamp | null;
}

/** A provider-produced summary of a video. */
export interface SummaryRecord {
  id: Uuid;
  videoId: Uuid;
  body: string;
  sourcePluginId: Uuid;
}

/** A comment or threaded reply on a video. */
export interface CommentRecord {
  id: Uuid;
  videoId: Uuid;
  parentCommentId: Uuid | null;
  authorId: Uuid;
  body: string;
  timestampSeconds: number | null;
  createdAt: IsoTimestamp;
}

/** A reaction of a given type on a video or comment. */
export interface ReactionRecord {
  targetType: ReactionTargetType;
  targetId: Uuid;
  memberId: Uuid;
  type: string;
}

/** A notification delivered to a member. */
export interface NotificationRecord {
  id: Uuid;
  memberId: Uuid;
  eventType: string;
  sourceResourceId: Uuid;
  createdAt: IsoTimestamp;
  readAt: IsoTimestamp | null;
  deliveredAt: IsoTimestamp | null;
}

/** A member's per-event-type notification preference. */
export interface NotificationPreferenceRecord {
  memberId: Uuid;
  eventType: string;
  enabled: boolean;
}

/** A share link for a video. `passcodeHash` is null for open links. */
export interface ShareLinkRecord {
  id: Uuid;
  videoId: Uuid;
  credential: string;
  expiresAt: IsoTimestamp | null;
  passcodeHash: string | null;
  revokedAt: IsoTimestamp | null;
  failedAttempts: number;
  lockedUntil: IsoTimestamp | null;
}

/** Progress/state of a chunked, resumable upload. */
export interface UploadSessionRecord {
  id: Uuid;
  organizationId: Uuid;
  videoId: Uuid;
  totalChunks: number;
  ackedChunks: number;
  lastAckAt: IsoTimestamp | null;
  expiresAt: IsoTimestamp;
  status: UploadSessionStatus;
}

/** An append-only audit record. */
export interface AuditEntryRecord {
  id: Uuid;
  organizationId: Uuid;
  actorId: Uuid;
  action: string;
  targetId: Uuid;
  at: IsoTimestamp;
}

/** API-key metadata plus the salted secret hash (never surfaced on a DTO). */
export interface ApiKeyRecord {
  id: Uuid;
  organizationId: Uuid;
  name: string;
  secretHash: string;
  permissions: string[];
  createdAt: IsoTimestamp;
  revokedAt: IsoTimestamp | null;
}

/** A registered outbound webhook plus its signing secret. */
export interface WebhookRecord {
  id: Uuid;
  organizationId: Uuid;
  eventType: string;
  url: string;
  signingSecret: string;
  createdAt: IsoTimestamp;
}

/** A link between a video and an external pull request. */
export interface PullRequestLinkRecord {
  id: Uuid;
  videoId: Uuid;
  pluginId: Uuid;
  prRef: string;
  createdAt: IsoTimestamp;
}

/** A link between a video and an external documentation URL. */
export interface DocLinkRecord {
  id: Uuid;
  videoId: Uuid;
  url: string;
  createdAt: IsoTimestamp;
}

/** A recorded video view event. */
export interface ViewEventRecord {
  id: Uuid;
  organizationId: Uuid;
  videoId: Uuid;
  memberId: Uuid;
  at: IsoTimestamp;
}

/** An installed plugin plus its (secret-bearing) config. */
export interface PluginRecord {
  id: Uuid;
  type: PluginType;
  enabled: boolean;
  config: Record<string, unknown>;
  loadState: PluginLoadState;
}
