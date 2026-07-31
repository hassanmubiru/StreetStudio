/**
 * Composition of the vertical-slice API service against real PostgreSQL.
 *
 * Wires the real domain services — {@link AuthService}, {@link OrgService}, and
 * the deny-by-default {@link RbacAccessControl} — onto pg-backed stores, then
 * registers a {@link ServiceInvocation} for each slice operation in a
 * {@link MapServiceContainer}. {@link createApiService} resolves a handler for
 * EVERY operation it is given and fails fast otherwise, so only the slice
 * operations are passed as the filtered catalog.
 *
 * The request lifecycle (rate limit → authenticate → validate → RBAC → service
 * → audit) is left fully intact: this module only supplies the collaborators it
 * expects (an {@link Authenticator}, an {@link AccessControl}, and an
 * {@link AuditSink}) plus the per-operation service handlers.
 */
import { AppError } from "@streetstudio/shared";
import type { PlatformConfig } from "@streetstudio/config";
import {
  createAuditLog,
  createRepositories,
  streetSqlClient,
} from "@streetstudio/database";
import type { MemberDto } from "@streetstudio/shared";
import {
  Argon2idPasswordHasher,
  AuthService,
  HmacAccessTokenIssuer,
  RbacAccessControl,
  ApiKeyService,
  repositoryAuthStores,
  repositoryMemberStore,
  repositoryRbacStore,
  repositoryApiKeyStore,
  type AuthContext,
} from "@streetstudio/auth";
import {
  OrgService,
  repositoryOrgStore,
  type OrganizationDto,
} from "@streetstudio/organizations";
import {
  ContentService,
  repositoryContentStore,
  type FolderRef,
} from "@streetstudio/projects";
import {
  NotificationService,
  repositoryNotificationStore,
  repositoryNotificationPreferenceStore,
  toNotificationDto,
} from "@streetstudio/notifications";
import {
  AnalyticsService,
  repositoryViewEventStore,
  repositoryVideoOrganizationResolver,
  permissionAnalyticsAuthorizer,
} from "@streetstudio/analytics";
import {
  UploadService,
  UploadSessionRepository,
  type Actor as UploadActor,
} from "@streetstudio/uploads";
import { PlaybackService } from "@streetstudio/playback";
import {
  CommentService,
  repositoryCommentStore,
  type ReactionTarget,
} from "@streetstudio/comments";
import type { ReactionTargetType } from "@streetstudio/shared";
import type { OrganizationRecord } from "@streetstudio/database";
import { newUuid } from "@streetstudio/database";
import type { MediaRuntime } from "./media/pipeline-runtime.js";
import { isUuid } from "@streetstudio/database";
import type { Uuid } from "@streetstudio/shared";
import {
  createApiService,
  MapServiceContainer,
  type ApiService,
} from "../http/composition-root.js";
import type {
  ApiRequest,
  AuditEvent,
  AuditSink,
  Authenticator,
  RequestContext,
  ServiceInvocation,
} from "../http/lifecycle.js";
import { PUBLIC_OPERATIONS, type PublicOperation } from "../http/operations.js";
import type { AuthStatus } from "../security/auth-required.js";
import type { PgClient } from "./pg-client.js";

/** The operations wired by this slice (filtered catalog for createApiService). */
export const SLICE_OPERATION_IDS: readonly string[] = [
  "auth.register",
  "auth.login",
  "auth.logout",
  "auth.currentMember",
  "organizations.create",
  "organizations.list",
  // Content hierarchy — RBAC-gated create paths (proves the wildcard-admin
  // RBAC model end-to-end against the real ContentService).
  "projects.create",
  "projects.list",
  "projects.get",
  "projects.update",
  "projects.delete",
  "folders.create",
  "folders.get",
  "folders.listByProject",
  "folders.delete",
  "videos.list",
  "videos.get",
  "videos.update",
  "videos.delete",
  "comments.list",
  "comments.create",
  "comments.delete",
  "comments.react",
  "comments.unreact",
  "apiKeys.create",
  "apiKeys.list",
  "apiKeys.revoke",
  // Notifications (personal/authenticated scope) + analytics (RBAC read).
  "notifications.list",
  "notifications.markRead",
  "analytics.metrics",
  // Uploads (RBAC) + playback manifest (RBAC). The raw part-upload and
  // object-stream byte routes are served directly by the HTTP transport (the
  // public catalog has no byte-transfer route — a documented gap).
  "uploads.create",
  "uploads.get",
  "uploads.complete",
  "uploads.abort",
  "playback.manifest",
];

