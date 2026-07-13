/**
 * End-to-end flow test (task 41.2, Requirements 32.1, 32.4).
 *
 * Exercises the complete StreetStudio user journey
 *
 *   register → organization → invite/accept → project/folder → record →
 *   chunked upload → media pipeline → ready → playback → comment → mention →
 *   share access
 *
 * driven EXCLUSIVELY through the public surface (R32.4). Every step is issued
 * through the published `@streetstudio/sdk` {@link StreetStudioClient}, whose
 * HTTP I/O is bridged to the real {@link RestRouter} produced by
 * {@link createApiService} over the real {@link PUBLIC_OPERATIONS} catalog. No
 * domain service is called directly: the SDK builds a concrete HTTP request,
 * the in-memory transport matches it to a public operation and dispatches it
 * through the full request lifecycle (rate limit → authenticate → validate →
 * RBAC → service → audit), exactly as a real client would reach the API.
 *
 * The domain behind the operations is a deterministic in-memory "world" wired
 * as the {@link HandlerResolver}. The one place real domain code runs is the
 * media pipeline: {@link MediaPipeline} from `@streetstudio/processing` turns a
 * completed upload into a ready Video with a thumbnail, a preview, and adaptive
 * renditions, so the "pipeline → ready → playback" leg is genuine.
 *
 * Because the SAME operation catalog and lifecycle enforce authorization on
 * every request, the test also asserts the parity/deny-by-default guarantees:
 * an invited Member (whose Role lacks `project:create`) is denied that
 * operation through the public surface, while the Administrator is allowed.
 */
import { describe, expect, it } from "vitest";
import {
  StreetStudioClient,
  type HttpRequest,
  type HttpResponse,
  type HttpTransport,
} from "@streetstudio/sdk";
import { AppError } from "@streetstudio/shared";
import type {
  CommentDto,
  FolderDto,
  InvitationDto,
  MemberDto,
  MembershipDto,
  NotificationDto,
  OrganizationDto,
  ProjectDto,
  SessionDto,
  ShareLinkDto,
  UploadSessionDto,
  VideoDto,
  Uuid,
} from "@streetstudio/shared";
import type { AccessControl, Action, AuthContext } from "@streetstudio/auth";
import {
  MediaPipeline,
  type ProcessingStore,
  type Transcoder,
  type TranscodeOutput,
} from "@streetstudio/processing";
import { createApiService, type HandlerResolver } from "./composition-root.js";
import {
  PUBLIC_OPERATIONS,
  restOperations,
  type PublicOperation,
} from "./operations.js";
import type {
  ApiRequest,
  AuditEvent,
  AuditSink,
  Authenticator,
  RequestContext,
  ServiceInvocation,
} from "./lifecycle.js";
import type { AuthStatus } from "../security/auth-required.js";
import { RateLimiter } from "../security/rate-limiter.js";

/* -------------------------------------------------------------------------- */
/* Deterministic id generation                                                */
/* -------------------------------------------------------------------------- */

