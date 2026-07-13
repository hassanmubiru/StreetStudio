/**
 * Engineering Reviews (`packages/media` + source control plugin).
 *
 * Implements the design's "Engineering Reviews" section and Requirement 24:
 * Engineering Reviews and Source Control Integration. The {@link ReviewService}
 * lets engineers attach review context to a Video:
 *
 *  - {@link ReviewService.linkPullRequest} associates a Video with a pull
 *    request IF AND ONLY IF (a) the requester holds link permission in the
 *    Video's owning Organization (R24.1, R24.6) and (b) the pull request (and
 *    its repository) is accessible through an *enabled* source-control plugin
 *    (R24.1, R24.2, R24.4). When both hold, the association is stored and the
 *    resulting {@link PullRequestLinkDto} returned; otherwise no association is
 *    created.
 *  - {@link ReviewService.postReviewComment} stores a timestamped review comment
 *    on a Video IF AND ONLY IF the body is 1–5000 characters and the referenced
 *    timestamp is within `[0, duration]` (R24.3, R24.5). It reuses the Comment
 *    machinery and its comment-permission enforcement wholesale through the
 *    narrow {@link CommentPoster} seam, so a review comment is an ordinary
 *    timestamp-anchored comment and shares one validation/permission path.
 *
 * The service deliberately does NOT import any concrete source-control
 * integration package (`@streetstudio/integration-github`,
 * `@streetstudio/integration-gitlab`). Instead, accessibility is resolved
 * through the injected {@link SourceControlAccess} seam: the GitHub/GitLab
 * integration plugins provide the capability, and a caller wires an adapter
 * that consults only the *enabled* plugin(s). This keeps the media package
 * decoupled from vendor integrations and the dependency graph acyclic (design
 * "Single-responsibility packages"). A reference the seam cannot resolve — the
 * plugin is not enabled, or the pull request/repository does not exist or is not
 * accessible through it — yields `null`, which the service maps to a rejection
 * with no association created (R24.4).
 *
 * Every failure is surfaced through the shared error taxonomy (`AppError`): an
 * unknown Video raises `NOT_FOUND`; a requester lacking link permission raises
 * `AUTHORIZATION_DENIED`; an inaccessible pull request/repository raises
 * `NOT_FOUND` (the shared "exists-but-not-accessible" code, chosen to avoid
 * disclosing existence, R24.4); and an out-of-range comment body/timestamp
 * raises `VALIDATION_FAILED` (delegated to the Comment machinery, R24.5). In
 * every failure case no association or comment is stored.
 *
 * Persistence is reached only through the narrow {@link ReviewStore} port and
 * authorization only through the {@link AccessControl} seam from
 * `@streetstudio/auth`, so the service is unit-testable with in-memory fakes.
 * The default adapter ({@link repositoryReviewStore}) is backed by the Video and
 * PullRequestLink repositories exposed by `@streetstudio/database`.
 */
import { newUuid } from "@streetstudio/database";
import type {
  PullRequestLinkRecord,
  Repositories,
  VideoRecord,
} from "@streetstudio/database";
import {
  systemClock,
  toIsoTimestamp,
  type AccessControl,
  type AuthContext,
  type Clock,
} from "@streetstudio/auth";
import { AppError } from "@streetstudio/shared";
import type { CommentDto, PullRequestLinkDto, Uuid } from "@streetstudio/shared";

/**
 * Permission a Role must grant to link a Video to a pull request within an
 * Organization (R24.1, R24.6). Evaluated by {@link AccessControl.can} in the
 * Video's owning Organization scope.
 */
export const LINK_PULL_REQUEST_PERMISSION = "content:link_pr";

/**
 * A reference to a pull request the caller wishes to link, expressed in terms
 * the {@link SourceControlAccess} seam understands: the repository it belongs to
 * and its number within that repository. This mirrors the shape exposed by the
 * source-control integration plugins (repository + pull-request number) without
 * this package depending on any of them.
 */
export interface PrRef {
  /** Identifier of the repository the pull request belongs to. */
  readonly repositoryId: string;
  /** The pull request's number within its repository. */
  readonly number: number;
}

