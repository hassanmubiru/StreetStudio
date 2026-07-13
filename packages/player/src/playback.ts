/**
 * Streaming & Playback Service (`packages/media`).
 *
 * Implements the design's "Streaming & Playback" section and Requirement 10:
 * Video Streaming and Playback. The service answers a single question — "may
 * this requester stream this Video, and if so, what does the adaptive-bitrate
 * manifest look like?" — enforcing the biconditional at the heart of Property
 * 30/31:
 *
 *   A streaming manifest referencing the Video's adaptive-bitrate renditions is
 *   provided IF AND ONLY IF the Video is in the `ready` state AND the requester
 *   holds view permission (via the RBAC {@link AccessControl} seam from
 *   `@streetstudio/auth`) OR presents a share credential that is valid,
 *   unexpired, and not revoked. Otherwise no manifest is produced and an
 *   appropriate error is raised (R10.1–R10.5).
 *
 * Authorization is resolved before readiness so that an unauthorized requester
 * never learns a Video's processing state:
 *
 *  - View permission is evaluated by {@link AccessControl.can} in the owning
 *    Organization's scope (R10.1, R10.2). The Video is resolved by id and its
 *    `organizationId` supplies that scope.
 *  - When the requester lacks view permission but presents a share credential,
 *    the credential is checked through the injectable {@link ShareCredentialResolver}
 *    seam. A credential that is valid, unexpired, not revoked, and bound to the
 *    requested Video grants playback (R10.4); any other credential is denied
 *    with a share-credential error (R10.5).
 *  - A requester with neither view permission nor a (valid) share credential is
 *    denied with an authorization error and receives no manifest (R10.2).
 *
 * Only after authorization is the readiness gate applied: a Video that is not
 * `ready` yields a "not available for playback" error and no manifest (R10.3).
 *
 * Every failure is surfaced through the shared error taxonomy (`AppError`):
 * missing/unknown Video → `NOT_FOUND`; no view permission and no valid share
 * credential → `AUTHORIZATION_DENIED`; a presented-but-invalid/expired/revoked
 * share credential → `SHARE_LINK_EXPIRED` (message: "The share link is no
 * longer valid."); a Video that is not ready → `VIDEO_NOT_READY` (message: "The
 * video is not available for playback.").
 *
 * Persistence is reached only through the narrow {@link PlaybackStore} port and
 * the {@link ShareCredentialResolver} seam, so the service is decoupled from the
 * concrete database layer (and from the forthcoming full ShareService, task
 * 19.1) and is unit-testable with in-memory fakes. Default adapters
 * ({@link repositoryPlaybackStore}, {@link repositoryShareCredentialResolver})
 * are backed by the Video, Rendition, and ShareLink repositories exposed by
 * `@streetstudio/database`.
 */
import type {
  Repositories,
  RenditionRecord,
  ShareLinkRecord,
  VideoRecord,
} from "@streetstudio/database";
import { systemClock, type Clock } from "@streetstudio/auth";
import type { AccessControl, AuthContext } from "@streetstudio/auth";
import { AppError } from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";

/**
 * Permission a Role must grant to stream a Video within an Organization (R10.1,
 * R10.2). Evaluated by {@link AccessControl.can} in the Video's owning
 * Organization scope.
 */
export const VIEW_VIDEO_PERMISSION = "content:view_video";

/**
 * The context of a playback request.
 *
 * Playback generalizes the media `AccessContext`: a requester may be an
 * authenticated Member (`auth`), a holder of a secure-share credential
 * (`shareCredential`), or — when a link is both — either. Both fields are
 * optional; a request carrying neither is unauthorized (R10.2).
 */
export interface PlaybackContext {
  /** The authenticated principal, when the requester is signed in. */
  readonly auth?: AuthContext;
  /** A secure-share credential presented in lieu of (or alongside) `auth`. */
  readonly shareCredential?: string;
}