/** The slice's subset of {@link PUBLIC_OPERATIONS}, preserving their metadata. */
export function sliceOperations(): readonly PublicOperation[] {
  const ids = new Set(SLICE_OPERATION_IDS);
  return PUBLIC_OPERATIONS.filter((op) => ids.has(op.id));
}

/** Read a required non-empty string field from a JSON request body. */
function requireStringField(body: unknown, field: string): string {
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>)[field] !== "string"
  ) {
    throw new AppError("VALIDATION_FAILED", {
      details: { field, reason: "must be a string" },
    });
  }
  return (body as Record<string, string>)[field] as string;
}

/** Read a required UUID field from a JSON request body (validated format). */
function requireUuidField(body: unknown, field: string): Uuid {
  const value = requireStringField(body, field);
  if (!isUuid(value)) {
    throw new AppError("VALIDATION_FAILED", {
      details: { field, reason: "must be a UUID" },
    });
  }
  return value as Uuid;
}

/** Read a required UUID path parameter (e.g. `:id`) from the request. */
function requireUuidPathParam(request: ApiRequest, name: string): Uuid {
  const value = request.params?.[name];
  if (!value || !isUuid(value)) {
    throw new AppError("VALIDATION_FAILED", {
      details: { field: name, reason: "must be a UUID path parameter" },
    });
  }
  return value as Uuid;
}

/** Optional string field from a JSON body, or undefined when absent/blank. */
function optionalStringField(body: unknown, field: string): string | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * The owning-organization scope for an RBAC operation, taken from the request
 * (the HTTP transport sets it from the `X-Organization-Id` header). Absence is
 * a client error rather than an authorization decision.
 */
function requireOrganizationId(context: RequestContext): Uuid {
  if (!context.organizationId) {
    throw new AppError("VALIDATION_FAILED", {
      details: { field: "organizationId", reason: "X-Organization-Id header is required" },
    });
  }
  return context.organizationId;
}

/** The authenticated principal, guaranteed present for authenticated ops. */
function requireAuth(context: RequestContext): AuthContext {
  if (!context.auth) {
    // The auth-required guard admits only authenticated principals here, so
    // this is defensive and should never fire for an authenticated operation.
    throw new AppError("AUTHENTICATION_REQUIRED");
  }
  return context.auth;
}

function toOrganizationDto(record: OrganizationRecord): OrganizationDto {
  return {
    id: record.id,
    name: record.name,
    settings: record.settings,
    createdAt: record.createdAt,
  };
}

function toMemberDto(record: {
  id: MemberDto["id"];
  email: string;
  createdAt: MemberDto["createdAt"];
}): MemberDto {
  return { id: record.id, email: record.email, createdAt: record.createdAt };
}

/** A resolved, authorized object for byte streaming (playback). */
export interface ResolvedObject {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly size: number;
}

/** Everything the HTTP transport needs to serve the slice. */
export interface Runtime {
  readonly service: ApiService;
  readonly operations: readonly PublicOperation[];
  /**
   * Resolve a bearer credential to its authenticated principal, for the raw
   * byte routes the JSON catalog dispatch does not cover (part upload, object
   * stream). Returns null when absent/invalid.
   */
  authenticate(credential: string | undefined): Promise<AuthContext | null>;
  /** Store one upload part (raw bytes) — backs `PUT /uploads/:id/parts/:n`. */
  uploadPart(
    auth: AuthContext,
    organizationId: Uuid,
    id: Uuid,
    partNumber: number,
    bytes: Uint8Array,
  ): Promise<{ received: number; total: number; status: string }>;
  /**
   * Resolve an object for authorized byte streaming — backs `GET /objects/*`.
   * Returns null (→ 404) when unauthorized/absent (no cross-org disclosure).
   */
  resolveObject(
    auth: AuthContext,
    organizationId: Uuid,
    objectKey: string,
  ): Promise<ResolvedObject | null>;
}

/**
 * Build the slice runtime: construct the domain services on pg-backed stores,
 * register the slice handlers, and assemble the {@link ApiService}.
 */
