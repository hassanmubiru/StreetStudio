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
  type ReactionTarget,
} from "./comment.js";

/**
 * Property 35: Reactions are idempotent per type, member, and target.
 *
 * Feature: streetstudio, Property 35: Reactions are idempotent per type, member, and target
 *
 * Validates: Requirements 11.5
 *
 * For any target and Member, adding the same reaction type any number of times
 * results in at most one recorded reaction of that type for that Member on that
 * target (R11.5). Applying an arbitrary sequence of (member, target, type)
 * reactions therefore leaves the store holding exactly the SET of distinct
 * (targetType, targetId, memberId, type) keys that appeared in the sequence:
 * repeats add nothing, while distinct types / members / targets are tracked
 * independently.
 */

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

const ORG: Uuid = "11111111-1111-1111-1111-111111111111";

/**
 * An in-memory {@link CommentStore} whose reaction storage carries no uniqueness
 * constraint of its own, so the service's idempotency logic (R11.5) is what is
 * actually exercised. Every Video/comment id resolves to a record in the fixed
 * Organization, so target resolution never masks the property under test.
 */
class InMemoryCommentStore implements CommentStore {
  readonly reactions: ReactionRecord[] = [];

  async insertComment(record: CommentRecord): Promise<CommentRecord> {
    return record;
  }

  async findComment(id: Uuid): Promise<CommentRecord | null> {
    // Any comment id resolves; it points at a Video in the fixed Organization.
    return {
      id,
      videoId: id,
      parentCommentId: null,
      authorId: ORG,
      body: "seed",
      timestampSeconds: null,
      createdAt: "2024-01-01T00:00:00.000Z",
    };
  }

  async findVideo(videoId: Uuid): Promise<VideoRecord | null> {
    // Any video id resolves to a Video owned by the fixed Organization.
    return {
      id: videoId,
      organizationId: ORG,
      folderId: null,
      title: "demo",
      durationSeconds: 100,
      status: "ready",
      sourceObjectKey: "src/demo.mp4",
      developerMode: false,
      createdAt: "2024-01-01T00:00:00.000Z",
    };
  }

  async listReactions(
    targetType: ReactionTargetType,
    targetId: Uuid,
  ): Promise<ReactionRecord[]> {
    return this.reactions.filter(
      (r) => r.targetType === targetType && r.targetId === targetId,
    );
  }

  async insertReaction(record: ReactionRecord): Promise<void> {
    this.reactions.push(record);
  }
}

/** An {@link AccessControl} that grants everything; the gate is not under test here. */
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

/* -------------------------------------------------------------------------
 * Generators
 * ---------------------------------------------------------------------- */

// Small fixed pools so an arbitrary op sequence collides on the same
// (member, target, type) keys frequently, meaningfully exercising idempotency.
const MEMBERS: readonly Uuid[] = [
  "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  "cccccccc-cccc-cccc-cccc-cccccccccccc",
] as Uuid[];

const TARGETS: readonly ReactionTarget[] = [
  { type: "video" as ReactionTargetType, id: "d0000000-0000-0000-0000-000000000001" as Uuid },
  { type: "video" as ReactionTargetType, id: "d0000000-0000-0000-0000-000000000002" as Uuid },
  { type: "comment" as ReactionTargetType, id: "e0000000-0000-0000-0000-000000000001" as Uuid },
];

const TYPES: readonly string[] = ["thumbs_up", "heart", "laugh"];

interface Op {
  readonly memberId: Uuid;
  readonly target: ReactionTarget;
  readonly type: string;
}

const opArb: fc.Arbitrary<Op> = fc.record({
  memberId: fc.constantFrom(...MEMBERS),
  target: fc.constantFrom(...TARGETS),
  type: fc.constantFrom(...TYPES),
});

/** The idempotency key a stored reaction is deduplicated by (R11.5). */
function keyOf(r: {
  targetType: ReactionTargetType;
  targetId: Uuid;
  memberId: Uuid;
  type: string;
}): string {
  return `${r.targetType}\u0000${r.targetId}\u0000${r.memberId}\u0000${r.type}`;
}

/* -------------------------------------------------------------------------
 * Property 35
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 35: Reactions are idempotent per type, member, and target", () => {
  it("records exactly the set of distinct (type, member, target) reactions regardless of repeats or ordering", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(opArb, { minLength: 1, maxLength: 40 }),
        async (ops) => {
          const store = new InMemoryCommentStore();
          const service = new CommentService({
            store,
            access: allowAll,
            notifier: noNotifier,
          });

          for (const op of ops) {
            await service.react({ memberId: op.memberId }, op.target, op.type);
          }

          // Expected set of distinct idempotency keys across all applied ops.
          const expectedKeys = new Set(
            ops.map((op) =>
              keyOf({
                targetType: op.target.type,
                targetId: op.target.id,
                memberId: op.memberId,
                type: op.type,
              }),
            ),
          );

          const storedKeys = store.reactions.map(keyOf);

          // No duplicates: at most one reaction per (type, member, target).
          expect(new Set(storedKeys).size).toBe(storedKeys.length);
          // Exactly the distinct keys are recorded — repeats add nothing while
          // distinct types / members / targets are tracked independently.
          expect(new Set(storedKeys)).toEqual(expectedKeys);
          expect(store.reactions.length).toBe(expectedKeys.size);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("repeatedly adding the same (member, target, type) reaction is idempotent", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...MEMBERS),
        fc.constantFrom(...TARGETS),
        fc.constantFrom(...TYPES),
        fc.integer({ min: 1, max: 20 }),
        async (memberId, target, type, repeats) => {
          const store = new InMemoryCommentStore();
          const service = new CommentService({
            store,
            access: allowAll,
            notifier: noNotifier,
          });

          for (let i = 0; i < repeats; i++) {
            await service.react({ memberId } as AuthContext, target, type);
          }

          expect(store.reactions).toHaveLength(1);
          expect(store.reactions[0]).toMatchObject({
            targetType: target.type,
            targetId: target.id,
            memberId,
            type,
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});
