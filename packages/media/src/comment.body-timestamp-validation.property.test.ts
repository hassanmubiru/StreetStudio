import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { ReactionTargetType, Uuid } from "@streetstudio/shared";
import type {
  CommentRecord,
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
} from "./comment.js";

/**
 * Property 32: Comment creation validates body and timestamp.
 *
 * Feature: streetstudio, Property 32: Comment creation validates body and timestamp
 *
 * Validates: Requirements 11.1, 11.2, 11.3, 11.8, 11.9
 *
 * For any comment or reply, creation succeeds and is stored — nested under its
 * parent for replies (R11.3), associated with the given playback position when
 * a timestamp is supplied (R11.2) — IF AND ONLY IF the body length is between 1
 * and 5000 characters (R11.1, R11.8) and any supplied timestamp is between 0 and
 * the Video's duration inclusive (R11.9); otherwise no comment is stored. An
 * empty or over-length body, or a negative / over-duration timestamp, is
 * rejected with `VALIDATION_FAILED` and stores nothing (R11.8, R11.9).
 */

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

const ORG: Uuid = "11111111-1111-1111-1111-111111111111";
const VIDEO: Uuid = "22222222-2222-2222-2222-222222222222";
const MEMBER: Uuid = "33333333-3333-3333-3333-333333333333";

const actor: AuthContext = { memberId: MEMBER };

/** An {@link AccessControl} that grants everything; the gate is not under test here (R11.7 is Property 33). */
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

interface Fakes {
  store: CommentStore;
  comments: CommentRecord[];
}

/**
 * An in-memory {@link CommentStore} backed by a single Video of the given
 * `durationSeconds`. Inserted comments are resolvable by id (so replies can
 * nest under previously-created comments), and the fixed Video resolves the
 * duration used to validate timestamps.
 */
function makeStore(durationSeconds: number): Fakes {
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

  const store: CommentStore = {
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
      /* unused here */
    },
  };
  return { store, comments };
}

/** Deterministic, unique UUID generator so each stored comment has a distinct id. */
function sequentialIds(): () => Uuid {
  let n = 0;
  return () => {
    n += 1;
    return `00000000-0000-0000-0000-${n.toString().padStart(12, "0")}` as Uuid;
  };
}