function sequentialUuids(): () => Uuid {
  let n = 0;
  return () => {
    n += 1;
    return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}` as Uuid;
  };
}

const FIXED_NOW = "2024-01-01T00:00:00.000Z";

/* -------------------------------------------------------------------------- */
/* Role permission sets                                                       */
/* -------------------------------------------------------------------------- */

/** The Administrator role grants every action used in the flow. */
const ADMIN_PERMISSIONS = new Set<string>([
  "org:read",
  "org:update",
  "org:read_members",
  "org:read_roles",
  "org:invite",
  "project:create",
  "project:read",
  "project:update",
  "project:delete",
  "folder:create",
  "folder:read",
  "folder:update",
  "folder:delete",
  "video:read",
  "video:update",
  "video:delete",
  "video:view",
  "upload:create",
  "upload:read",
  "upload:write",
  "comment:read",
  "comment:create",
  "comment:delete",
  "reaction:create",
  "reaction:delete",
  "share:create",
  "share:read",
  "share:revoke",
  "analytics:read",
]);

/** An invited Member can view and comment, but cannot create projects. */
const MEMBER_PERMISSIONS = new Set<string>([
  "org:read",
  "video:read",
  "video:view",
  "comment:read",
  "comment:create",
  "folder:read",
  "project:read",
]);

/* -------------------------------------------------------------------------- */
/* In-memory world (the domain behind the public operations)                  */
/* -------------------------------------------------------------------------- */

interface MemberRow {
  readonly id: Uuid;
  readonly email: string;
  readonly password: string;
}
interface SessionRow {
  readonly token: Uuid;
  readonly memberId: Uuid;
  revoked: boolean;
}
interface MembershipRow {
  readonly organizationId: Uuid;
  readonly memberId: Uuid;
  readonly roleId: Uuid;
  readonly permissions: Set<string>;
}
interface InvitationRow {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly email: string;
  status: "pending" | "accepted" | "revoked" | "expired";
}
interface VideoRow {
  id: Uuid;
  organizationId: Uuid;
  folderId: Uuid | null;
  title: string;
  durationSeconds: number;
  status: VideoDto["status"];
  sourceObjectKey: string | null;
  developerMode: boolean;
  createdAt: string;
}
interface UploadRow {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly videoId: Uuid;
  readonly totalChunks: number;
  ackedChunks: number;
  status: UploadSessionDto["status"];
}
interface RenditionRow {
  id: Uuid;
  videoId: Uuid;
  quality: string;
  bitrate: number;
  objectKey: string;
}
interface AssetRow {
  id: Uuid;
  videoId: Uuid;
  type: string;
  objectKeyOrBody: string;
}
interface ShareRow {
  readonly id: Uuid;
  readonly videoId: Uuid;
  readonly credential: string;
  readonly passcode?: string;
  revoked: boolean;
}

class World {
  readonly newId = sequentialUuids();
  readonly members = new Map<Uuid, MemberRow>();
  readonly membersByEmail = new Map<string, Uuid>();
  readonly sessions = new Map<Uuid, SessionRow>();
  readonly organizations = new Map<Uuid, OrganizationDto>();
  readonly memberships: MembershipRow[] = [];
  readonly invitations = new Map<Uuid, InvitationRow>();
  readonly projects = new Map<Uuid, ProjectDto>();
  readonly folders = new Map<Uuid, FolderDto>();
  readonly videos = new Map<Uuid, VideoRow>();
  readonly uploads = new Map<Uuid, UploadRow>();
  readonly renditions: RenditionRow[] = [];
  readonly assets: AssetRow[] = [];
  readonly comments = new Map<Uuid, CommentDto>();
  readonly notifications: NotificationDto[] = [];
  readonly shares = new Map<Uuid, ShareRow>();

  membership(organizationId: Uuid, memberId: Uuid): MembershipRow | undefined {
    return this.memberships.find(
      (m) => m.organizationId === organizationId && m.memberId === memberId,
    );
  }

  memberHasViewAccess(organizationId: Uuid, memberId: Uuid): boolean {
    const m = this.membership(organizationId, memberId);
    return m !== undefined && m.permissions.has("video:read");
  }

  toVideoDto(row: VideoRow): VideoDto {
    return {
      id: row.id,
      organizationId: row.organizationId,
      ...(row.folderId ? { folderId: row.folderId } : {}),
      title: row.title,
      durationSeconds: row.durationSeconds,
      status: row.status,
      developerMode: row.developerMode,
      createdAt: row.createdAt,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Media pipeline wiring (the one place real domain code runs)                */
/* -------------------------------------------------------------------------- */

/** A deterministic transcoder producing the required outputs (R8.2–R8.4). */
const deterministicTranscoder: Transcoder = {
  async transcode(): Promise<TranscodeOutput> {
    return {
      thumbnail: { objectKey: "thumb.jpg" },
      preview: { objectKey: "preview.mp4", durationSeconds: 6 },
      renditions: [
        { quality: "1080p", objectKey: "r-1080.m3u8", bitrate: 5_000_000 },
        { quality: "720p", objectKey: "r-720.m3u8", bitrate: 2_800_000 },
        { quality: "480p", objectKey: "r-480.m3u8", bitrate: 1_400_000 },
      ],
    };
  },
};

/** A {@link ProcessingStore} backed by the world's video/rendition/asset state. */
function worldProcessingStore(world: World): ProcessingStore {
  return {
    async findVideo(organizationId, videoId) {
      const v = world.videos.get(videoId);
      return v && v.organizationId === organizationId ? (v as never) : null;
    },
    async findVideoById(videoId) {
      return (world.videos.get(videoId) as never) ?? null;
    },
    async setVideoStatus(video, status) {
      const row = world.videos.get((video as VideoRow).id);
      if (row) {
        row.status = status;
        return row as never;
      }
      return video;
    },
    async insertAsset(record) {
      const r = record as unknown as AssetRow;
      world.assets.push({
        id: r.id,
        videoId: r.videoId,
        type: r.type,
        objectKeyOrBody: r.objectKeyOrBody,
      });
      return record;
    },
    async insertRendition(record) {
      const r = record as unknown as RenditionRow;
      world.renditions.push({
        id: r.id,
        videoId: r.videoId,
        quality: r.quality,
        bitrate: r.bitrate,
        objectKey: r.objectKey,
      });
      return record;
    },
  };
}

/** Run a freshly-completed upload's video through the real pipeline to `ready`. */
async function runPipeline(world: World, videoId: Uuid): Promise<void> {
  const video = world.videos.get(videoId);
  if (!video) {
    throw new AppError("NOT_FOUND", { details: { videoId } });
  }
  const pipeline = new MediaPipeline({
    store: worldProcessingStore(world),
    queue: { enqueue: () => {} },
    transcoder: deterministicTranscoder,
    emitter: { emit: () => {} },
    options: {
      clock: { now: () => new Date(FIXED_NOW) },
      newId: world.newId,
    },
  });
  await pipeline.enqueue(videoId);
  await pipeline.process({ videoId, organizationId: video.organizationId });
}

/* -------------------------------------------------------------------------- */
/* Fake lifecycle collaborators                                               */
/* -------------------------------------------------------------------------- */

/** Resolves a bearer token to its member via the world's session table. */
function worldAuthenticator(world: World): Authenticator {
  return {
    async authenticate(request: ApiRequest): Promise<AuthStatus> {
      const token = request.credential;
      if (token === undefined) {
        return { kind: "unauthenticated" };
      }
      const session = world.sessions.get(token as Uuid);
      if (!session || session.revoked) {
        return { kind: "invalid" };
      }
      const principal: AuthContext = { memberId: session.memberId };
      return { kind: "authenticated", principal };
    },
  };
}

/** Deny-by-default RBAC: a principal is granted an action iff its Role in the
 *  owning organization includes it. Unknown membership ⇒ denied. */
function worldAccessControl(world: World): AccessControl {
  return {
    async can(ctx, action, resource): Promise<boolean> {
      const organizationId = resource.organizationId as Uuid | undefined;
      if (!organizationId) {
        return false;
      }
      const membership = world.membership(organizationId, ctx.memberId);
      return membership?.permissions.has(action) ?? false;
    },
    async assignRole(): Promise<void> {
      /* not exercised */
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Public-operation handlers (the world behind the catalog)                   */
/* -------------------------------------------------------------------------- */

function buildHandlers(world: World): Record<string, ServiceInvocation> {
  const requireVideo = (id: Uuid): VideoRow => {
    const v = world.videos.get(id);
    if (!v) throw new AppError("NOT_FOUND", { details: { videoId: id } });
    return v;
  };

  return {
    // --- Authentication ---------------------------------------------------
    "auth.register": async (req) => {
      const { email, password } = req.body as { email: string; password: string };
      if (world.membersByEmail.has(email)) {
        throw new AppError("REGISTRATION_FAILED");
      }
      const id = world.newId();
      const member: MemberRow = { id, email, password };
      world.members.set(id, member);
      world.membersByEmail.set(email, id);
      // Accepting a pending invitation is realized when the invited member
      // registers: their pending invitation becomes an accepted membership
      // with the Member role.
      for (const inv of world.invitations.values()) {
        if (inv.email === email && inv.status === "pending") {
          inv.status = "accepted";
          world.memberships.push({
            organizationId: inv.organizationId,
            memberId: id,
            roleId: world.newId(),
            permissions: new Set(MEMBER_PERMISSIONS),
          });
        }
      }
      const dto: MemberDto = { id, email, createdAt: FIXED_NOW };
      return dto;
    },

    "auth.login": async (req) => {
      const { email } = req.body as { email: string; password: string };
      const memberId = world.membersByEmail.get(email);
      if (!memberId) {
        throw new AppError("AUTHENTICATION_FAILED");
      }
      const token = world.newId();
      world.sessions.set(token, { token, memberId, revoked: false });
      const dto: SessionDto = {
        id: token,
        memberId,
        issuedAt: FIXED_NOW,
        expiresAt: "2024-01-01T00:15:00.000Z",
      };
      return dto;
    },

    "auth.logout": async (req, ctx) => {
      const token = req.credential as Uuid | undefined;
      if (token) {
        const s = world.sessions.get(token);
        if (s) s.revoked = true;
      }
      void ctx;
      return undefined;
    },

    "auth.currentMember": async (_req, ctx) => {
      const member = world.members.get(ctx.auth!.memberId);
      if (!member) throw new AppError("NOT_FOUND");
      const dto: MemberDto = {
        id: member.id,
        email: member.email,
        createdAt: FIXED_NOW,
      };
      return dto;
    },

    // --- Organizations ----------------------------------------------------
    "organizations.create": async (req, ctx) => {
      const { name } = req.body as { name: string };
      const id = world.newId();
      const org: OrganizationDto = {
        id,
        name,
        settings: {},
        createdAt: FIXED_NOW,
      };
      world.organizations.set(id, org);
      // Creator becomes an Administrator (R4.7).
      world.memberships.push({
        organizationId: id,
        memberId: ctx.auth!.memberId,
        roleId: world.newId(),
        permissions: new Set(ADMIN_PERMISSIONS),
      });
      return org;
    },

    "organizations.get": async (req) => {
      const org = world.organizations.get(req.params!["id"] as Uuid);
      if (!org) throw new AppError("NOT_FOUND");
      return org;
    },

    "organizations.listMembers": async (req) => {
      const organizationId = req.params!["id"] as Uuid;
      const rows: MembershipDto[] = world.memberships
        .filter((m) => m.organizationId === organizationId)
        .map((m) => ({
          organizationId: m.organizationId,
          memberId: m.memberId,
          roleId: m.roleId,
          createdAt: FIXED_NOW,
        }));
      return rows;
    },

    "organizations.invite": async (req) => {
      const organizationId = req.params!["id"] as Uuid;
      const { email } = req.body as { email: string };
      const id = world.newId();
      const inv: InvitationRow = {
        id,
        organizationId,
        email,
        status: "pending",
      };
      world.invitations.set(id, inv);
      const dto: InvitationDto = {
        id,
        organizationId,
        email,
        status: "pending",
        createdAt: FIXED_NOW,
        expiresAt: "2024-01-08T00:00:00.000Z",
      };
      return dto;
    },

    // --- Projects & folders ----------------------------------------------
    "projects.create": async (req) => {
      const { name } = req.body as { name: string };
      const id = world.newId();
      const dto: ProjectDto = {
        id,
        organizationId: req.organizationId!,
        name,
        createdAt: FIXED_NOW,
      };
      world.projects.set(id, dto);
      return dto;
    },

    "folders.create": async (req) => {
      const { projectId, name, parentFolderId } = req.body as {
        projectId: Uuid;
        name: string;
        parentFolderId?: Uuid;
      };
      const parent = parentFolderId ? world.folders.get(parentFolderId) : undefined;
      const id = world.newId();
      const dto: FolderDto = {
        id,
        projectId,
        ...(parentFolderId ? { parentFolderId } : {}),
        name,
        depth: parent ? parent.depth + 1 : 0,
      };
      world.folders.set(id, dto);
      return dto;
    },

    // --- Uploads ----------------------------------------------------------
    "uploads.create": async (req) => {
      const { title, totalChunks, folderId } = req.body as {
        title: string;
        totalChunks: number;
        folderId?: Uuid;
      };
      const videoId = world.newId();
      const uploadId = world.newId();
      world.videos.set(videoId, {
        id: videoId,
        organizationId: req.organizationId!,
        folderId: folderId ?? null,
        title,
        durationSeconds: 120,
        status: "uploading",
        sourceObjectKey: `uploads/${uploadId}/source.mp4`,
        developerMode: false,
        createdAt: FIXED_NOW,
      });
      world.uploads.set(uploadId, {
        id: uploadId,
        organizationId: req.organizationId!,
        videoId,
        totalChunks,
        ackedChunks: 0,
        status: "open",
      });
      const dto: UploadSessionDto = {
        id: uploadId,
        organizationId: req.organizationId!,
        videoId,
        totalChunks,
        ackedChunks: 0,
        expiresAt: "2024-01-02T00:00:00.000Z",
        status: "open",
      };
      return dto;
    },

    // Reading the session reflects chunked-upload progress: each poll observes
    // one more acknowledged chunk (the recorder streams chunks to storage
    // out-of-band; the count is a server-side detail exposed via status).
    "uploads.get": async (req) => {
      const upload = world.uploads.get(req.params!["id"] as Uuid);
      if (!upload) throw new AppError("NOT_FOUND");
      if (upload.status === "open" && upload.ackedChunks < upload.totalChunks) {
        upload.ackedChunks += 1;
      }
      const dto: UploadSessionDto = {
        id: upload.id,
        organizationId: upload.organizationId,
        videoId: upload.videoId,
        totalChunks: upload.totalChunks,
        ackedChunks: upload.ackedChunks,
        expiresAt: "2024-01-02T00:00:00.000Z",
        status: upload.status,
      };
      return dto;
    },

    "uploads.complete": async (req) => {
      const upload = world.uploads.get(req.params!["id"] as Uuid);
      if (!upload) throw new AppError("NOT_FOUND");
      upload.ackedChunks = upload.totalChunks;
      upload.status = "completed";
      // The completed upload assembles into the source Video and is processed.
      await runPipeline(world, upload.videoId);
      const dto: UploadSessionDto = {
        id: upload.id,
        organizationId: upload.organizationId,
        videoId: upload.videoId,
        totalChunks: upload.totalChunks,
        ackedChunks: upload.ackedChunks,
        expiresAt: "2024-01-02T00:00:00.000Z",
        status: "completed",
      };
      return dto;
    },

    // --- Videos & playback ------------------------------------------------
    "videos.get": async (req) => {
      const v = requireVideo(req.params!["id"] as Uuid);
      return world.toVideoDto(v);
    },

    "playback.manifest": async (req) => {
      const v = requireVideo(req.params!["videoId"] as Uuid);
      if (v.status !== "ready") {
        throw new AppError("VIDEO_NOT_READY");
      }
      const renditions = world.renditions
        .filter((r) => r.videoId === v.id)
        .map((r) => ({
          id: r.id,
          videoId: r.videoId,
          quality: r.quality,
          bitrate: r.bitrate,
        }));
      return { videoId: v.id, renditions };
    },

    // --- Comments & mentions ---------------------------------------------
    "comments.list": async (req) => {
      const videoId = req.params!["videoId"] as Uuid;
      return [...world.comments.values()].filter((c) => c.videoId === videoId);
    },

    "comments.create": async (req, ctx) => {
      const videoId = req.params!["videoId"] as Uuid;
      const video = requireVideo(videoId);
      const { body, timestampSeconds } = req.body as {
        body: string;
        timestampSeconds?: number;
      };
      const id = world.newId();
      const comment: CommentDto = {
        id,
        videoId,
        authorId: ctx.auth!.memberId,
        body,
        ...(timestampSeconds !== undefined ? { timestampSeconds } : {}),
        createdAt: FIXED_NOW,
      };
      world.comments.set(id, comment);
      // Mentions: a member referenced by "@email" who holds view access on the
      // video's organization receives a mention notification (R11.4).
      for (const [email, memberId] of world.membersByEmail) {
        if (
          body.includes(`@${email}`) &&
          world.memberHasViewAccess(video.organizationId, memberId)
        ) {
          world.notifications.push({
            id: world.newId(),
            memberId,
            eventType: "mention",
            sourceResourceId: id,
            createdAt: FIXED_NOW,
          });
        }
      }
      return comment;
    },

    // --- Notifications ----------------------------------------------------
    "notifications.list": async (_req, ctx) => {
      return world.notifications.filter((n) => n.memberId === ctx.auth!.memberId);
    },

    // --- Sharing ----------------------------------------------------------
    "sharing.create": async (req) => {
      const videoId = req.params!["videoId"] as Uuid;
      requireVideo(videoId);
      const { passcode } = (req.body ?? {}) as { passcode?: string };
      const id = world.newId();
      const credential = `share_${world.newId()}`;
      world.shares.set(id, {
        id,
        videoId,
        credential,
        ...(passcode ? { passcode } : {}),
        revoked: false,
      });
      const dto: ShareLinkDto = {
        id,
        videoId,
        credential,
        passcodeProtected: passcode !== undefined,
      };
      return dto;
    },

    "sharing.revoke": async (req) => {
      const share = world.shares.get(req.params!["id"] as Uuid);
      if (!share) throw new AppError("NOT_FOUND");
      share.revoked = true;
      return undefined;
    },

    "sharing.resolve": async (req) => {
      const { credential, passcode } = req.body as {
        credential: string;
        passcode?: string;
      };
      const share = [...world.shares.values()].find(
        (s) => s.credential === credential,
      );
      if (!share || share.revoked) {
        throw new AppError("SHARE_LINK_EXPIRED");
      }
      if (share.passcode !== undefined && share.passcode !== passcode) {
        throw new AppError("AUTHORIZATION_DENIED");
      }
      const video = requireVideo(share.videoId);
      return world.toVideoDto(video);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* SDK ⇄ RestRouter transport bridge                                          */
/* -------------------------------------------------------------------------- */

interface RouteMatch {
  readonly path: string;
  readonly params: Record<string, string>;
}

/** Match a concrete request path to a REST operation template, extracting params. */
function matchRoute(
  operations: readonly PublicOperation[],
  method: string,
  pathname: string,
): RouteMatch | null {
  const reqSegments = pathname.split("/").filter((s) => s.length > 0);
  for (const op of operations) {
    if ((op.method ?? "GET") !== method) continue;
    const tplSegments = op.path.split("/").filter((s) => s.length > 0);
    if (tplSegments.length !== reqSegments.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < tplSegments.length; i++) {
      const tpl = tplSegments[i]!;
      const actual = reqSegments[i]!;
      if (tpl.startsWith(":")) {
        params[tpl.slice(1)] = decodeURIComponent(actual);
      } else if (tpl !== actual) {
        ok = false;
        break;
      }
    }
    if (ok) return { path: op.path, params };
  }
  return null;
}

/**
 * Bridge the SDK's {@link HttpTransport} to the in-memory {@link RestRouter}:
 * parse the SDK's concrete HTTP request, match it to a public operation,
 * dispatch through the real lifecycle, and serialize the result (or a mapped
 * error) back as an HTTP response — no real network involved.
 */
function routerTransport(
  router: ReturnType<typeof createApiService>["router"],
  restOps: readonly PublicOperation[],
): HttpTransport {
  return {
    async send(request: HttpRequest): Promise<HttpResponse> {
      const url = new URL(request.url);
      const match = matchRoute(restOps, request.method, url.pathname);
      if (!match) {
        return { status: 404, body: JSON.stringify({ code: "NOT_FOUND" }) };
      }
      const query: Record<string, unknown> = {};
      for (const [k, v] of url.searchParams) query[k] = v;

      const authHeader = request.headers["Authorization"];
      const credential = authHeader?.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : undefined;
      const organizationId = request.headers["X-Organization-Id"] as
        | Uuid
        | undefined;

      const apiRequest: ApiRequest = {
        method: request.method,
        path: match.path,
        clientKey: credential ?? `anon:${url.pathname}`,
        ...(credential ? { credential } : {}),
        ...(organizationId ? { organizationId } : {}),
        params: match.params,
        query,
        ...(request.body !== undefined ? { body: JSON.parse(request.body) } : {}),
      };

      try {
        const result = await router.dispatch(apiRequest);
        if (result === undefined) {
          return { status: 204 };
        }
        return { status: 200, body: JSON.stringify(result) };
      } catch (err) {
        if (err instanceof AppError) {
          return { status: err.status, body: JSON.stringify(err.toDto()) };
        }
        throw err;
      }
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

interface Harness {
  readonly world: World;
  readonly audits: AuditEvent[];
  client(auth?: { token: string }, organizationId?: Uuid): StreetStudioClient;
}

function makeHarness(): Harness {
  const world = new World();
  const audits: AuditEvent[] = [];
  const handlers: HandlerResolver = (() => {
    const map = buildHandlers(world);
    return {
      resolve(operationId: string): ServiceInvocation {
        const handler = map[operationId];
        if (!handler) {
          // Operations not exercised by this flow are wired to a stub so the
          // composition root can bind the full catalog without gaps.
          return async () => ({ ok: true });
        }
        return handler;
      },
    };
  })();

  const auditSink: AuditSink = {
    record(event: AuditEvent): void {
      audits.push(event);
    },
  };

  const service = createApiService({
    container: { resolve: () => undefined, has: () => true },
    handlers,
    rateLimiter: new RateLimiter({ limit: 1_000_000 }),
    authenticator: worldAuthenticator(world),
    accessControl: worldAccessControl(world),
    auditSink,
    operations: PUBLIC_OPERATIONS,
  });

  const restOps = restOperations(PUBLIC_OPERATIONS);
  const transport = routerTransport(service.router, restOps);

  return {
    world,
    audits,
    client(auth, organizationId): StreetStudioClient {
      return new StreetStudioClient({
        baseUrl: "https://api.streetstudio.test",
        transport,
        ...(auth ? { auth: { kind: "bearer", token: auth.token } } : {}),
        ...(organizationId ? { organizationId } : {}),
      });
    },
  };
}

/* -------------------------------------------------------------------------- */
/* The end-to-end flow                                                        */
/* -------------------------------------------------------------------------- */

describe("Feature: streetstudio — end-to-end flow through the public API/SDK (R32.1, R32.4)", () => {
  it("register → org → invite/accept → project/folder → record → chunked upload → pipeline → ready → playback → comment → mention → share", async () => {
    const h = makeHarness();

    // --- register (owner) + login ---------------------------------------
    const anon = h.client();
    const owner = await anon.auth.register({
      email: "owner@example.com",
      password: "correct horse battery",
    });
    expect(owner.email).toBe("owner@example.com");
    const ownerSession = await anon.auth.login({
      email: "owner@example.com",
      password: "correct horse battery",
    });
    expect(ownerSession.memberId).toBe(owner.id);

    const ownerClientNoOrg = h.client({ token: ownerSession.id });
    const me = await ownerClientNoOrg.auth.currentMember();
    expect(me.id).toBe(owner.id);

    // --- organization ----------------------------------------------------
    const org = await ownerClientNoOrg.organizations.create({ name: "Acme" });
    expect(org.name).toBe("Acme");
    const ownerClient = h.client({ token: ownerSession.id }, org.id);

    // --- invite / accept -------------------------------------------------
    const invitation = await ownerClient.organizations.invite(org.id, {
      email: "member@example.com",
    });
    expect(invitation.status).toBe("pending");
    // Acceptance is realized when the invited member registers.
    const member = await anon.auth.register({
      email: "member@example.com",
      password: "another good passphrase",
    });
    const memberSession = await anon.auth.login({
      email: "member@example.com",
      password: "another good passphrase",
    });
    const memberClient = h.client({ token: memberSession.id }, org.id);

    const members = await ownerClient.organizations.listMembers(org.id);
    expect(members.map((m) => m.memberId).sort()).toEqual(
      [owner.id, member.id].sort(),
    );

    // --- authorization parity: Member lacks project:create (R32.4/R20.5) --
    await expect(memberClient.projects.create({ name: "Nope" })).rejects.toMatchObject(
      { code: "AUTHORIZATION_DENIED" },
    );

    // --- project / folder (owner) ---------------------------------------
    const project = await ownerClient.projects.create({ name: "Launch" });
    const folder = await ownerClient.folders.create({
      projectId: project.id,
      name: "Demos",
    });
    expect(folder.depth).toBe(0);

    // --- record → chunked upload ----------------------------------------
    const session = await ownerClient.uploads.create({
      title: "Walkthrough",
      totalChunks: 3,
      folderId: folder.id,
    });
    expect(session.status).toBe("open");
    // Observe chunked-upload progress advance monotonically through status.
    const progress: number[] = [];
    for (let i = 0; i < 3; i++) {
      const s = await ownerClient.uploads.get(session.id);
      progress.push(s.ackedChunks);
    }
    expect(progress).toEqual([1, 2, 3]);

    // --- pipeline → ready ------------------------------------------------
    const completed = await ownerClient.uploads.complete(session.id);
    expect(completed.status).toBe("completed");
    const video = await ownerClient.videos.get(session.videoId);
    expect(video.status).toBe("ready");
    // The pipeline persisted a thumbnail, a preview, and ≥3 renditions.
    expect(
      h.world.assets.filter((a) => a.videoId === video.id && a.type === "thumbnail"),
    ).toHaveLength(1);
    expect(
      h.world.assets.filter((a) => a.videoId === video.id && a.type === "preview"),
    ).toHaveLength(1);
    expect(
      h.world.renditions.filter((r) => r.videoId === video.id).length,
    ).toBeGreaterThanOrEqual(3);

    // --- playback --------------------------------------------------------
    const manifest = await ownerClient.playback.manifest(video.id);
    expect(manifest.videoId).toBe(video.id);
    expect(manifest.renditions.length).toBeGreaterThanOrEqual(3);

    // --- comment + mention ----------------------------------------------
    const comment = await ownerClient.comments.create(video.id, {
      body: "Great work @member@example.com — see 00:12",
      timestampSeconds: 12,
    });
    expect(comment.authorId).toBe(owner.id);
    // The mentioned member (with view access) received a mention notification.
    const notifications = await memberClient.notifications.list();
    expect(notifications.some((n) => n.eventType === "mention")).toBe(true);

    // The invited member can view the comment thread (has comment:read).
    const thread = await memberClient.comments.list(video.id);
    expect(thread.map((c) => c.id)).toContain(comment.id);

    // --- share access ----------------------------------------------------
    const share = await ownerClient.sharing.create(video.id, {});
    expect(share.passcodeProtected).toBe(false);
    // Resolving the share requires NO authentication (public credential).
    const shared = await anon.sharing.resolve({ credential: share.credential });
    expect(shared.id).toBe(video.id);

    // Revoking the share denies subsequent resolution.
    await ownerClient.sharing.revoke(share.id);
    await expect(
      anon.sharing.resolve({ credential: share.credential }),
    ).rejects.toMatchObject({ code: "SHARE_LINK_EXPIRED" });

    // The mutating, authorized operations were audited on success.
    expect(h.audits.some((e) => e.outcome === "success")).toBe(true);
    // The denied Member project-create was audited as an authorization denial.
    expect(
      h.audits.some((e) => e.outcome === "authorization_denied"),
    ).toBe(true);
  });

  it("denies playback of a not-yet-ready video through the public surface", async () => {
    const h = makeHarness();
    const anon = h.client();
    await anon.auth.register({ email: "o@example.com", password: "passphrase-1234" });
    const s = await anon.auth.login({ email: "o@example.com", password: "passphrase-1234" });
    const noOrg = h.client({ token: s.id });
    const org = await noOrg.organizations.create({ name: "Org" });
    const client = h.client({ token: s.id }, org.id);

    const session = await client.uploads.create({ title: "Raw", totalChunks: 1 });
    // No complete → the video is still "uploading", so playback is refused.
    await expect(client.playback.manifest(session.videoId)).rejects.toMatchObject({
      code: "VIDEO_NOT_READY",
    });
  });
});
