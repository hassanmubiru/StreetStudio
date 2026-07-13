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
  POST_COMMENT_PERMISSION,
  type CommentStore,
  type MentionNotifier,
} from "./comment.js";

/**
 * Property 33: Comment permission is enforced.
 *
 * Feature: streetstudio, Property 33: Comment permission is enforced
 *
 * Validates: Requirements 11.7
 *
 * For any Member, posting a comment or a reply on a Video succeeds and stores
 * the comment IF AND ONLY IF the Member holds comment permission in the Video's
 * owning Organization (R11.7). A Member lacking comment permission who attempts
 * to post a comment or reply is denied with an `AUTHORIZATION_DENIED`
 * authorization error and no comment is stored; a Member with comment
 * permission succeeds and the comment is persisted. Body and timestamp are held
 * valid throughout so the permission gate is the only thing under test.
 */

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

const ORG: Uuid = "11111111-1111-1111-1111-111111111111";
const VIDEO: Uuid = "22222222-2222-2222-2222-222222222222";

/**
 * An in-memory {@link CommentStore} backed by a single Video owned by the fixed
 * Organization. Inserted comments are resolvable by id so a reply can nest under
 * a previously-seeded parent, and the Video resolves the owning-Organization
 * scope used for authorization (R11.7).
 */
function makeStore(): { store: CommentStore; comments: CommentRecord[] } {
  const comments: CommentRecord[] = [];
  const vid: VideoRecord = {
    id: VIDEO,
    organizationId: ORG,
    folderId: null,
    title: "demo",
    durationSeconds: 100,
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

/**
 * An {@link AccessControl} whose {@link AccessControl.can} grants
 * {@link POST_COMMENT_PERMISSION}, in the Video's owning Organization scope,
 * only to Members in `permitted`; every other Member (or action) is denied.
 * This isolates the permission gate under test (R11.7) rather than a blanket
 * allow/deny.
 */
function accessFor(permitted: ReadonlySet<Uuid>): AccessControl {
  return {
    async can(ctx: AuthContext, action, resource) {
      return (
        action === POST_COMMENT_PERMISSION &&
        resource.organizationId === ORG &&
        permitted.has(ctx.memberId)
      );
    },
    async assignRole() {
      throw new Error("not used");
    },
  };
}

const noNotifier: MentionNotifier = {
  async notifyMention() {
    throw new Error("not used");
  },
};

/** Deterministic, unique UUID generator so each stored comment has a distinct id. */
function sequentialIds(): () => Uuid {
  let n = 0;
  return () => {
    n += 1;
    return `00000000-0000-0000-0000-${n.toString().padStart(12, "0")}` as Uuid;
  };
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

/** A member id from a small pool so permitted/denied sets overlap meaningfully. */
const memberArb: fc.Arbitrary<Uuid> = fc.constantFrom(
  "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  "cccccccc-cccc-cccc-cccc-cccccccccccc",
  "dddddddd-dddd-dddd-dddd-dddddddddddd",
) as fc.Arbitrary<Uuid>;

/** A guaranteed-valid comment body (1..5000 chars) so only the gate matters. */
const validBodyArb: fc.Arbitrary<string> = fc.string({
  minLength: 1,
  maxLength: 200,
});

/* -------------------------------------------------------------------------
 * Property 33
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 33: Comment permission is enforced", () => {
  it("post stores a comment iff the author holds comment permission, else denies with AUTHORIZATION_DENIED and stores nothing (R11.7)", async () => {
    await fc.assert(
      fc.asyncProperty(
        memberArb,
        fc.boolean(),
        validBodyArb,
        async (memberId, hasPermission, body) => {
          const { store, comments } = makeStore();
          const permitted = hasPermission
            ? new Set<Uuid>([memberId])
            : new Set<Uuid>();
          const service = new CommentService({
            store,
            access: accessFor(permitted),
            notifier: noNotifier,
            newId: sequentialIds(),
          });
          const actor: AuthContext = { memberId };

          if (hasPermission) {
            const dto = await service.post(actor, VIDEO, body);
            expect(comments).toHaveLength(1);
            expect(dto.authorId).toBe(memberId);
            expect(dto.videoId).toBe(VIDEO);
            expect(dto.body).toBe(body);
          } else {
            await expect(service.post(actor, VIDEO, body)).rejects.toMatchObject(
              { code: "AUTHORIZATION_DENIED" },
            );
            await expect(
              service.post(actor, VIDEO, body),
            ).rejects.toBeInstanceOf(AppError);
            // Denied: no comment is stored (R11.7).
            expect(comments).toHaveLength(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("reply stores a reply iff the author holds comment permission, else denies with AUTHORIZATION_DENIED and stores nothing (R11.7)", async () => {
    await fc.assert(
      fc.asyncProperty(
        memberArb,
        fc.boolean(),
        validBodyArb,
        async (memberId, hasPermission, body) => {
          const { store, comments } = makeStore();
          // A privileged author (distinct from the pool) seeds the parent comment
          // so the reply gate is exercised independently of the seed.
          const seeder: Uuid = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee" as Uuid;
          const permitted = new Set<Uuid>([seeder]);
          if (hasPermission) {
            permitted.add(memberId);
          }
          const service = new CommentService({
            store,
            access: accessFor(permitted),
            notifier: noNotifier,
            newId: sequentialIds(),
          });

          const parent = await service.post(
            { memberId: seeder },
            VIDEO,
            "parent comment",
          );
          expect(comments).toHaveLength(1);

          const actor: AuthContext = { memberId };
          if (hasPermission) {
            const reply = await service.reply(actor, parent.id, body);
            expect(comments).toHaveLength(2);
            expect(reply.parentCommentId).toBe(parent.id);
            expect(reply.authorId).toBe(memberId);
            expect(reply.body).toBe(body);
          } else {
            await expect(
              service.reply(actor, parent.id, body),
            ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
            // Denied: only the seeded parent remains (R11.7).
            expect(comments).toHaveLength(1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
