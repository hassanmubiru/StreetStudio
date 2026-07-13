import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { ReactionTargetType, Uuid } from "@streetstudio/shared";
import type {
  CommentRecord,
  ReactionRecord,
  VideoRecord,
} from "@streetstudio/database";
import type { AccessControl, AuthContext } from "@streetstudio/auth";
import {
  CommentService,
  type CommentStore,
  type MentionNotifier,
} from "./comment.js";
import { VIEW_VIDEO_PERMISSION } from "./permissions.js";

/**
 * Property 34: Mentions notify members with view access.
 *
 * Feature: streetstudio, Property 34: Mentions notify members with view access
 *
 * Validates: Requirements 11.4
 *
 * When a Member mentions another Member in a comment, a mention notification is
 * created for the mentioned Member (through the {@link MentionNotifier} seam) IF
 * AND ONLY IF that Member has view access to the comment's Video (R11.4). For an
 * arbitrary comment and an arbitrary set of mentioned Members — each with an
 * arbitrary view-access decision — the notifications produced are exactly those
 * for the mentioned Members who actually hold view access, and each such Member
 * is notified about the correct comment id. Mentioned Members without view
 * access receive no notification.
 */

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

const ORG: Uuid = "11111111-1111-1111-1111-111111111111";
const VIDEO: Uuid = "22222222-2222-2222-2222-222222222222";
const COMMENT: Uuid = "33333333-3333-3333-3333-333333333333";

/**
 * An in-memory {@link CommentStore} backed by a single comment on a single Video
 * owned by the fixed Organization. The comment resolves by id and its Video
 * resolves the owning-Organization scope in which the mentioned Member's view
 * access is evaluated (R11.4), so nothing but the view-access gate is under test.
 */
function makeStore(): CommentStore {
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
  const comment: CommentRecord = {
    id: COMMENT,
    videoId: VIDEO,
    parentCommentId: null,
    authorId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as Uuid,
    body: "seed",
    timestampSeconds: null,
    createdAt: "2024-01-01T00:00:00.000Z",
  };

  return {
    async insertComment(record) {
      return record;
    },
    async findComment(id) {
      return id === comment.id ? comment : null;
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
}

/**
 * An {@link AccessControl} whose {@link AccessControl.can} grants
 * {@link VIEW_VIDEO_PERMISSION}, in the Video's owning Organization scope, only
 * to Members in `viewers`; every other Member (or action) is denied. This
 * isolates the view-access gate that decides whether a mention notifies (R11.4).
 */
function accessFor(viewers: ReadonlySet<Uuid>): AccessControl {
  return {
    async can(ctx: AuthContext, action, resource) {
      return (
        action === VIEW_VIDEO_PERMISSION &&
        resource.organizationId === ORG &&
        viewers.has(ctx.memberId)
      );
    },
    async assignRole() {
      throw new Error("not used");
    },
  };
}

/**
 * A recording {@link MentionNotifier} that captures each (mentionedMemberId,
 * commentId) pair it is asked to notify, standing in for the notifications layer.
 */
function recordingNotifier(): {
  notifier: MentionNotifier;
  calls: { memberId: Uuid; commentId: Uuid }[];
} {
  const calls: { memberId: Uuid; commentId: Uuid }[] = [];
  const notifier: MentionNotifier = {
    async notifyMention(mentionedMemberId, commentId) {
      calls.push({ memberId: mentionedMemberId, commentId });
    },
  };
  return { notifier, calls };
}

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

// A small fixed pool of mentionable Members so view-access decisions overlap
// meaningfully across a mention sequence.
const MEMBERS: readonly Uuid[] = [
  "b0000000-0000-0000-0000-000000000001",
  "b0000000-0000-0000-0000-000000000002",
  "b0000000-0000-0000-0000-000000000003",
  "b0000000-0000-0000-0000-000000000004",
] as Uuid[];

/** One mentioned Member paired with whether they hold view access. */
const mentionArb: fc.Arbitrary<{ memberId: Uuid; canView: boolean }> =
  fc.record({
    memberId: fc.constantFrom(...MEMBERS),
    canView: fc.boolean(),
  });

/* -------------------------------------------------------------------------
 * Property 34
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 34: Mentions notify members with view access", () => {
  it("notifies exactly the mentioned members who have view access, about the mentioned comment (R11.4)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(mentionArb, { minLength: 1, maxLength: 12 }),
        async (mentions) => {
          // Decide view access per member: a member views iff any of their
          // mention entries granted it. This keeps a single coherent access
          // decision per member while covering the full grant/deny space.
          const viewers = new Set<Uuid>(
            mentions.filter((m) => m.canView).map((m) => m.memberId),
          );

          const store = makeStore();
          const { notifier, calls } = recordingNotifier();
          const service = new CommentService({
            store,
            access: accessFor(viewers),
            notifier,
          });

          for (const m of mentions) {
            await service.mention(COMMENT, m.memberId);
          }

          // Only members with view access are ever notified (R11.4).
          for (const call of calls) {
            expect(viewers.has(call.memberId)).toBe(true);
            // The notification points at the mentioned comment.
            expect(call.commentId).toBe(COMMENT);
          }

          // Every mention of a viewer produces exactly one notification; every
          // mention of a non-viewer produces none. Count expected notifications
          // as the number of mention entries targeting a member with access.
          const expectedNotified = mentions.filter((m) =>
            viewers.has(m.memberId),
          ).length;
          expect(calls).toHaveLength(expectedNotified);

          // Every mentioned member who has view access is notified at least once.
          const notifiedMembers = new Set(calls.map((c) => c.memberId));
          for (const m of mentions) {
            if (viewers.has(m.memberId)) {
              expect(notifiedMembers.has(m.memberId)).toBe(true);
            } else {
              expect(notifiedMembers.has(m.memberId)).toBe(false);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("a single mention notifies iff the mentioned member has view access (R11.4)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...MEMBERS),
        fc.boolean(),
        async (memberId, canView) => {
          const viewers = canView
            ? new Set<Uuid>([memberId])
            : new Set<Uuid>();
          const store = makeStore();
          const { notifier, calls } = recordingNotifier();
          const service = new CommentService({
            store,
            access: accessFor(viewers),
            notifier,
          });

          await service.mention(COMMENT, memberId);

          if (canView) {
            expect(calls).toEqual([{ memberId, commentId: COMMENT }]);
          } else {
            expect(calls).toHaveLength(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
