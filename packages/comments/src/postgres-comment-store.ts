/**
 * Real PostgreSQL adapter for the {@link CommentStore} port, composing the
 * StreetJS `PgPool` (de-seam onto real infrastructure). Satisfies the same port
 * the in-memory/repository adapter does, so {@link CommentService} runs
 * unchanged on real data. All queries are parameterized; DDL is idempotent.
 *
 * The reaction table's composite primary key (`target_type`, `target_id`,
 * `member_id`, `type`) enforces at-most-one reaction of each type per member per
 * target at the storage boundary (R11.5); `insertReaction` is `ON CONFLICT DO
 * NOTHING`. The `videos` table is the shared content table (idempotent DDL).
 */
import { PgPool } from "streetjs";
import type { CommentRecord, ReactionRecord, VideoRecord } from "@streetstudio/database";
import type { IsoTimestamp, ReactionTargetType, Uuid, VideoStatus } from "@streetstudio/shared";
import type { CommentStore } from "./comment.js";

type Row = Record<string, string | null>;
const iso = (v: string): IsoTimestamp => new Date(v).toISOString() as IsoTimestamp;

export const COMMENTS_TABLES_DDL = `
CREATE TABLE IF NOT EXISTS comments (
  id                UUID PRIMARY KEY,
  video_id          UUID        NOT NULL,
  parent_comment_id UUID,
  author_id         UUID        NOT NULL,
  body              TEXT        NOT NULL,
  timestamp_seconds DOUBLE PRECISION,
  created_at        TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_video_idx ON comments (video_id);
CREATE TABLE IF NOT EXISTS reactions (
  target_type TEXT NOT NULL,
  target_id   UUID NOT NULL,
  member_id   UUID NOT NULL,
  type        TEXT NOT NULL,
  PRIMARY KEY (target_type, target_id, member_id, type)
);
CREATE TABLE IF NOT EXISTS videos (
  id                UUID PRIMARY KEY,
  organization_id   UUID        NOT NULL,
  folder_id         UUID,
  title             TEXT        NOT NULL,
  duration_seconds  INTEGER     NOT NULL DEFAULT 0,
  status            TEXT        NOT NULL,
  source_object_key TEXT,
  developer_mode    BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL
);
`;

/** Create the comments schema (comments, reactions, + shared videos). */
export async function ensureCommentsSchema(pool: PgPool): Promise<void> {
  await pool.query(COMMENTS_TABLES_DDL);
}

function mapComment(row: Row): CommentRecord {
  return {
    id: row["id"] as Uuid,
    videoId: row["video_id"] as Uuid,
    parentCommentId: (row["parent_comment_id"] as Uuid | null) ?? null,
    authorId: row["author_id"] as Uuid,
    body: row["body"] as string,
    timestampSeconds: row["timestamp_seconds"] === null ? null : Number(row["timestamp_seconds"]),
    createdAt: iso(row["created_at"] as string),
  };
}

function mapVideo(row: Row): VideoRecord {
  return {
    id: row["id"] as Uuid,
    organizationId: row["organization_id"] as Uuid,
    folderId: (row["folder_id"] as Uuid | null) ?? null,
    title: row["title"] as string,
    durationSeconds: Number(row["duration_seconds"]),
    status: row["status"] as VideoStatus,
    sourceObjectKey: (row["source_object_key"] as string | null) ?? null,
    developerMode: row["developer_mode"] === "t" || row["developer_mode"] === "true",
    createdAt: iso(row["created_at"] as string),
  };
}

/** A {@link CommentStore} backed by real PostgreSQL. */
export function postgresCommentStore(pool: PgPool): CommentStore {
  return {
    async insertComment(record) {
      await pool.query(
        `INSERT INTO comments (id, video_id, parent_comment_id, author_id, body, timestamp_seconds, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          record.id,
          record.videoId,
          record.parentCommentId,
          record.authorId,
          record.body,
          record.timestampSeconds,
          record.createdAt,
        ],
      );
      return record;
    },
    async findComment(id) {
      const { rows } = await pool.query(`SELECT * FROM comments WHERE id = $1`, [id]);
      const row = rows[0] as Row | undefined;
      return row ? mapComment(row) : null;
    },
    async findVideo(videoId) {
      const { rows } = await pool.query(`SELECT * FROM videos WHERE id = $1`, [videoId]);
      const row = rows[0] as Row | undefined;
      return row ? mapVideo(row) : null;
    },
    async listReactions(targetType: ReactionTargetType, targetId: Uuid): Promise<ReactionRecord[]> {
      const { rows } = await pool.query(
        `SELECT * FROM reactions WHERE target_type = $1 AND target_id = $2`,
        [targetType, targetId],
      );
      return (rows as Row[]).map((r) => ({
        targetType: r["target_type"] as ReactionTargetType,
        targetId: r["target_id"] as Uuid,
        memberId: r["member_id"] as Uuid,
        type: r["type"] as string,
      }));
    },
    async insertReaction(record) {
      await pool.query(
        `INSERT INTO reactions (target_type, target_id, member_id, type) VALUES ($1, $2, $3, $4)
         ON CONFLICT (target_type, target_id, member_id, type) DO NOTHING`,
        [record.targetType, record.targetId, record.memberId, record.type],
      );
    },
  };
}
