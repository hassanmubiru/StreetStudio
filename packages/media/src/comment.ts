/**
 * Comments, Threads, Reactions & Mentions (`packages/media`).
 *
 * Implements the design's "Comments, Threads, Reactions" section and
 * Requirement 11. The {@link CommentService} owns the domain logic for
 * discussion attached to a Video:
 *
 *  - {@link CommentService.post} stores a top-level comment on a Video IF AND
 *    ONLY IF the body length is between {@link COMMENT_BODY_MIN_LENGTH} and
 *    {@link COMMENT_BODY_MAX_LENGTH} characters (R11.1, R11.8) and — when a
 *    timestamp is supplied — that timestamp is between 0 and the Video's
 *    duration inclusive (R11.2, R11.9); otherwise no comment is stored. A
 *    supplied timestamp anchors the comment to that playback position (R11.2).
 *    The author must hold comment permission in the Video's owning Organization
 *    (R11.7); a denied request stores nothing.
 *  - {@link CommentService.reply} stores a reply nested under an existing parent
 *    comment (`parentCommentId` set to the parent), subject to the same body
 *    validation and comment-permission enforcement (R11.3, R11.7, R11.8).
 *  - {@link CommentService.react} records a reaction of a given type on a Video
 *    or comment, retaining at most one reaction of each type per Member per
 *    target: adding the same type again is idempotent and records nothing new
 *    (R11.5).
 *  - {@link CommentService.mention} creates a notification for a mentioned
 *    Member IF AND ONLY IF that Member has view access to the Video the comment
 *    belongs to (R11.4). Notification creation is reached through the narrow
 *    {@link MentionNotifier} seam rather than a direct dependency on
 *    `@streetstudio/notifications`, keeping the package dependency graph acyclic
 *    (design "Single-responsibility packages": the graph must stay acyclic).
 *
 * Every failure is surfaced through the shared error taxonomy (`AppError`): an
 * invalid body or timestamp raises `VALIDATION_FAILED`; an unknown Video or
 * parent comment raises `NOT_FOUND`; a requester lacking comment permission
 * raises `AUTHORIZATION_DENIED` and stores nothing.
 *
 * Persistence is reached only through the narrow {@link CommentStore} port and
 * authorization only through the {@link AccessControl} seam from
 * `@streetstudio/auth`, so the service is decoupled from the concrete database
 * layer and unit-testable with in-memory fakes. The default adapter
 * ({@link repositoryCommentStore}) is backed by the Comment, Reaction, and
 * Video repositories exposed by `@streetstudio/database`.
 */
