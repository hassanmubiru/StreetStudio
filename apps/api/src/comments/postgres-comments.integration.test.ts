import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { newUuid } from "@streetstudio/database";
import { PgPool } from "streetjs";
import { AppError } from "@streetstudio/shared";
import type { AccessControl, AuthContext } from "@streetstudio/auth";
import type { MentionNotifier } from "@streetstudio/comments";
import {
  assemblePostgresRepositories,
  ensureCanonicalSchema,
} from "../persistence/postgres-database.js";
import { assemblePostgresComments } from "./postgres-comments.js";

/**
 * Store-of-record repoint (ADR-0021, step 3): the real `CommentService` running
 * on the **canonical repository layer** (canonical singular, FK-constrained
 * `comment`/`reaction`/`video` tables) rather than the standalone direct-`PgPool`
 * adapter. Comments/reactions FK the `video` (which FKs `organization`) and the
 * author `member`, so the test seeds that object graph. Runs when
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

suite("CommentService on the canonical repository layer", () => {
  let pool: PgPool;
  const org = newUuid();
  const author = newUuid();
  const videoId = newUuid();
  const actor: AuthContext = { memberId: author };
  const DURATION = 120;
  const notifier: MentionNotifier = { async notifyMention(): Promise<void> {} };

  const iso = () => new Date().toISOString();

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureCanonicalSchema(pool);

    // Seed the FK object graph: organization -> video, plus the author member.
    await pool.query(
      `INSERT INTO organization (id, name, settings, created_at) VALUES ($1, $2, $3::jsonb, $4)`,
      [org, "Acme", JSON.stringify({}), iso()],
    );
    await pool.query(
      `INSERT INTO member (id, email, password_hash, created_at) VALUES ($1, $2, NULL, $3)`,
      [author, `author-${author}@example.com`, iso()],
    );
    await pool.query(
      `INSERT INTO video (id, organization_id, folder_id, title, duration_seconds, status, source_object_key, developer_mode, created_at)
       VALUES ($1, $2, NULL, $3, $4, 'ready', NULL, false, $5)`,
      [videoId, org, "Demo", DURATION, iso()],
    );
  });

  afterAll(async () => {
    if (pool) {
      // Deleting the organization cascades the video; deleting the video cascades
      // its comments/reactions. Remove the author member last.
      await pool.query(`DELETE FROM organization WHERE id = $1`, [org]).catch(() => {});
      await pool.query(`DELETE FROM member WHERE id = $1`, [author]).catch(() => {});
      await pool.close();
    }
  });

  it("posts, replies, validates, and keeps reactions idempotent on the canonical tables", async () => {
    const repos = assemblePostgresRepositories(pool);
    const svc = assemblePostgresComments(pool, allowAll, notifier);

    // Post a valid comment with a timestamp (R11.1, R11.2), persisted in `comment`.
    const dto = await svc.post(actor, videoId, "Great walkthrough", 42);
    expect(dto.videoId).toBe(videoId);
    const persisted = await repos.comments.findById(dto.id);
    expect(persisted?.body).toBe("Great walkthrough");
    expect(persisted?.timestampSeconds).toBe(42);

    // Reply nests under the parent (R11.3).
    const reply = await svc.reply(actor, dto.id, "Agreed");
    expect((await repos.comments.findById(reply.id))?.parentCommentId).toBe(dto.id);

    // Validation rejects empty/over-long bodies and out-of-range timestamps.
    await expect(svc.post(actor, videoId, "")).rejects.toBeInstanceOf(AppError);
    await expect(svc.post(actor, videoId, "x".repeat(5001))).rejects.toBeInstanceOf(AppError);
    await expect(svc.post(actor, videoId, "late", DURATION + 1)).rejects.toBeInstanceOf(AppError);

    // Reacting twice retains exactly one reaction per type/member/target (R11.5).
    await svc.react(actor, { type: "video", id: videoId }, "thumbs_up");
    await svc.react(actor, { type: "video", id: videoId }, "thumbs_up");
    const reactions = await repos.reactions.listByTarget("video", videoId);
    const mine = reactions.filter((r) => r.memberId === author && r.type === "thumbs_up");
    expect(mine).toHaveLength(1);
  });
});
