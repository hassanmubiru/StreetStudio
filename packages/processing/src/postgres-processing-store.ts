/**
 * Real PostgreSQL adapter for the {@link ProcessingStore} port, composing the
 * StreetJS `PgPool` (de-seam onto real infrastructure). Satisfies the same port
 * the in-memory/repository adapter does, so {@link MediaPipeline} runs unchanged
 * on real data — persisting the pipeline's videos, assets (thumbnail/preview),
 * and adaptive-bitrate renditions. All queries are parameterized; DDL is
 * idempotent.
 *
 * `setVideoStatus` is a real in-place `UPDATE` that preserves every other Video
 * field — notably `source_object_key`, so the original source media is retained
 * across a transition to `failed` (R8.6). The `videos` table is the shared
 * content table (idempotent DDL), reused across the content/comments/media
 * domains so they share one store of record.
 */
import { PgPool } from "streetjs";
import type {
  AssetRecord,
  RenditionRecord,
  VideoRecord,
} from "@streetstudio/database";
import type {
  AssetType,
  IsoTimestamp,
  Uuid,
  VideoStatus,
} from "@streetstudio/shared";
import type { ProcessingStore } from "./pipeline.js";

type Row = Record<string, string | null>;
const iso = (v: string): IsoTimestamp => new Date(v).toISOString() as IsoTimestamp;

export const PROCESSING_TABLES_DDL = `
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
CREATE TABLE IF NOT EXISTS assets (
  id                UUID PRIMARY KEY,
  video_id          UUID,
  folder_id         UUID,
  type              TEXT        NOT NULL,
  object_key_or_body TEXT,
  created_at        TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS assets_video_idx ON assets (video_id);
CREATE TABLE IF NOT EXISTS renditions (
  id         UUID PRIMARY KEY,
  video_id   UUID    NOT NULL,
  quality    TEXT    NOT NULL,
  object_key TEXT    NOT NULL,
  bitrate    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS renditions_video_idx ON renditions (video_id);
`;

/** Create the processing schema (shared videos + assets + renditions). */
export async function ensureProcessingSchema(pool: PgPool): Promise<void> {
  await pool.query(PROCESSING_TABLES_DDL);
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

/** A {@link ProcessingStore} backed by real PostgreSQL. */
export function postgresProcessingStore(pool: PgPool): ProcessingStore {
  return {
    async findVideo(organizationId: Uuid, videoId: Uuid): Promise<VideoRecord | null> {
      const { rows } = await pool.query(
        `SELECT * FROM videos WHERE organization_id = $1 AND id = $2`,
        [organizationId, videoId],
      );
      const row = rows[0] as Row | undefined;
      return row ? mapVideo(row) : null;
    },
    async findVideoById(videoId: Uuid): Promise<VideoRecord | null> {
      const { rows } = await pool.query(`SELECT * FROM videos WHERE id = $1`, [videoId]);
      const row = rows[0] as Row | undefined;
      return row ? mapVideo(row) : null;
    },
    async setVideoStatus(video: VideoRecord, status: VideoStatus): Promise<VideoRecord> {
      await pool.query(
        `UPDATE videos SET status = $1 WHERE organization_id = $2 AND id = $3`,
        [status, video.organizationId, video.id],
      );
      return { ...video, status };
    },
    async insertAsset(record: AssetRecord): Promise<AssetRecord> {
      await pool.query(
        `INSERT INTO assets (id, video_id, folder_id, type, object_key_or_body, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          record.id,
          record.videoId,
          record.folderId,
          record.type as AssetType,
          record.objectKeyOrBody,
          record.createdAt,
        ],
      );
      return record;
    },
    async insertRendition(record: RenditionRecord): Promise<RenditionRecord> {
      await pool.query(
        `INSERT INTO renditions (id, video_id, quality, object_key, bitrate)
         VALUES ($1, $2, $3, $4, $5)`,
        [record.id, record.videoId, record.quality, record.objectKey, record.bitrate],
      );
      return record;
    },
  };
}