import { newUuid } from "@streetstudio/database";
import type {
  CommentRecord,
  ReactionRecord,
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
import type { CommentDto, ReactionTargetType, Uuid } from "@streetstudio/shared";

import { VIEW_VIDEO_PERMISSION } from "./playback.js";

/**
 * Permission a Role must grant to post a comment or reply, or to react, on a
 * Video within an Organization (R11.7). Evaluated by {@link AccessControl.can}
 * in the Video's owning Organization scope.
 */
export const POST_COMMENT_PERMISSION = "content:comment";

/** Minimum length, in characters, of a comment/reply body (R11.1, R11.8). */
export const COMMENT_BODY_MIN_LENGTH = 1;

/** Maximum length, in characters, of a comment/reply body (R11.1, R11.8). */
export const COMMENT_BODY_MAX_LENGTH = 5000;

/**
 * Event type recorded on a notification created for a mentioned Member (R11.4).
 * Carried to the {@link MentionNotifier} seam so the notifications layer records
 * a consistent event type without this package importing that layer.
 */
export const MENTION_EVENT_TYPE = "comment-mention";

/**
 * A target a reaction may be attached to: a Video or a comment (R11.5). The
 * `id` identifies the specific Video/comment.
 */
export interface ReactionTarget {
  /** Whether the reaction targets a Video or a comment. */
  readonly type: ReactionTargetType;
  /** The id of the targeted Video or comment. */
  readonly id: Uuid;
}

/**
 * Narrow seam for creating a mention notification (R11.4).
 *
 * The media package deliberately does NOT depend on `@streetstudio/notifications`
 * directly; instead a caller injects an adapter that forwards to the
 * NotificationService (e.g. `notify.notifyMention(m, c)` →
 * `notificationService.create(m, { eventType: MENTION_EVENT_TYPE,
 * sourceResourceId: c })`). This keeps the package dependency graph acyclic
 * while still creating a notification for the mentioned Member.
 */
export interface MentionNotifier {
  /**
   * Create a notification for `mentionedMemberId` about the comment identified
   * by `commentId` (the notification's source resource).
   */
  notifyMention(mentionedMemberId: Uuid, commentId: Uuid): Promise<void>;
}

/**
 * Persistence port for comments and reactions. Deliberately narrow: the service
 * inserts comments, resolves a comment (for replies/mentions) and its Video
 * (for authorization scope and duration), lists a target's reactions (for
 * idempotency), and inserts a reaction.
 */
export interface CommentStore {
  /** Persist a new comment/reply and return it. */
  insertComment(record: CommentRecord): Promise<CommentRecord>;
  /** Find a comment by id, or null when absent. */
  findComment(id: Uuid): Promise<CommentRecord | null>;
  /** Find a Video by id irrespective of tenant, or null when absent. */
  findVideo(videoId: Uuid): Promise<VideoRecord | null>;
  /** List reactions recorded on a target (empty when none). */
  listReactions(
    targetType: ReactionTargetType,
    targetId: Uuid,
  ): Promise<ReactionRecord[]>;
  /** Persist a new reaction. */
  insertReaction(record: ReactionRecord): Promise<void>;
}

/** Dependencies required to construct a {@link CommentService}. */
export interface CommentServiceDeps {
  /** Comment/reaction persistence port. */
  readonly store: CommentStore;
  /** RBAC evaluator used to gate posting/reacting (R11.7) and view access (R11.4). */
  readonly access: AccessControl;
  /** Mention-notification seam (R11.4). */
  readonly notifier: MentionNotifier;
  /** Time source; defaults to the system clock. */
  readonly clock?: Clock;
  /** UUID generator; defaults to the database id generator. */
  readonly newId?: () => Uuid;
}

/** Whether `body` is within the permitted comment length bounds (R11.1, R11.8). */
function isValidBody(body: string): boolean {
  return (
    body.length >= COMMENT_BODY_MIN_LENGTH &&
    body.length <= COMMENT_BODY_MAX_LENGTH
  );
}

/**
 * Whether `timestamp` is a valid playback position for a Video of
 * `durationSeconds`: a finite number in `[0, durationSeconds]` (R11.2, R11.9).
 */
function isValidTimestamp(timestamp: number, durationSeconds: number): boolean {
  return (
    Number.isFinite(timestamp) &&
    timestamp >= 0 &&
    timestamp <= durationSeconds
  );
}

/**
 * The Comments, Threads, Reactions & Mentions service. See the module doc for
 * the exact semantics of each operation.
 */
export class CommentService {
  private readonly store: CommentStore;
  private readonly access: AccessControl;
  private readonly notifier: MentionNotifier;
  private readonly clock: Clock;
  private readonly newId: () => Uuid;

  constructor(deps: CommentServiceDeps) {
    this.store = deps.store;
    this.access = deps.access;
    this.notifier = deps.notifier;
    this.clock = deps.clock ?? systemClock;
    this.newId = deps.newId ?? newUuid;
  }

  /**
   * Post a top-level comment on `videoId`. Stores and returns the comment IF
   * AND ONLY IF the body is 1–5000 characters (R11.1, R11.8), any supplied
   * `timestamp` is within `[0, duration]` (R11.2, R11.9), and the author holds
   * comment permission in the Video's owning Organization (R11.7). A supplied
   * timestamp anchors the comment to that playback position (R11.2). Any
   * failure throws and stores nothing.
   */
  async post(
    actor: AuthContext,
    videoId: Uuid,
    body: string,
    timestamp?: number,
  ): Promise<CommentDto> {
    if (!isValidBody(body)) {
      throw new AppError("VALIDATION_FAILED");
    }

    const video = await this.store.findVideo(videoId);
    if (!video) {
      throw new AppError("NOT_FOUND");
    }

    if (
      timestamp !== undefined &&
      !isValidTimestamp(timestamp, video.durationSeconds)
    ) {
      throw new AppError("VALIDATION_FAILED");
    }

    await this.requirePermission(actor, POST_COMMENT_PERMISSION, {
      organizationId: video.organizationId,
      type: "video",
      id: video.id,
    });

    const record: CommentRecord = {
      id: this.newId(),
      videoId: video.id,
      parentCommentId: null,
      authorId: actor.memberId,
      body,
      timestampSeconds: timestamp ?? null,
      createdAt: toIsoTimestamp(this.clock.now()),
    };
    const created = await this.store.insertComment(record);
    return toCommentDto(created);
  }

  /**
   * Post a reply to an existing comment `parentId`, nesting it under that
   * parent's thread (`parentCommentId` = `parentId`) (R11.3). Subject to the
   * same body validation (R11.8) and comment-permission enforcement in the
   * parent's Video's owning Organization (R11.7). A failure stores nothing.
   */
  async reply(
    actor: AuthContext,
    parentId: Uuid,
    body: string,
  ): Promise<CommentDto> {
    if (!isValidBody(body)) {
      throw new AppError("VALIDATION_FAILED");
    }

    const parent = await this.store.findComment(parentId);
    if (!parent) {
      throw new AppError("NOT_FOUND");
    }

    const video = await this.store.findVideo(parent.videoId);
    if (!video) {
      throw new AppError("NOT_FOUND");
    }

    await this.requirePermission(actor, POST_COMMENT_PERMISSION, {
      organizationId: video.organizationId,
      type: "comment",
      id: parent.id,
    });

    const record: CommentRecord = {
      id: this.newId(),
      videoId: parent.videoId,
      parentCommentId: parent.id,
      authorId: actor.memberId,
      body,
      timestampSeconds: null,
      createdAt: toIsoTimestamp(this.clock.now()),
    };
    const created = await this.store.insertComment(record);
    return toCommentDto(created);
  }

  /**
   * Record a reaction of `type` by `actor` on `target`. The actor must hold
   * comment permission in the target's owning Organization (R11.7). At most one
   * reaction of each type per Member per target is retained: if the actor has
   * already reacted with `type` on this target, the call is idempotent and
   * records nothing new (R11.5).
   */
  async react(
    actor: AuthContext,
    target: ReactionTarget,
    type: string,
  ): Promise<void> {
    const video = await this.resolveTargetVideo(target);

    await this.requirePermission(actor, POST_COMMENT_PERMISSION, {
      organizationId: video.organizationId,
      type: target.type,
      id: target.id,
    });

    const existing = await this.store.listReactions(target.type, target.id);
    const alreadyReacted = existing.some(
      (r) => r.memberId === actor.memberId && r.type === type,
    );
    // Idempotent: at most one reaction of each type per Member per target (R11.5).
    if (alreadyReacted) {
      return;
    }

    await this.store.insertReaction({
      targetType: target.type,
      targetId: target.id,
      memberId: actor.memberId,
      type,
    });
  }

  /**
   * Create a notification for `mentionedMemberId` about comment `commentId` IF
   * AND ONLY IF that Member has view access to the comment's Video (R11.4). A
   * mentioned Member without view access receives no notification. An unknown
   * comment or Video raises `NOT_FOUND`.
   */
  async mention(commentId: Uuid, mentionedMemberId: Uuid): Promise<void> {
    const comment = await this.store.findComment(commentId);
    if (!comment) {
      throw new AppError("NOT_FOUND");
    }

    const video = await this.store.findVideo(comment.videoId);
    if (!video) {
      throw new AppError("NOT_FOUND");
    }

    // Evaluate the mentioned Member's view access in the Video's owning scope.
    const hasViewAccess = await this.access.can(
      { memberId: mentionedMemberId },
      VIEW_VIDEO_PERMISSION,
      { organizationId: video.organizationId, type: "video", id: video.id },
    );
    if (!hasViewAccess) {
      return;
    }

    await this.notifier.notifyMention(mentionedMemberId, comment.id);
  }

  /**
   * Resolve the Video a reaction target belongs to. A `video` target resolves
   * directly; a `comment` target resolves via the comment to its Video. Throws
   * `NOT_FOUND` when the target (or its Video) does not exist.
   */
  private async resolveTargetVideo(
    target: ReactionTarget,
  ): Promise<VideoRecord> {
    if (target.type === "comment") {
      const comment = await this.store.findComment(target.id);
      if (!comment) {
        throw new AppError("NOT_FOUND");
      }
      const video = await this.store.findVideo(comment.videoId);
      if (!video) {
        throw new AppError("NOT_FOUND");
      }
      return video;
    }

    const video = await this.store.findVideo(target.id);
    if (!video) {
      throw new AppError("NOT_FOUND");
    }
    return video;
  }

  /**
   * Throw `AUTHORIZATION_DENIED` unless `actor` may perform `action` on the
   * resource in its owning Organization scope (R11.7).
   */
  private async requirePermission(
    actor: AuthContext,
    action: string,
    resource: { organizationId: Uuid; type: string; id: Uuid },
  ): Promise<void> {
    const permitted = await this.access.can(actor, action, resource);
    if (!permitted) {
      throw new AppError("AUTHORIZATION_DENIED");
    }
  }
}

/** Map a {@link CommentRecord} to its wire DTO, omitting absent optional fields. */
function toCommentDto(record: CommentRecord): CommentDto {
  return {
    id: record.id,
    videoId: record.videoId,
    authorId: record.authorId,
    body: record.body,
    createdAt: record.createdAt,
    ...(record.parentCommentId !== null
      ? { parentCommentId: record.parentCommentId }
      : {}),
    ...(record.timestampSeconds !== null
      ? { timestampSeconds: record.timestampSeconds }
      : {}),
  };
}

/**
 * Default {@link CommentStore} backed by the repositories from
 * `@streetstudio/database`.
 *
 * Comments are id-keyed globally (the Comment repository), so a comment is
 * resolved directly by id. Videos are resolved via the tenant-scoped Video
 * repository's unscoped lookup because a comment/reaction carries only a
 * `videoId`; the resolved record's `organizationId` then scopes authorization
 * (the "resolve, then authorize in the owning scope" pattern). Reactions use
 * the composite-key Reaction repository.
 */
export function repositoryCommentStore(
  repositories: Pick<Repositories, "comments" | "reactions" | "videos">,
): CommentStore {
  const { comments, reactions, videos } = repositories;
  return {
    insertComment: (record) => comments.insert(record),
    findComment: (id) => comments.findById(id),
    findVideo: (videoId) => videos.findByIdUnscoped(videoId),
    listReactions: (targetType, targetId) =>
      reactions.listByTarget(targetType, targetId),
    async insertReaction(record) {
      await reactions.insert(record);
    },
  };
}
