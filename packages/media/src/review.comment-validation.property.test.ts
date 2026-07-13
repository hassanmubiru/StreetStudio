import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type {
  CommentDto,
  ReactionTargetType,
  Uuid,
} from "@streetstudio/shared";
import type {
  CommentRecord,
  PullRequestLinkRecord,
  ReactionRecord,
  VideoRecord,
} from "@streetstudio/database";
import type { AccessControl, AuthContext } from "@streetstudio/auth";
import {
  CommentService,
  COMMENT_BODY_MAX_LENGTH,
  COMMENT_BODY_MIN_LENGTH,
  type CommentStore,
  type MentionNotifier,
} from "@streetstudio/comments";
import {
  ReviewService,
  type CommentPoster,
  type ReviewStore,
  type SourceControlAccess,
} from "./review.js";

/**
 * Property 71: Review comments validate body and timestamp.
 *
 * Feature: streetstudio, Property 71: Review comments validate body and timestamp
 *
 * Validates: Requirements 24.3, 24.5
 *
 * For any review comment, {@link ReviewService.postReviewComment} stores the
 * comment at the referenced playback position IF AND ONLY IF its body length is
 * between 1 and 5000 characters (R24.3) and its referenced timestamp is between
 * 0 and the Video's duration inclusive (R24.3); otherwise no comment is stored.
 * An empty or over-length body, or a negative / over-duration timestamp, is
 * rejected with `VALIDATION_FAILED` and stores nothing (R24.5).
 *
 * A review comment is an ordinary timestamp-anchored comment: the service posts
 * through the {@link CommentPoster} seam, which in production is the shared
 * `CommentService`. This test therefore wires a real {@link CommentService} as
 * the poster so the genuine body/timestamp validation and storage path is
 * exercised end-to-end through `postReviewComment` — not a stub.
 */

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

const ORG: Uuid = "11111111-1111-1111-1111-111111111111";
const VIDEO: Uuid = "22222222-2222-2222-2222-222222222222";
const MEMBER: Uuid = "33333333-3333-3333-3333-333333333333";
const PLUGIN: Uuid = "55555555-5555-5555-5555-555555555555";

const actor: AuthContext = { memberId: MEMBER };

/** Grants everything; comment-permission is not the property under test here (R24.6 is Property 70). */
const allowAll: AccessControl = {
  async can() {
    return true;
  },
  async assignRole() {
    throw new Error("not used");
  },
};

const noNotifier: MentionNotifier = {
  async notifyMention() {
    throw new Error("not used");
  },
};

/** Source-control seam is unused by postReviewComment; provide an inert accessible seam. */
const inertSourceControl: SourceControlAccess = {
  async resolvePullRequest() {
    return { pluginId: PLUGIN, prRef: "unused" };
  },
};

interface Fakes {
  /** ReviewService under test. */
  review: ReviewService;
  /** Comments stored through the real CommentService's store. */
  comments: CommentRecord[];
}

/**
 * Wire a real {@link CommentService} (backed by an in-memory {@link CommentStore}
 * over a single Video of `durationSeconds`) as the {@link CommentPoster} seam of
 * a {@link ReviewService}. `postReviewComment` thus flows through the genuine
 * validation and storage path, and `comments` reflects exactly what was stored.
 */