/** A single adaptive-bitrate rendition referenced by a {@link StreamManifest}. */
export interface ManifestRendition {
  /** The Rendition's identifier. */
  readonly id: Uuid;
  /** Human-readable quality label (e.g. "1080p"). */
  readonly quality: string;
  /** Encoded bitrate in bits per second. */
  readonly bitrate: number;
  /** Storage object key locating the rendition's media. */
  readonly objectKey: string;
}

/**
 * An adaptive-bitrate streaming manifest referencing a ready Video's
 * renditions (R10.1). Returned only when playback is granted.
 */
export interface StreamManifest {
  /** The Video the manifest streams. */
  readonly videoId: Uuid;
  /** The Video's adaptive-bitrate renditions, in repository order. */
  readonly renditions: readonly ManifestRendition[];
}

/**
 * The Video a valid share credential grants playback for.
 */
export interface ResolvedShare {
  /** The Video the credential is bound to. */
  readonly videoId: Uuid;
}

/**
 * Injectable seam that resolves a secure-share credential.
 *
 * A production implementation (ultimately the ShareService of task 19.1) MUST
 * resolve a credential to the Video it grants ONLY when the credential is
 * valid, unexpired, and not revoked as of `now`; every other credential
 * (unknown, expired, revoked, or otherwise not presently valid) MUST resolve to
 * `null` (R10.4, R10.5). Passcode and lockout enforcement (R15.5–R15.7) are the
 * ShareService's concern and are layered in by swapping this seam.
 */
export interface ShareCredentialResolver {
  /** Resolve `credential` to its Video when presently valid; otherwise null. */
  resolve(credential: string, now: Date): Promise<ResolvedShare | null>;
}

/**
 * Persistence port for playback. Deliberately narrow: the service resolves a
 * Video by id (its owning Organization supplies the authorization scope) and
 * lists that Video's renditions to assemble the manifest.
 */
export interface PlaybackStore {
  /** Find a Video by id irrespective of tenant, or null when absent. */
  findVideo(videoId: Uuid): Promise<VideoRecord | null>;
  /** List the renditions belonging to a Video (empty when none). */
  listRenditions(videoId: Uuid): Promise<RenditionRecord[]>;
}

/** Dependencies required to construct a {@link PlaybackService}. */
export interface PlaybackServiceDeps {
  /** Playback persistence port. */
  readonly store: PlaybackStore;
  /** RBAC evaluator used to gate view access (R10.1, R10.2). */
  readonly access: AccessControl;
  /** Secure-share credential resolver seam (R10.4, R10.5). */
  readonly shareResolver: ShareCredentialResolver;
  /** Time source; defaults to the system clock. */
  readonly clock?: Clock;
}

/**
 * The Streaming & Playback Service. See the module doc for the exact semantics.
 */
export class PlaybackService {
  private readonly store: PlaybackStore;
  private readonly access: AccessControl;
  private readonly shareResolver: ShareCredentialResolver;
  private readonly clock: Clock;

  constructor(deps: PlaybackServiceDeps) {
    this.store = deps.store;
    this.access = deps.access;
    this.shareResolver = deps.shareResolver;
    this.clock = deps.clock ?? systemClock;
  }

  /**
   * Produce an adaptive-bitrate streaming manifest for `videoId`.
   *
   * Returns a {@link StreamManifest} referencing the Video's renditions IF AND
   * ONLY IF the Video is `ready` AND the requester either holds view permission
   * or presents a valid, unexpired, non-revoked share credential bound to the
   * Video. Otherwise no manifest is produced and an {@link AppError} is thrown
   * (see the module doc for the code mapping). Authorization is checked before
   * readiness so an unauthorized requester never learns the Video's state.
   */
  async getManifest(
    ctx: PlaybackContext,
    videoId: Uuid,
  ): Promise<StreamManifest> {
    const video = await this.store.findVideo(videoId);
    if (!video) {
      throw new AppError("NOT_FOUND");
    }

    // --- Authorization (R10.1, R10.2, R10.4, R10.5) --------------------------
    await this.authorize(ctx, video);

    // --- Readiness (R10.1, R10.3) --------------------------------------------
    if (video.status !== "ready") {
      throw new AppError("VIDEO_NOT_READY");
    }

    // --- Manifest assembly (R10.1) -------------------------------------------
    const renditions = await this.store.listRenditions(video.id);
    return {
      videoId: video.id,
      renditions: renditions.map((r) => ({
        id: r.id,
        quality: r.quality,
        bitrate: r.bitrate,
        objectKey: r.objectKey,
      })),
    };
  }