/**
 * A pull-request reference resolved as accessible through an enabled
 * source-control plugin. Carries the identity of the plugin that vouches for
 * accessibility and the canonical stored reference persisted on the
 * association.
 */
export interface ResolvedPullRequest {
  /** The enabled source-control plugin through which the PR is accessible. */
  readonly pluginId: Uuid;
  /** Canonical, stored reference string for the pull request. */
  readonly prRef: string;
}

/**
 * Narrow seam for accessing pull requests through an *enabled* source-control
 * plugin (R24.2, R24.4).
 *
 * The media package deliberately does NOT depend on a concrete integration
 * (GitHub/GitLab) package; instead a caller injects an adapter that consults
 * only the enabled source-control plugin(s) and their repository/pull-request
 * access capability. {@link SourceControlAccess.resolvePullRequest} returns a
 * {@link ResolvedPullRequest} when the referenced pull request (and its
 * repository) is accessible through such a plugin, and `null` otherwise — i.e.
 * when no source-control plugin is enabled, or the referenced pull request or
 * repository does not exist or is not accessible through it. Callers treat
 * `null` as "not accessible" and reject the link (R24.4).
 */
export interface SourceControlAccess {
  /**
   * Resolve `pr` to the enabled plugin that provides access to it and the
   * canonical stored reference, or `null` when it is not accessible through any
   * enabled source-control plugin.
   */
  resolvePullRequest(pr: PrRef): Promise<ResolvedPullRequest | null>;
}

/**
 * Comment-posting seam reused by {@link ReviewService.postReviewComment}
 * (R24.3, R24.5). This is exactly the shape of `CommentService.post`, so a
 * caller passes the shared CommentService instance and review comments flow
 * through the same body/timestamp validation and comment-permission
 * enforcement as ordinary comments — a review comment is a timestamp-anchored
 * comment.
 */
export interface CommentPoster {
  /**
   * Post a comment on `videoId` at `timestamp`, validating the body length and
   * timestamp bounds and enforcing comment permission in the Video's owning
   * Organization.
   */
  post(
    actor: AuthContext,
    videoId: Uuid,
    body: string,
    timestamp?: number,
  ): Promise<CommentDto>;
}

/**
 * Persistence port for pull-request associations. Deliberately narrow: the
 * service resolves the target Video (for the owning Organization that scopes
 * authorization) and inserts a PullRequestLink.
 */
export interface ReviewStore {
  /** Find a Video by id irrespective of tenant, or null when absent. */
  findVideo(videoId: Uuid): Promise<VideoRecord | null>;
  /** Persist a new PullRequestLink and return it. */
  insertPullRequestLink(
    record: PullRequestLinkRecord,
  ): Promise<PullRequestLinkRecord>;
}

/** Dependencies required to construct a {@link ReviewService}. */
export interface ReviewServiceDeps {
  /** PullRequestLink/Video persistence port. */
  readonly store: ReviewStore;
  /** RBAC evaluator used to gate linking in the Video's owning scope (R24.6). */
  readonly access: AccessControl;
  /** Enabled source-control plugin access seam (R24.2, R24.4). */
  readonly sourceControl: SourceControlAccess;
  /** Comment machinery reused for review comments (R24.3, R24.5). */
  readonly comments: CommentPoster;
  /** Time source; defaults to the system clock. */
  readonly clock?: Clock;
  /** UUID generator; defaults to the database id generator. */
  readonly newId?: () => Uuid;
}

/**
 * The Engineering Reviews service. See the module doc for the exact semantics of
 * each operation.
 */
export class ReviewService {
  private readonly store: ReviewStore;
  private readonly access: AccessControl;
  private readonly sourceControl: SourceControlAccess;
  private readonly comments: CommentPoster;
  private readonly clock: Clock;
  private readonly newId: () => Uuid;