export function buildRuntime(
  config: PlatformConfig,
  pg: PgClient,
  media: MediaRuntime,
): Runtime {
  // Single canonical schema (SCHEMA-DUP-01 reconciliation): every service is
  // wired to the database package's repository-backed store adapters over the
  // ONE migration-managed schema (`createRepositories` → member/organization/
  // role/membership/project/folder/... with full FK integrity), rather than the
  // per-package de-seam `postgres*Store` DDL (a parallel, FK-less table family).
  // This makes the append-only Audit Log's FK (`audit_entry.organization_id ->
  // organization`) valid and enforces tenant isolation at the storage layer.
  const sql = streetSqlClient(pg);
  const repositories = createRepositories(sql);

  // --- Domain services on the canonical repository-backed stores ---------
  const authService = new AuthService({
    stores: repositoryAuthStores(repositories),
    passwordHasher: new Argon2idPasswordHasher(),
    tokenIssuer: new HmacAccessTokenIssuer(config.jwtSecret),
  });
  const memberStore = repositoryMemberStore(repositories);
  const accessControl = new RbacAccessControl({
    store: repositoryRbacStore(repositories),
  });
  const orgService = new OrgService({ store: repositoryOrgStore(repositories) });
  // Content hierarchy service — its create paths gate on the same RBAC
  // evaluator, so the wildcard-admin model is exercised at both the HTTP
  // lifecycle layer and inside the domain service.
  const contentService = new ContentService({
    store: repositoryContentStore(repositories),
    access: accessControl,
  });
  // Notifications (personal scope). The realtime emitter is a no-op here: the
  // WebSocket realtime transport is not wired in this composition, so
  // deliverPending is unused; list/markRead do not touch it.
  const notificationStore = repositoryNotificationStore(repositories);
  const notificationService = new NotificationService({
    notifications: notificationStore,
    preferences: repositoryNotificationPreferenceStore(repositories),
    emitter: { async emit(): Promise<void> {} },
  });
  // Analytics reads — Administrator-gated via the same RBAC evaluator.
  const analyticsService = new AnalyticsService({
    store: repositoryViewEventStore(repositories),
    videos: repositoryVideoOrganizationResolver(repositories),
    authorizer: permissionAnalyticsAuthorizer(accessControl),
  });
  // Uploads (chunked/resumable) + playback stream over the SAME MinIO/S3
  // Storage facade the media pipeline uses, and the canonical uploads repo.
  const uploadsPool = pg.asPgPool();
  const uploadsRepo = new UploadSessionRepository(uploadsPool);
  const uploadService = new UploadService(uploadsRepo, media.storage);
  const playbackService = new PlaybackService(media.storage, uploadsRepo);
  // Comments/threads/reactions. The mention notifier is a no-op here (the
  // realtime/notification fan-out for mentions is not wired in this HTTP
  // composition); post/list/delete/react/unreact do not depend on it.
  const commentService = new CommentService({
    store: repositoryCommentStore(repositories),
    access: accessControl,
    notifier: { async notifyMention(): Promise<void> {} },
  });
  // API keys. Management authorization is enforced by the HTTP request
  // lifecycle's RBAC (apikey:create/revoke) before the handler runs, so the
  // service's optional authorizer seam is omitted here.
  const apiKeyService = new ApiKeyService({
    store: repositoryApiKeyStore(repositories),
  });

  // The append-only Audit Log is tenant-scoped (audit_entry.organization_id is
  // NOT NULL with an FK to the organization table). The slice's auditable
  // operations (auth.register/login/logout, organizations.create) carry no
  // request-level organization scope, so their success events have no tenant to
  // record against; the sink guards and skips those rather than failing the
  // request after the service has already committed. Org-scoped operations
  // added later record normally.
  // Append-only Audit Log (R28), authoritative on the unified canonical
  // schema: `audit_entry.organization_id -> organization` is now consistent
  // with where organizations actually live (AUDIT-SCHEMA-01 resolved by the
  // repository/migration reconciliation above), so org-scoped audit writes are
  // referentially valid. Events without an organization scope (e.g. bare
  // auth.register/login) have no tenant to record against and are skipped.
  const auditLog = createAuditLog(sql);
  const auditSink: AuditSink = {
    async record(event: AuditEvent): Promise<void> {
      if (!event.organizationId || !event.memberId) {
        return;
      }
      // Best-effort at the sink boundary: for a real tenant this append is
      // referentially valid and succeeds, so the Audit Log is authoritative for
      // successes and for denials on existing organizations (R28). But an
      // `authorization_denied` event may carry a caller-supplied organization
      // id that does NOT exist (e.g. probing a random/foreign org) — that row
      // has no valid `organization` FK target and cannot be written. An
      // audit-infrastructure failure must never mask or corrupt the security
      // decision itself, so it is logged/alerted here rather than turning a
      // correct 403 denial (or an already-committed mutation) into a 500.
      try {
        await auditLog.append({
          actor: event.memberId,
          action: `${event.operationId}:${event.outcome}`,
          targetId: event.memberId,
          orgId: event.organizationId,
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
          "[api] audit append failed for",
          `${event.operationId}:${event.outcome}`,
          "org",
          event.organizationId,
          "-",
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  };

  // --- Bearer-token authenticator ----------------------------------------
  // Resolves a presented bearer token into an AuthContext via the real
  // AuthService; absence of a credential is "unauthenticated" (admitted only to
  // public operations by the auth-required guard) and a bad token is "invalid".
  const authenticator: Authenticator = {
    async authenticate(request: ApiRequest): Promise<AuthStatus> {
      if (!request.credential) {
        return { kind: "unauthenticated" };
      }
      try {
        const principal = await authService.verifyAccessToken(request.credential);
        return { kind: "authenticated", principal };
      } catch {
        return { kind: "invalid" };
      }
    },
  };

  // --- Slice service handlers --------------------------------------------
  const container = new MapServiceContainer();

  const register: ServiceInvocation<MemberDto> = async (request) => {
    const email = requireStringField(request.body, "email");
    const password = requireStringField(request.body, "password");
    return authService.register({ email, password });
  };

  const login: ServiceInvocation = async (request) => {
    const email = requireStringField(request.body, "email");
    const password = requireStringField(request.body, "password");
    return authService.login({ email, password });
  };

  const logout: ServiceInvocation = async (_request, context) => {
    const auth = requireAuth(context);
    if (auth.sessionId) {
      await authService.logout(auth.sessionId);
    }
    return { success: true };
  };

  const currentMember: ServiceInvocation<MemberDto> = async (_request, context) => {
    const auth = requireAuth(context);
    const member = await memberStore.findById(auth.memberId);
    if (!member) {
      throw new AppError("NOT_FOUND");
    }
    return toMemberDto(member);
  };

  const createOrganization: ServiceInvocation<OrganizationDto> = async (
    request,
    context,
  ) => {
    const auth = requireAuth(context);
    const name = requireStringField(request.body, "name");
    const created = await orgService.createOrg(auth, name);
    return toOrganizationDto(created);
  };

  // OrgService exposes no "list organizations for a member", so this reads the
  // member's organizations directly through the canonical membership/organization
  // tables (the same store of record repositoryOrgStore writes to). Real SQL, no fake.
  const listOrganizations: ServiceInvocation = async (_request, context) => {
    const auth = requireAuth(context);
    const result = await pg.query<{
      id: string;
      name: string;
      settings: string | Record<string, unknown> | null;
      created_at: string;
    }>(
      `SELECT o.id, o.name, o.settings, o.created_at
         FROM organization o
         JOIN membership m ON m.organization_id = o.id
        WHERE m.member_id = $1
        ORDER BY o.created_at ASC`,
      [auth.memberId],
    );
    const organizations: OrganizationDto[] = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      settings:
        typeof row.settings === "string"
          ? (JSON.parse(row.settings) as Record<string, unknown>)
          : row.settings ?? {},
      createdAt: new Date(row.created_at).toISOString(),
    }));
    return { organizations, total: organizations.length };
  };

  // projects.create (RBAC: project:create) — scoped to X-Organization-Id.
  const createProject: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const orgId = requireOrganizationId(context);
    const name = requireStringField(request.body, "name");
    return contentService.createProject(auth, orgId, name);
  };

  // projects.list (RBAC: project:read)
  const listProjects: ServiceInvocation = async (_request, context) => {
    const auth = requireAuth(context);
    const orgId = requireOrganizationId(context);
    const projects = await contentService.listProjects(auth, orgId);
    return { projects, total: projects.length };
  };

  // projects.get (RBAC: project:read)
  const getProject: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const orgId = requireOrganizationId(context);
    const projectId = requireUuidPathParam(request, "id");
    return contentService.getProject(auth, orgId, projectId);
  };

  // projects.update (RBAC: project:update) — rename.
  const updateProject: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const orgId = requireOrganizationId(context);
    const projectId = requireUuidPathParam(request, "id");
    const name = requireStringField(request.body, "name");
    return contentService.updateProject(auth, orgId, projectId, name);
  };

  // projects.delete (RBAC: project:delete)
  const deleteProject: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const orgId = requireOrganizationId(context);
    const projectId = requireUuidPathParam(request, "id");
    await contentService.deleteProject(auth, orgId, projectId);
    return { success: true };
  };

  // folders.create (RBAC: folder:create) — parent addresses a project (and
  // optionally a parent folder) within the owning organization.
  const createFolder: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const orgId = requireOrganizationId(context);
    const projectId = requireUuidField(request.body, "projectId");
    const name = requireStringField(request.body, "name");
    const folderIdRaw = optionalStringField(request.body, "folderId");
    if (folderIdRaw !== undefined && !isUuid(folderIdRaw)) {
      throw new AppError("VALIDATION_FAILED", {
        details: { field: "folderId", reason: "must be a UUID" },
      });
    }
    const parent: FolderRef =
      folderIdRaw !== undefined
        ? { organizationId: orgId, projectId, folderId: folderIdRaw as Uuid }
        : { organizationId: orgId, projectId };
    return contentService.createFolder(auth, parent, name);
  };

  // notifications.list (personal scope): the caller's own notifications.
  // NotificationService exposes no list method, so this reads the same store of
  // record it writes to (repository-backed), mapped to DTOs. Real data, no fake.
  const listNotifications: ServiceInvocation = async (_request, context) => {
    const auth = requireAuth(context);
    const records = await notificationStore.listByMember(auth.memberId);
    const notifications = records.map(toNotificationDto);
    return { notifications, total: notifications.length };
  };

  // notifications.markRead (personal scope): ownership-checked by the service —
  // a notification that doesn't exist or belongs to another member is NOT_FOUND
  // and nothing changes (R12.3/R12.6).
  const markNotificationRead: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const id = request.params?.["id"];
    if (!id || !isUuid(id)) {
      throw new AppError("VALIDATION_FAILED", {
        details: { field: "id", reason: "must be a UUID path parameter" },
      });
    }
    await notificationService.markRead(auth.memberId, id as Uuid);
    return { success: true };
  };

  // analytics.metrics (RBAC: analytics:read, Administrator-only): aggregate
  // playback metrics for the owning org over an optional [start,end] window
  // (defaults to all-time). Deny-by-default and org-scoped — other tenants'
  // data can never be included.
  const analyticsMetrics: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const orgId = requireOrganizationId(context);
    const q = request.query ?? {};
    const startRaw = typeof q["start"] === "string" ? (q["start"] as string) : undefined;
    const endRaw = typeof q["end"] === "string" ? (q["end"] as string) : undefined;
    const start = startRaw ? new Date(startRaw) : new Date(0);
    const end = endRaw ? new Date(endRaw) : new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new AppError("VALIDATION_FAILED", {
        details: { reason: "start/end must be valid ISO timestamps" },
      });
    }
    return analyticsService.aggregate(auth, orgId, { start, end });
  };

  // The uploads/playback Actor is the authenticated principal scoped to the
  // owning organization (from X-Organization-Id).
  const toUploadActor = (context: RequestContext): UploadActor => ({
    memberId: requireAuth(context).memberId,
    organizationId: requireOrganizationId(context),
  });

  // folders.get (RBAC: folder:read)
  const getFolder: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const orgId = requireOrganizationId(context);
    const folderId = requireUuidPathParam(request, "id");
    return contentService.getFolder(auth, orgId, folderId);
  };

  // folders.listByProject (RBAC: folder:read) — ?projectId=<uuid>.
  const listFolders: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const orgId = requireOrganizationId(context);
    const projectIdRaw =
      typeof request.query?.["projectId"] === "string"
        ? (request.query["projectId"] as string)
        : undefined;
    if (!projectIdRaw || !isUuid(projectIdRaw)) {
      throw new AppError("VALIDATION_FAILED", {
        details: { field: "projectId", reason: "projectId query parameter (UUID) is required" },
      });
    }
    const folders = await contentService.listFolders(auth, orgId, projectIdRaw as Uuid);
    return { folders, total: folders.length };
  };

  // folders.delete (RBAC: folder:delete)
  const deleteFolder: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const orgId = requireOrganizationId(context);
    const folderId = requireUuidPathParam(request, "id");
    await contentService.deleteFolder(auth, orgId, folderId);
    return { success: true };
  };

  // Parse a { targetType, targetId } reaction target from a JSON body.
  const readReactionTarget = (body: unknown): ReactionTarget => {
    const targetType = requireStringField(body, "targetType");
    const targetId = requireUuidField(body, "targetId");
    if (targetType !== "video" && targetType !== "comment") {
      throw new AppError("VALIDATION_FAILED", {
        details: { field: "targetType", reason: "must be 'video' or 'comment'" },
      });
    }
    return { type: targetType as ReactionTargetType, id: targetId };
  };

  // comments.list (RBAC: comment:read) — GET /videos/:videoId/comments
  const listComments: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const videoId = requireUuidPathParam(request, "videoId");
    const comments = await commentService.listComments(auth, videoId);
    return { comments, total: comments.length };
  };

  // comments.create (RBAC: comment:create) — POST /videos/:videoId/comments
  const createComment: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const videoId = requireUuidPathParam(request, "videoId");
    const body = requireStringField(request.body, "body");
    const tsRaw =
      typeof request.body === "object" && request.body !== null
        ? (request.body as Record<string, unknown>)["timestamp"]
        : undefined;
    const timestamp = typeof tsRaw === "number" ? tsRaw : undefined;
    return commentService.post(auth, videoId, body, timestamp);
  };

  // comments.delete (RBAC: comment:delete) — DELETE /comments/:id
  const deleteComment: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const commentId = requireUuidPathParam(request, "id");
    await commentService.deleteComment(auth, commentId);
    return { success: true };
  };

  // comments.react (RBAC: reaction:create) — POST /reactions
  const react: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const target = readReactionTarget(request.body);
    const type = requireStringField(request.body, "type");
    await commentService.react(auth, target, type);
    return { success: true };
  };

  // comments.unreact (RBAC: reaction:delete) — DELETE /reactions
  const unreact: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const target = readReactionTarget(request.body);
    const type = requireStringField(request.body, "type");
    await commentService.unreact(auth, target, type);
    return { success: true };
  };

  // apiKeys.create (RBAC: apikey:create) — returns the plaintext secret ONCE.
  const createApiKey: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const orgId = requireOrganizationId(context);
    const name = requireStringField(request.body, "name");
    const permsRaw =
      typeof request.body === "object" && request.body !== null
        ? (request.body as Record<string, unknown>)["permissions"]
        : undefined;
    const permissions = Array.isArray(permsRaw)
      ? permsRaw.filter((p): p is string => typeof p === "string")
      : [];
    return apiKeyService.create(orgId, auth.memberId, name, permissions);
  };

  // apiKeys.list (RBAC: apikey:read) — metadata only, never the secret.
  const listApiKeys: ServiceInvocation = async (_request, context) => {
    requireAuth(context);
    const orgId = requireOrganizationId(context);
    const apiKeys = await apiKeyService.list(orgId);
    return { apiKeys, total: apiKeys.length };
  };

  // apiKeys.revoke (RBAC: apikey:revoke)
  const revokeApiKey: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const orgId = requireOrganizationId(context);
    const keyId = requireUuidPathParam(request, "id");
    await apiKeyService.revoke(orgId, keyId, auth.memberId);
    return { success: true };
  };

  // videos.list (RBAC: video:read)
  const listVideos: ServiceInvocation = async (_request, context) => {
    const auth = requireAuth(context);
    const orgId = requireOrganizationId(context);
    const videos = await contentService.listVideos(auth, orgId);
    return { videos, total: videos.length };
  };

  // videos.get (RBAC: video:read)
  const getVideo: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const orgId = requireOrganizationId(context);
    const videoId = requireUuidPathParam(request, "id");
    return contentService.getVideo(auth, orgId, videoId);
  };

  // videos.update (RBAC: video:update) — rename and/or move (folderId: uuid|null).
  const updateVideo: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const orgId = requireOrganizationId(context);
    const videoId = requireUuidPathParam(request, "id");
    const body =
      typeof request.body === "object" && request.body !== null
        ? (request.body as Record<string, unknown>)
        : {};
    const changes: { name?: string; folderId?: Uuid | null } = {};
    if (typeof body["title"] === "string") {
      changes.name = body["title"] as string;
    }
    if ("folderId" in body) {
      const raw = body["folderId"];
      if (raw === null) {
        changes.folderId = null;
      } else if (typeof raw === "string" && isUuid(raw)) {
        changes.folderId = raw as Uuid;
      } else {
        throw new AppError("VALIDATION_FAILED", {
          details: { field: "folderId", reason: "must be a UUID or null" },
        });
      }
    }
    return contentService.updateVideo(auth, orgId, videoId, changes);
  };

  // videos.delete (RBAC: video:delete)
  const deleteVideo: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const orgId = requireOrganizationId(context);
    const videoId = requireUuidPathParam(request, "id");
    await contentService.deleteVideo(auth, orgId, videoId);
    return { success: true };
  };

  // uploads.create (RBAC upload:create): begin a chunked session. The final
  // assembled object key is derived server-side under the org's source prefix.
  const createUpload: ServiceInvocation = async (request, context) => {
    const actor = toUploadActor(context);
    const totalPartsRaw =
      typeof request.body === "object" && request.body !== null
        ? (request.body as Record<string, unknown>)["totalParts"]
        : undefined;
    const totalParts =
      typeof totalPartsRaw === "number" && Number.isInteger(totalPartsRaw)
        ? totalPartsRaw
        : Number.parseInt(String(totalPartsRaw ?? ""), 10);
    if (!Number.isInteger(totalParts) || totalParts < 1) {
      throw new AppError("VALIDATION_FAILED", {
        details: { field: "totalParts", reason: "must be a positive integer" },
      });
    }
    const contentType = optionalStringField(request.body, "contentType");
    const id = newUuid();
    const objectKey = `sources/${id}/original`;
    const session = await uploadService.begin(actor, {
      id,
      objectKey,
      totalParts,
      ...(contentType !== undefined ? { contentType } : {}),
    });
    return {
      id: session.id,
      objectKey: session.objectKey,
      totalParts: session.totalParts,
      status: session.status,
    };
  };

  // uploads.get (RBAC upload:read)
  const getUpload: ServiceInvocation = async (request, context) => {
    const actor = toUploadActor(context);
    const id = requireUuidPathParam(request, "id");
    const session = await uploadService.get(actor, id);
    return {
      id: session.id,
      objectKey: session.objectKey,
      totalParts: session.totalParts,
      receivedParts: session.receivedParts,
      status: session.status,
    };
  };

  // uploads.abort (RBAC upload:write)
  const abortUpload: ServiceInvocation = async (request, context) => {
    const actor = toUploadActor(context);
    const id = requireUuidPathParam(request, "id");
    const session = await uploadService.abort(actor, id);
    return { id: session.id, status: session.status };
  };

  // uploads.complete (RBAC upload:write): assemble the final object, create the
  // canonical video record (source_object_key), then run the media pipeline
  // in-process (production drains the queue in a separate worker). Returns the
  // new videoId and the terminal processing status.
  const completeUpload: ServiceInvocation = async (request, context) => {
    const actor = toUploadActor(context);
    const id = requireUuidPathParam(request, "id");
    const { session, object } = await uploadService.complete(actor, id);

    const videoId = newUuid();
    await pg.query(
      `INSERT INTO video (id, organization_id, title, duration_seconds, status, source_object_key, created_at)
       VALUES ($1, $2, $3, $4, 'uploaded', $5, now())`,
      [videoId, actor.organizationId, "Untitled upload", 0, session.objectKey],
    );
    await media.enqueue(videoId);
    const [result] = await media.drain();
    return {
      id: session.id,
      status: session.status,
      objectKey: session.objectKey,
      size: object.size,
      videoId,
      processing: result?.status ?? "unknown",
      renditions: result?.renditions.length ?? 0,
    };
  };

  // playback.manifest (RBAC video:read): the video's playable outputs — its
  // renditions plus thumbnail/preview assets — read from the canonical schema.
  const playbackManifest: ServiceInvocation = async (request, context) => {
    requireAuth(context);
    const orgId = requireOrganizationId(context);
    const videoId = requireUuidPathParam(request, "videoId");
    const video = await pg.query<{ status: string; source_object_key: string | null }>(
      `SELECT status, source_object_key FROM video WHERE id = $1 AND organization_id = $2`,
      [videoId, orgId],
    );
    if (video.rows.length === 0) {
      throw new AppError("NOT_FOUND");
    }
    const rends = await pg.query<{ quality: string; object_key: string; bitrate: number }>(
      `SELECT quality, object_key, bitrate FROM rendition WHERE video_id = $1 ORDER BY bitrate`,
      [videoId],
    );
    const assets = await pg.query<{ type: string; object_key_or_body: string | null }>(
      `SELECT type, object_key_or_body FROM asset WHERE video_id = $1`,
      [videoId],
    );
    const row0 = video.rows[0];
    return {
      videoId,
      status: row0?.status,
      sourceObjectKey: row0?.source_object_key ?? null,
      renditions: rends.rows.map((r) => ({
        quality: r.quality,
        objectKey: r.object_key,
        bitrate: r.bitrate,
      })),
      assets: assets.rows.map((a) => ({
        type: a.type,
        objectKey: a.object_key_or_body,
      })),
    };
  };

  container
    .register<ServiceInvocation>("auth.register", register)
    .register<ServiceInvocation>("auth.login", login)
    .register<ServiceInvocation>("auth.logout", logout)
    .register<ServiceInvocation>("auth.currentMember", currentMember)
    .register<ServiceInvocation>("organizations.create", createOrganization)
    .register<ServiceInvocation>("organizations.list", listOrganizations)
    .register<ServiceInvocation>("projects.create", createProject)
    .register<ServiceInvocation>("projects.list", listProjects)
    .register<ServiceInvocation>("projects.get", getProject)
    .register<ServiceInvocation>("projects.update", updateProject)
    .register<ServiceInvocation>("projects.delete", deleteProject)
    .register<ServiceInvocation>("folders.create", createFolder)
    .register<ServiceInvocation>("folders.get", getFolder)
    .register<ServiceInvocation>("folders.listByProject", listFolders)
    .register<ServiceInvocation>("folders.delete", deleteFolder)
    .register<ServiceInvocation>("videos.list", listVideos)
    .register<ServiceInvocation>("videos.get", getVideo)
    .register<ServiceInvocation>("videos.update", updateVideo)
    .register<ServiceInvocation>("videos.delete", deleteVideo)
    .register<ServiceInvocation>("comments.list", listComments)
    .register<ServiceInvocation>("comments.create", createComment)
    .register<ServiceInvocation>("comments.delete", deleteComment)
    .register<ServiceInvocation>("comments.react", react)
    .register<ServiceInvocation>("comments.unreact", unreact)
    .register<ServiceInvocation>("apiKeys.create", createApiKey)
    .register<ServiceInvocation>("apiKeys.list", listApiKeys)
    .register<ServiceInvocation>("apiKeys.revoke", revokeApiKey)
    .register<ServiceInvocation>("notifications.list", listNotifications)
    .register<ServiceInvocation>("notifications.markRead", markNotificationRead)
    .register<ServiceInvocation>("analytics.metrics", analyticsMetrics)
    .register<ServiceInvocation>("uploads.create", createUpload)
    .register<ServiceInvocation>("uploads.get", getUpload)
    .register<ServiceInvocation>("uploads.complete", completeUpload)
    .register<ServiceInvocation>("uploads.abort", abortUpload)
    .register<ServiceInvocation>("playback.manifest", playbackManifest);

  const operations = sliceOperations();
  const service = createApiService({
    container,
    authenticator,
    accessControl,
    auditSink,
    operations,
  });

  // Bearer-credential resolution + raw byte routes for the HTTP transport.
  const authenticate = async (
    credential: string | undefined,
  ): Promise<AuthContext | null> => {
    if (!credential) return null;
    try {
      return await authService.verifyAccessToken(credential);
    } catch {
      return null;
    }
  };

  const uploadPart: Runtime["uploadPart"] = async (
    auth,
    organizationId,
    id,
    partNumber,
    bytes,
  ) => {
    const actor: UploadActor = { memberId: auth.memberId, organizationId };
    const session = await uploadService.uploadPart(actor, id, partNumber, bytes);
    return {
      received: session.receivedParts.length,
      total: session.totalParts,
      status: session.status,
    };
  };

  const resolveObject: Runtime["resolveObject"] = async (
    auth,
    organizationId,
    objectKey,
  ) => {
    const actor: UploadActor = { memberId: auth.memberId, organizationId };
    const resolved = await playbackService.resolve(actor, objectKey);
    return resolved;
  };

  return { service, operations, authenticate, uploadPart, resolveObject };
}