function makeFakes(durationSeconds: number): Fakes {
  const comments: CommentRecord[] = [];
  const vid: VideoRecord = {
    id: VIDEO,
    organizationId: ORG,
    folderId: null,
    title: "demo",
    durationSeconds,
    status: "ready",
    sourceObjectKey: "src/demo.mp4",
    developerMode: false,
    createdAt: "2024-01-01T00:00:00.000Z",
  };

  const commentStore: CommentStore = {
    async insertComment(record) {
      comments.push(record);
      return record;
    },
    async findComment(id) {
      return comments.find((c) => c.id === id) ?? null;
    },
    async findVideo(videoId) {
      return videoId === vid.id ? vid : null;
    },
    async listReactions(
      _targetType: ReactionTargetType,
      _targetId: Uuid,
    ): Promise<ReactionRecord[]> {
      return [];
    },
    async insertReaction() {
      /* unused */
    },
  };

  let n = 0;
  const commentService = new CommentService({
    store: commentStore,
    access: allowAll,
    notifier: noNotifier,
    newId: () => `00000000-0000-0000-0000-${(++n).toString().padStart(12, "0")}` as Uuid,
  });

  // The ReviewService's own store is only consulted by linkPullRequest; a narrow
  // stub suffices for the comment path.
  const reviewStore: ReviewStore = {
    async findVideo(videoId) {
      return videoId === vid.id ? vid : null;
    },
    async insertPullRequestLink(record: PullRequestLinkRecord) {
      return record;
    },
  };

  // The CommentPoster seam has exactly the shape of CommentService.post.
  const poster: CommentPoster = {
    post: (a, videoId, body, timestamp) =>
      commentService.post(a, videoId, body, timestamp),
  };

  const review = new ReviewService({
    store: reviewStore,
    access: allowAll,
    sourceControl: inertSourceControl,
    comments: poster,
  });

  return { review, comments };
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

/** A body that is either valid (1..5000 chars) or invalid (empty, or over-length). */
const bodyArb: fc.Arbitrary<string> = fc.oneof(
  fc.string({ minLength: COMMENT_BODY_MIN_LENGTH, maxLength: COMMENT_BODY_MAX_LENGTH }),
  fc.constant(""),
  fc
    .integer({ min: COMMENT_BODY_MAX_LENGTH + 1, max: COMMENT_BODY_MAX_LENGTH + 200 })
    .map((len) => "x".repeat(len)),
);

/**
 * A scenario pairing a Video duration with a candidate body and timestamp that
 * span the valid range `[0, duration]`, its boundaries, and invalid values
 * (negative and over-duration). `postReviewComment` always supplies a timestamp.
 */
const scenarioArb = fc.integer({ min: 1, max: 100_000 }).chain((durationSeconds) =>
  fc.record({
    durationSeconds: fc.constant(durationSeconds),
    body: bodyArb,
    timestamp: fc.oneof(
      // Valid: within [0, duration], including boundaries.
      fc.integer({ min: 0, max: durationSeconds }),
      fc.constant(0),
      fc.constant(durationSeconds),
      // Invalid: negative.
      fc.integer({ min: -1000, max: -1 }),
      // Invalid: strictly greater than the duration.
      fc.integer({ min: durationSeconds + 1, max: durationSeconds + 1000 }),
    ),
  }),
);

function isValidBody(body: string): boolean {
  return body.length >= COMMENT_BODY_MIN_LENGTH && body.length <= COMMENT_BODY_MAX_LENGTH;
}

function isValidTimestamp(timestamp: number, duration: number): boolean {
  return timestamp >= 0 && timestamp <= duration;
}

/* -------------------------------------------------------------------------
 * Property 71
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 71: Review comments validate body and timestamp", () => {
  it("postReviewComment stores the comment iff body is 1..5000 chars and timestamp is 0..duration; otherwise VALIDATION_FAILED and nothing stored (R24.3, R24.5)", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ durationSeconds, body, timestamp }) => {
        const { review, comments } = makeFakes(durationSeconds);

        const shouldSucceed =
          isValidBody(body) && isValidTimestamp(timestamp, durationSeconds);

        if (shouldSucceed) {
          const dto: CommentDto = await review.postReviewComment(
            actor,
            VIDEO,
            body,
            timestamp,
          );

          // Exactly one comment stored, anchored to the referenced position (R24.3).
          expect(comments).toHaveLength(1);
          expect(dto.videoId).toBe(VIDEO);
          expect(dto.body).toBe(body);
          expect(dto.authorId).toBe(MEMBER);
          expect(dto.timestampSeconds).toBe(timestamp);
          expect(comments[0]?.timestampSeconds).toBe(timestamp);
        } else {
          // Invalid body or timestamp: rejected with VALIDATION_FAILED, nothing stored (R24.5).
          await expect(
            review.postReviewComment(actor, VIDEO, body, timestamp),
          ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
          expect(comments).toHaveLength(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});