  constructor(deps: ReviewServiceDeps) {
    this.store = deps.store;
    this.access = deps.access;
    this.sourceControl = deps.sourceControl;
    this.comments = deps.comments;
    this.clock = deps.clock ?? systemClock;
    this.newId = deps.newId ?? newUuid;
  }

  /**
   * Associate `videoId` with the pull request referenced by `pr`. Stores and
   * returns the association IF AND ONLY IF the requester holds link permission
   * in the Video's owning Organization (R24.1, R24.6) and `pr` is accessible
   * through an enabled source-control plugin (R24.1, R24.2, R24.4).
   *
   * Resolution order: the Video is resolved first (`NOT_FOUND` when unknown),
   * then link permission is enforced (`AUTHORIZATION_DENIED` when denied, so an
   * unauthorized caller cannot probe accessibility), then accessibility is
   * resolved through the {@link SourceControlAccess} seam (`NOT_FOUND` when the
   * seam returns `null`). Any failure creates no association (R24.4, R24.6).
   */
  async linkPullRequest(
    actor: AuthContext,
    videoId: Uuid,
    pr: PrRef,
  ): Promise<PullRequestLinkDto> {
    const video = await this.store.findVideo(videoId);
    if (!video) {
      throw new AppError("NOT_FOUND");
    }

    // R24.6 — link permission, evaluated in the Video's owning Organization
    // scope. A denied caller learns nothing about the PR's accessibility.
    const permitted = await this.access.can(
      actor,
      LINK_PULL_REQUEST_PERMISSION,
      { organizationId: video.organizationId, type: "video", id: video.id },
    );
    if (!permitted) {
      throw new AppError("AUTHORIZATION_DENIED");
    }

    // R24.2, R24.4 — the reference must be accessible through an enabled
    // source-control plugin. `null` means the plugin is not enabled, or the PR
    // or repository does not exist or is not accessible through it.
    const resolved = await this.sourceControl.resolvePullRequest(pr);
    if (!resolved) {
      throw new AppError("NOT_FOUND");
    }

    const record: PullRequestLinkRecord = {
      id: this.newId(),
      videoId: video.id,
      pluginId: resolved.pluginId,
      prRef: resolved.prRef,
      createdAt: toIsoTimestamp(this.clock.now()),
    };
    const created = await this.store.insertPullRequestLink(record);
    return toPullRequestLinkDto(created);
  }

  /**
   * Post a timestamped review comment on `videoId`. Delegates to the Comment
   * machinery, which stores and returns the comment IF AND ONLY IF `body` is
   * 1–5000 characters and `timestamp` is within `[0, duration]` (R24.3, R24.5)
   * and the author holds comment permission in the Video's owning Organization.
   * Any failure throws through the shared taxonomy and stores nothing.
   */
  async postReviewComment(
    actor: AuthContext,
    videoId: Uuid,
    body: string,
    timestamp: number,
  ): Promise<CommentDto> {
    return this.comments.post(actor, videoId, body, timestamp);
  }
}

/** Map a {@link PullRequestLinkRecord} to its wire DTO. */
function toPullRequestLinkDto(
  record: PullRequestLinkRecord,
): PullRequestLinkDto {
  return {
    id: record.id,
    videoId: record.videoId,
    pluginId: record.pluginId,
    prRef: record.prRef,
    createdAt: record.createdAt,
  };
}

/**
 * Default {@link ReviewStore} backed by the repositories from
 * `@streetstudio/database`.
 *
 * PullRequestLinks are id-keyed globally (the PullRequestLink repository).
 * Videos are resolved via the tenant-scoped Video repository's unscoped lookup
 * because a link carries only a `videoId`; the resolved record's
 * `organizationId` then scopes authorization (the "resolve, then authorize in
 * the owning scope" pattern shared with the Comment and Developer-asset stores).
 */
export function repositoryReviewStore(
  repositories: Pick<Repositories, "pullRequestLinks" | "videos">,
): ReviewStore {
  const { pullRequestLinks, videos } = repositories;
  return {
    findVideo: (videoId) => videos.findByIdUnscoped(videoId),
    insertPullRequestLink: (record) => pullRequestLinks.insert(record),
  };
}
