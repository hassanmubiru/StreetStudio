import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PgPool } from "streetjs";
import { AppError } from "@streetstudio/shared";
import type { AccessControl } from "@streetstudio/auth";
import type { AuthContext } from "@streetstudio/auth";
import { CommentService, type MentionNotifier } from "./comment.js";
import {
  ensureCommentsSchema,
  postgresCommentStore,
} from "./postgres-comment-store.js";

/**
 * De-seam (ADR-0020 pattern): the real {@link CommentService} running on the
 * real PostgreSQL {@link CommentStore} — comments, threads, and reactions on
 * real infrastructure (sharing the `videos` table with the other domains).
 * RBAC is exercised separately, so this isolates the comment store with an
 * allow-all access control and a capturing mention notifier. Runs when
 * `STREETSTUDIO_IT_DATABASE_URL` is set; skips otherwise.
 */
const DATABASE_URL = process.env["STREETSTUDIO_IT_DATABASE_URL"];
const suite = DATABASE_URL ? describe : describe.skip;

function poolOptions(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || "5432"),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    maxConnections: 4,
  };
}

const allowAll: AccessControl = {
  async can(): Promise<boolean> {
    return true;
  },
  async assignRole(): Promise<void> {},
};

suite("CommentService on real Postgres store", () => {
  let pool: PgPool;
  let svc: CommentService;
  const mentions: Array<{ member: string; comment: string }> = [];
  const notifier: MentionNotifier = {
    async notifyMention(mentionedMemberId, commentId): Promise<void> {
      mentions.push({ member: mentionedMemberId, comment: commentId });
    },
  };

  const actor: AuthContext = { memberId: randomUUID() };
  const org = randomUUID();
  const videoId = randomUUID();
  const DURATION = 120;

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureCommentsSchema(pool);

    // Clean any prior rows for this video/org, then seed a ready Video.
    await pool.query(`DELETE FROM reactions WHERE target_id = $1`, [videoId]).catch(() => {});
    await pool.query(`DELETE FROM comments WHERE video_id = $1`, [videoId]).catch(() => {});
    await pool.query(`DELETE FROM videos WHERE id = $1`, [videoId]).catch(() => {});
    await pool.query(
      `INSERT INTO videos (id, organization_id, folder_id, title, duration_seconds, status, source_object_key, developer_mode, created_at)
       VALUES ($1, $2, NULL, $3, $4, $5, $6, false, $7)`,
      [videoId, org, "Demo", DURATION, "ready", "uploads/demo.mp4", new Date().toISOString()],
    );

    svc = new CommentService({ store: postgresCommentStore(pool), access: allowAll, notifier });
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(`DELETE FROM reactions WHERE target_id = $1`, [videoId]).catch(() => {});
      await pool.query(`DELETE FROM comments WHERE video_id = $1`, [videoId]).catch(() => {});
      await pool.query(`DELETE FROM videos WHERE id = $1`, [videoId]).catch(() => {});
      await pool.close();
    }
  });

  it("persists a comment with a valid body and timestamp (R11.1, R11.2)", async () => {
    const dto = await svc.post(actor, videoId, "Great walkthrough", 42);
    expect(dto.videoId).toBe(videoId);
    expect(dto.body).toBe("Great walkthrough");
    expect(dto.timestampSeconds).toBe(42);

    const store = postgresCommentStore(pool);
    const persisted = await store.findComment(dto.id);
    expect(persisted?.body).toBe("Great walkthrough");
    expect(persisted?.authorId).toBe(actor.memberId);
    expect(persisted?.timestampSeconds).toBe(42);
  });

  it("nests a reply under its parent (R11.3)", async () => {
    const parent = await svc.post(actor, videoId, "Parent comment");
    const reply = await svc.reply(actor, parent.id, "Reply comment");
    expect(reply.parentCommentId).toBe(parent.id);

    const store = postgresCommentStore(pool);
    expect((await store.findComment(reply.id))?.parentCommentId).toBe(parent.id);
  });

  it("rejects an empty or over-long body without storing (R11.8)", async () => {
    await expect(svc.post(actor, videoId, "")).rejects.toBeInstanceOf(AppError);
    await expect(svc.post(actor, videoId, "x".repeat(5001))).rejects.toBeInstanceOf(AppError);
  });

  it("rejects a timestamp outside [0, duration] without storing (R11.9)", async () => {
    await expect(svc.post(actor, videoId, "too early", -1)).rejects.toBeInstanceOf(AppError);
    await expect(svc.post(actor, videoId, "too late", DURATION + 1)).rejects.toBeInstanceOf(AppError);
  });

  it("retains at most one reaction of each type per member per target (R11.5)", async () => {
    await svc.react(actor, { type: "video", id: videoId }, "thumbs_up");
    await svc.react(actor, { type: "video", id: videoId }, "thumbs_up");

    const store = postgresCommentStore(pool);
    const reactions = await store.listReactions("video", videoId);
    const mine = reactions.filter((r) => r.memberId === actor.memberId && r.type === "thumbs_up");
    expect(mine).toHaveLength(1);
  });
});