  /**
   * Grant playback when the requester holds view permission in the Video's
   * owning Organization (R10.1, R10.2), or presents a share credential that is
   * valid, unexpired, not revoked, and bound to the Video (R10.4). A presented
   * credential that fails to resolve to the Video is rejected with a
   * share-credential error (R10.5). A requester with neither is denied (R10.2).
   */
  private async authorize(
    ctx: PlaybackContext,
    video: VideoRecord,
  ): Promise<void> {
    // View permission takes precedence: a permitted Member streams regardless
    // of any (even invalid) share credential presented alongside.
    if (ctx.auth) {
      const permitted = await this.access.can(ctx.auth, VIEW_VIDEO_PERMISSION, {
        organizationId: video.organizationId,
        type: "video",
        id: video.id,
      });
      if (permitted) {
        return;
      }
    }

    // Fall back to a share credential, when one is presented (R10.4, R10.5).
    if (ctx.shareCredential !== undefined) {
      const resolved = await this.shareResolver.resolve(
        ctx.shareCredential,
        this.clock.now(),
      );
      if (resolved && resolved.videoId === video.id) {
        return;
      }
      // A credential was presented but is invalid, expired, revoked, or bound
      // to a different Video: deny with the share-credential error (R10.5).
      throw new AppError("SHARE_LINK_EXPIRED");
    }

    // No view permission and no share credential: authorization denied (R10.2).
    throw new AppError("AUTHORIZATION_DENIED");
  }
}

/**
 * Default {@link PlaybackStore} backed by the repositories from
 * `@streetstudio/database`.
 *
 * A Video is resolved via the Video repository's unscoped lookup because a
 * playback requester supplies only a `videoId`; the resolved record's
 * `organizationId` then scopes the authorization decision (the "resolve, then
 * authorize in the owning scope" pattern). Renditions are id-keyed globally, so
 * a Video's renditions are obtained by filtering the rendition table.
 */
export function repositoryPlaybackStore(
  repositories: Pick<Repositories, "videos" | "renditions">,
): PlaybackStore {
  const { videos, renditions } = repositories;
  return {
    findVideo: (videoId) => videos.findByIdUnscoped(videoId),
    async listRenditions(videoId) {
      const all = await renditions.list();
      return all.filter((r) => r.videoId === videoId);
    },
  };
}

/**
 * Default {@link ShareCredentialResolver} backed by the ShareLink repository.
 *
 * Minimal validation scoped to playback: a credential resolves to its Video
 * only when a matching ShareLink exists, is not revoked (`revokedAt` is null),
 * and is unexpired (`expiresAt` is null or strictly after `now`) (R10.4,
 * R10.5). Passcode-protected and lockout behavior (R15.5–R15.7) is intentionally
 * out of scope here and is provided by the full ShareService (task 19.1), which
 * can be substituted for this resolver without touching the PlaybackService.
 */
export function repositoryShareCredentialResolver(
  repositories: Pick<Repositories, "shareLinks">,
): ShareCredentialResolver {
  const { shareLinks } = repositories;
  return {
    async resolve(credential, now) {
      const all = await shareLinks.list();
      const link: ShareLinkRecord | undefined = all.find(
        (l) => l.credential === credential,
      );
      if (!link) {
        return null;
      }
      if (link.revokedAt !== null) {
        return null;
      }
      if (link.expiresAt !== null && new Date(link.expiresAt) <= now) {
        return null;
      }
      return { videoId: link.videoId };
    },
  };
}