function serviceWith(fakes: Fakes): CommentService {
  return new CommentService({
    store: fakes.store,
    access: allowAll,
    notifier: noNotifier,
    newId: sequentialIds(),
  });
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

/**
 * A body that is either valid (1..5000 chars) or invalid (empty, or one
 * character over the limit through a large over-length run).
 */
const bodyArb: fc.Arbitrary<string> = fc.oneof(
  // Valid: 1..5000 characters.
  fc.string({ minLength: COMMENT_BODY_MIN_LENGTH, maxLength: COMMENT_BODY_MAX_LENGTH }),
  // Invalid: empty.
  fc.constant(""),
  // Invalid: over the maximum length.
  fc
    .integer({ min: COMMENT_BODY_MAX_LENGTH + 1, max: COMMENT_BODY_MAX_LENGTH + 200 })
    .map((len) => "x".repeat(len)),
);

/** A body guaranteed valid (1..5000 chars) — used where only the timestamp varies. */
const validBodyArb: fc.Arbitrary<string> = fc.string({
  minLength: COMMENT_BODY_MIN_LENGTH,
  maxLength: COMMENT_BODY_MAX_LENGTH,
});

/**
 * A scenario pairing a Video duration with a candidate timestamp spanning the
 * valid range `[0, duration]`, its boundaries, and invalid values (negative and
 * over-duration), plus the "no timestamp supplied" case.
 */
const postScenarioArb = fc
  .integer({ min: 1, max: 100_000 })
  .chain((durationSeconds) =>
    fc.record({
      durationSeconds: fc.constant(durationSeconds),
      body: bodyArb,
      timestamp: fc.oneof(
        fc.constant<number | undefined>(undefined),
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

function isValidTimestamp(timestamp: number | undefined, duration: number): boolean {
  return timestamp === undefined || (timestamp >= 0 && timestamp <= duration);
}

/* -------------------------------------------------------------------------
 * Property 32
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 32: Comment creation validates body and timestamp", () => {
  it("post stores a comment iff body is 1..5000 chars and any timestamp is 0..duration (R11.1, R11.2, R11.8, R11.9)", async () => {
    await fc.assert(
      fc.asyncProperty(postScenarioArb, async ({ durationSeconds, body, timestamp }) => {
        const fakes = makeStore(durationSeconds);
        const service = serviceWith(fakes);

        const shouldSucceed =
          isValidBody(body) && isValidTimestamp(timestamp, durationSeconds);

        if (shouldSucceed) {
          const dto = await service.post(actor, VIDEO, body, timestamp);

          // Exactly one comment is stored, associated with the Video (R11.1).
          expect(fakes.comments).toHaveLength(1);
          expect(dto.videoId).toBe(VIDEO);
          expect(dto.body).toBe(body);
          expect(dto.authorId).toBe(MEMBER);
          // Top-level: not nested under any parent.
          expect(dto.parentCommentId).toBeUndefined();
          expect(fakes.comments[0]?.parentCommentId).toBeNull();

          if (timestamp === undefined) {
            expect(dto.timestampSeconds).toBeUndefined();
            expect(fakes.comments[0]?.timestampSeconds).toBeNull();
          } else {
            // A supplied in-range timestamp anchors the comment (R11.2).
            expect(dto.timestampSeconds).toBe(timestamp);
            expect(fakes.comments[0]?.timestampSeconds).toBe(timestamp);
          }
        } else {
          // Invalid body (R11.8) or timestamp (R11.9): rejected, nothing stored.
          await expect(service.post(actor, VIDEO, body, timestamp)).rejects.toBeInstanceOf(
            AppError,
          );
          await expect(
            service.post(actor, VIDEO, body, timestamp),
          ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
          expect(fakes.comments).toHaveLength(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("reply stores a reply nested under its parent iff the body is 1..5000 chars (R11.3, R11.8)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100_000 }),
        bodyArb,
        async (durationSeconds, body) => {
          const fakes = makeStore(durationSeconds);
          const service = serviceWith(fakes);

          // Seed a valid top-level parent comment to reply to.
          const parent = await service.post(actor, VIDEO, "parent comment");
          expect(fakes.comments).toHaveLength(1);

          if (isValidBody(body)) {
            const reply = await service.reply(actor, parent.id, body);

            expect(fakes.comments).toHaveLength(2);
            // The reply is nested under its parent's thread (R11.3).
            expect(reply.parentCommentId).toBe(parent.id);
            expect(reply.videoId).toBe(parent.videoId);
            expect(reply.body).toBe(body);
            expect(fakes.comments[1]?.parentCommentId).toBe(parent.id);
          } else {
            await expect(service.reply(actor, parent.id, body)).rejects.toMatchObject({
              code: "VALIDATION_FAILED",
            });
            // Only the seeded parent remains; the reply stored nothing (R11.8).
            expect(fakes.comments).toHaveLength(1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("nested replies attach under their immediate parent at each level (R11.3)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(validBodyArb, { minLength: 1, maxLength: 8 }),
        async (bodies) => {
          const fakes = makeStore(100);
          const service = serviceWith(fakes);

          // Root comment, then a chain of replies each nested under the prior one.
          let parentId = (await service.post(actor, VIDEO, "root")).id;
          for (const body of bodies) {
            const reply = await service.reply(actor, parentId, body);
            expect(reply.parentCommentId).toBe(parentId);
            expect(reply.videoId).toBe(VIDEO);
            parentId = reply.id;
          }

          expect(fakes.comments).toHaveLength(bodies.length + 1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
