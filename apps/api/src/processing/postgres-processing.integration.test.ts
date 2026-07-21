import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { newUuid } from "@streetstudio/database";
import { PgPool } from "streetjs";
import type {
  ProcessingJob,
  ProcessingQueue,
  ProcessingStatusEmitter,
  ProcessingStatusEvent,
  TranscodeOutput,
  Transcoder,
} from "@streetstudio/processing";
import {
  assemblePostgresRepositories,
  ensureCanonicalSchema,
} from "../persistence/postgres-database.js";
import { assemblePostgresMediaPipeline } from "./postgres-processing.js";

/**
 * Store-of-record repoint (ADR-0021, step 3): the real `MediaPipeline` running
 * on the **canonical repository layer** (canonical singular, FK-constrained
 * `video`/`asset`/`rendition` tables) rather than the standalone direct-`PgPool`
 * adapter. Critically exercises the in-place status update: a successful run
 * transitions the video to `ready` WITHOUT cascade-deleting the just-persisted
 * assets/renditions. Runs when `STREETSTUDIO_IT_DATABASE_URL` is set; skips
 * otherwise.
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

function recordingQueue(): ProcessingQueue & { jobs: ProcessingJob[] } {
  const jobs: ProcessingJob[] = [];
  return { jobs, enqueue: (job) => void jobs.push(job) };
}
function recordingEmitter(): ProcessingStatusEmitter & { events: ProcessingStatusEvent[] } {
  const events: ProcessingStatusEvent[] = [];
  return { events, emit: (e) => void events.push(e) };
}
const goodTranscoder: Transcoder = {
  async transcode(): Promise<TranscodeOutput> {
    return {
      thumbnail: { objectKey: "thumbs/x.jpg" },
      preview: { objectKey: "previews/x.mp4", durationSeconds: 5 },
      renditions: [
        { quality: "1080p", objectKey: "r/1080.mp4", bitrate: 5_000_000 },
        { quality: "720p", objectKey: "r/720.mp4", bitrate: 2_500_000 },
        { quality: "480p", objectKey: "r/480.mp4", bitrate: 1_000_000 },
      ],
    };
  },
};

suite("MediaPipeline on the canonical repository layer", () => {
  let pool: PgPool;
  const org = newUuid();
  const videoId = newUuid();
  const iso = () => new Date().toISOString();

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureCanonicalSchema(pool);
    await pool.query(
      `INSERT INTO organization (id, name, settings, created_at) VALUES ($1, $2, $3::jsonb, $4)`,
      [org, "Acme", JSON.stringify({}), iso()],
    );
    await pool.query(
      `INSERT INTO video (id, organization_id, folder_id, title, duration_seconds, status, source_object_key, developer_mode, created_at)
       VALUES ($1, $2, NULL, $3, 30, 'uploading', $4, false, $5)`,
      [videoId, org, "Demo", "uploads/demo.mp4", iso()],
    );
  });

  afterAll(async () => {
    if (pool) {
      // Deleting the organization cascades video -> assets/renditions.
      await pool.query(`DELETE FROM organization WHERE id = $1`, [org]).catch(() => {});
      await pool.close();
    }
  });

  it("processes to ready and retains assets/renditions across the in-place status update (R8.2–R8.7)", async () => {
    const emitter = recordingEmitter();
    const pipeline = assemblePostgresMediaPipeline(pool, {
      queue: recordingQueue(),
      transcoder: goodTranscoder,
      emitter,
    });

    const result = await pipeline.process({ videoId, organizationId: org });
    expect(result.status).toBe("ready");
    expect(result.renditions).toHaveLength(3);

    const repos = assemblePostgresRepositories(pool);
    // The video reached `ready` via an in-place update (identity preserved).
    expect((await repos.videos.findById(org, videoId))?.status).toBe("ready");

    // The assets and renditions persisted before the final transition survive
    // (they would be cascade-deleted by a delete-then-insert soft update).
    const assets = await pool.query(
      `SELECT type FROM asset WHERE video_id = $1 ORDER BY type`,
      [videoId],
    );
    expect((assets.rows as Array<{ type: string }>).map((r) => r.type).sort()).toEqual([
      "preview",
      "thumbnail",
    ]);
    const rends = await pool.query(
      `SELECT count(*)::int AS n FROM rendition WHERE video_id = $1`,
      [videoId],
    );
    expect(Number((rends.rows[0] as { n: number }).n)).toBe(3);
    expect(emitter.events.some((e) => e.status === "ready")).toBe(true);
  });
});
