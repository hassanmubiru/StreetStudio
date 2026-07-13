import { describe, it, expect } from "vitest";
import { AppError } from "@streetstudio/shared";
import type { ReactionTargetType, Uuid } from "@streetstudio/shared";
import type {
  CommentRecord,
  ReactionRecord,
  VideoRecord,
} from "@streetstudio/database";
import type { AccessControl, AuthContext } from "@streetstudio/auth";
import { systemClock } from "@streetstudio/auth";
import {
  CommentService,
  COMMENT_BODY_MAX_LENGTH,
  POST_COMMENT_PERMISSION,
  type CommentStore,
  type MentionNotifier,
  type ReactionTarget,
} from "./comment.js";
import { VIEW_VIDEO_PERMISSION } from "./playback.js";

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

const ORG: Uuid = "11111111-1111-1111-1111-111111111111";
const VIDEO: Uuid = "22222222-2222-2222-2222-222222222222";
const MEMBER: Uuid = "33333333-3333-3333-3333-333333333333";
const OTHER_MEMBER: Uuid = "44444444-4444-4444-4444-444444444444";
const PARENT: Uuid = "55555555-5555-5555-5555-555555555555";

const actor: AuthContext = { memberId: MEMBER };

function video(overrides: Partial<VideoRecord> = {}): VideoRecord {
  return {
    id: VIDEO,
    organizationId: ORG,
    folderId: null,
    title: "demo",
    durationSeconds: 100,
    status: "ready",
    sourceObjectKey: "src/demo.mp4",
    developerMode: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

interface Fakes {
  store: CommentStore;
  comments: CommentRecord[];
  reactions: ReactionRecord[];
  notified: Array<{ member: Uuid; comment: Uuid }>;
}

function makeStore(
  opts: {
    video?: VideoRecord | null;
    parent?: CommentRecord | null;
    reactions?: ReactionRecord[];
  } = {},
): Fakes {
  const comments: CommentRecord[] = [];
  const reactions: ReactionRecord[] = [...(opts.reactions ?? [])];
  const notified: Array<{ member: Uuid; comment: Uuid }> = [];
  const vid = opts.video === undefined ? video() : opts.video;
  const parent = opts.parent ?? null;

  const store: CommentStore = {
    async insertComment(record) {
      comments.push(record);
      return record;
    },
    async findComment(id) {
      if (parent && id === parent.id) return parent;
      return comments.find((c) => c.id === id) ?? null;
    },
    async findVideo(videoId) {
      return vid && vid.id === videoId ? vid : null;
    },
    async listReactions(targetType, targetId) {
      return reactions.filter(
        (r) => r.targetType === targetType && r.targetId === targetId,
      );
    },
    async insertReaction(record) {
      reactions.push(record);
    },
  };
  return { store, comments, reactions, notified };
}

function access(granted: (action: string, memberId: Uuid) => boolean): AccessControl {
  return {
    async can(ctx: AuthContext, action: string) {
      return granted(action, ctx.memberId);
    },
    async assignRole() {
      throw new Error("not used");
    },
  };
}

function notifierInto(sink: Array<{ member: Uuid; comment: Uuid }>): MentionNotifier {
  return {
    async notifyMention(mentionedMemberId, commentId) {
      sink.push({ member: mentionedMemberId, comment: commentId });
    },
  };
}

const allowAll = access(() => true);
const denyAll = access(() => false);
const noNotifier: MentionNotifier = {
  async notifyMention() {
    throw new Error("not used");
  },
};

/* -------------------------------------------------------------------------
 * post — R11.1, R11.2, R11.7, R11.8, R11.9
 * ---------------------------------------------------------------------- */

describe("CommentService.post", () => {
  it("stores a comment with a valid body and returns it", async () => {
    const fakes = makeStore();
    const service = new CommentService({
      store: fakes.store,
      access: allowAll,
      notifier: noNotifier,
    });

    const dto = await service.post(actor, VIDEO, "looks good");

    expect(dto.videoId).toBe(VIDEO);
    expect(dto.authorId).toBe(MEMBER);
    expect(dto.body).toBe("looks good");
    expect(dto.parentCommentId).toBeUndefined();
    expect(dto.timestampSeconds).toBeUndefined();
    expect(fakes.comments).toHaveLength(1);
  });

  it("anchors a comment to a supplied in-range timestamp", async () => {
    const fakes = makeStore();
    const service = new CommentService({
      store: fakes.store,
      access: allowAll,
      notifier: noNotifier,
    });

    const dto = await service.post(actor, VIDEO, "at the boundary", 100);
    expect(dto.timestampSeconds).toBe(100);
    expect(fakes.comments[0]?.timestampSeconds).toBe(100);
  });

  it("rejects an empty body without storing (R11.8)", async () => {
    const fakes = makeStore();
    const service = new CommentService({
      store: fakes.store,
      access: allowAll,
      notifier: noNotifier,
    });

    await expect(service.post(actor, VIDEO, "")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(fakes.comments).toHaveLength(0);
  });

  it("rejects a body exceeding the max length without storing (R11.8)", async () => {
    const fakes = makeStore();
    const service = new CommentService({
      store: fakes.store,
      access: allowAll,
      notifier: noNotifier,
    });

    const tooLong = "x".repeat(COMMENT_BODY_MAX_LENGTH + 1);
    await expect(service.post(actor, VIDEO, tooLong)).rejects.toBeInstanceOf(AppError);
    expect(fakes.comments).toHaveLength(0);
  });

  it("rejects a negative or over-duration timestamp without storing (R11.9)", async () => {
    const fakes = makeStore();
    const service = new CommentService({
      store: fakes.store,
      access: allowAll,
      notifier: noNotifier,
    });

    await expect(service.post(actor, VIDEO, "hi", -1)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(service.post(actor, VIDEO, "hi", 101)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(fakes.comments).toHaveLength(0);
  });

  it("denies posting without comment permission and stores nothing (R11.7)", async () => {
    const fakes = makeStore();
    const service = new CommentService({
      store: fakes.store,
      access: denyAll,
      notifier: noNotifier,
    });

    await expect(service.post(actor, VIDEO, "hi")).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    expect(fakes.comments).toHaveLength(0);
  });

  it("raises NOT_FOUND for an unknown video", async () => {
    const fakes = makeStore({ video: null });
    const service = new CommentService({
      store: fakes.store,
      access: allowAll,
      notifier: noNotifier,
    });

    await expect(service.post(actor, VIDEO, "hi")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

/* -------------------------------------------------------------------------
 * reply — R11.3, R11.7, R11.8
 * ---------------------------------------------------------------------- */

describe("CommentService.reply", () => {
  const parent: CommentRecord = {
    id: PARENT,
    videoId: VIDEO,
    parentCommentId: null,
    authorId: OTHER_MEMBER,
    body: "parent",
    timestampSeconds: null,
    createdAt: "2024-01-01T00:00:00.000Z",
  };

  it("nests a reply under its parent (R11.3)", async () => {
    const fakes = makeStore({ parent });
    const service = new CommentService({
      store: fakes.store,
      access: allowAll,
      notifier: noNotifier,
    });

    const dto = await service.reply(actor, PARENT, "a reply");
    expect(dto.parentCommentId).toBe(PARENT);
    expect(dto.videoId).toBe(VIDEO);
    expect(fakes.comments[0]?.parentCommentId).toBe(PARENT);
  });

  it("denies replying without comment permission and stores nothing (R11.7)", async () => {
    const fakes = makeStore({ parent });
    const service = new CommentService({
      store: fakes.store,
      access: denyAll,
      notifier: noNotifier,
    });

    await expect(service.reply(actor, PARENT, "a reply")).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    expect(fakes.comments).toHaveLength(0);
  });

  it("raises NOT_FOUND for an unknown parent", async () => {
    const fakes = makeStore({ parent: null });
    const service = new CommentService({
      store: fakes.store,
      access: allowAll,
      notifier: noNotifier,
    });

    await expect(service.reply(actor, PARENT, "a reply")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

/* -------------------------------------------------------------------------
 * react — R11.5
 * ---------------------------------------------------------------------- */

describe("CommentService.react", () => {
  const target: ReactionTarget = { type: "video" as ReactionTargetType, id: VIDEO };

  it("records a reaction on a video target", async () => {
    const fakes = makeStore();
    const service = new CommentService({
      store: fakes.store,
      access: allowAll,
      notifier: noNotifier,
    });

    await service.react(actor, target, "thumbs_up");
    expect(fakes.reactions).toHaveLength(1);
    expect(fakes.reactions[0]).toMatchObject({
      targetType: "video",
      targetId: VIDEO,
      memberId: MEMBER,
      type: "thumbs_up",
    });
  });

  it("is idempotent per type/member/target (R11.5)", async () => {
    const fakes = makeStore();
    const service = new CommentService({
      store: fakes.store,
      access: allowAll,
      notifier: noNotifier,
    });

    await service.react(actor, target, "thumbs_up");
    await service.react(actor, target, "thumbs_up");
    await service.react(actor, target, "thumbs_up");
    expect(fakes.reactions).toHaveLength(1);
  });

  it("records distinct types and distinct members separately", async () => {
    const fakes = makeStore();
    const service = new CommentService({
      store: fakes.store,
      access: allowAll,
      notifier: noNotifier,
    });

    await service.react(actor, target, "thumbs_up");
    await service.react(actor, target, "heart");
    await service.react({ memberId: OTHER_MEMBER }, target, "thumbs_up");
    expect(fakes.reactions).toHaveLength(3);
  });

  it("denies reacting without permission (R11.7)", async () => {
    const fakes = makeStore();
    const service = new CommentService({
      store: fakes.store,
      access: denyAll,
      notifier: noNotifier,
    });

    await expect(service.react(actor, target, "thumbs_up")).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    expect(fakes.reactions).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------
 * mention — R11.4
 * ---------------------------------------------------------------------- */

describe("CommentService.mention", () => {
  const comment: CommentRecord = {
    id: PARENT,
    videoId: VIDEO,
    parentCommentId: null,
    authorId: MEMBER,
    body: "hey @you",
    timestampSeconds: null,
    createdAt: "2024-01-01T00:00:00.000Z",
  };

  it("notifies a mentioned member who has view access (R11.4)", async () => {
    const fakes = makeStore({ parent: comment });
    const sink: Array<{ member: Uuid; comment: Uuid }> = [];
    const service = new CommentService({
      store: fakes.store,
      access: access((action) => action === VIEW_VIDEO_PERMISSION),
      notifier: notifierInto(sink),
    });

    await service.mention(PARENT, OTHER_MEMBER);
    expect(sink).toEqual([{ member: OTHER_MEMBER, comment: PARENT }]);
  });

  it("does not notify a mentioned member lacking view access (R11.4)", async () => {
    const fakes = makeStore({ parent: comment });
    const sink: Array<{ member: Uuid; comment: Uuid }> = [];
    const service = new CommentService({
      store: fakes.store,
      access: denyAll,
      notifier: notifierInto(sink),
    });

    await service.mention(PARENT, OTHER_MEMBER);
    expect(sink).toHaveLength(0);
  });

  it("raises NOT_FOUND for an unknown comment", async () => {
    const fakes = makeStore({ parent: null });
    const service = new CommentService({
      store: fakes.store,
      access: allowAll,
      notifier: noNotifier,
    });

    await expect(service.mention(PARENT, OTHER_MEMBER)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

/* -------------------------------------------------------------------------
 * default clock wiring
 * ---------------------------------------------------------------------- */

describe("CommentService default construction", () => {
  it("constructs with the system clock when none is injected", () => {
    const fakes = makeStore();
    const service = new CommentService({
      store: fakes.store,
      access: allowAll,
      notifier: noNotifier,
    });
    expect(service).toBeInstanceOf(CommentService);
    expect(typeof systemClock.now).toBe("function");
  });
});
