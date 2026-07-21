import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PgPool } from "streetjs";
import {
  MediaPipeline,
  type ProcessingJob,
  type ProcessingQueue,
  type ProcessingStatusEvent,
  type ProcessingStatusEmitter,
  type TranscodeOutput,
  type Transcoder,
} from "./pipeline.js";
import {
  ensureProcessingSchema,
  postgresProcessingStore,
} from "./postgres-processing-store.js";

/**
 * De-seam (ADR-0020 pattern): the real {@link MediaPipeline} running on the real
 * PostgreSQL {@link ProcessingStore} — the pipeline's videos, assets
 * (thumbnail/preview), and adaptive-bitrate renditions persisted on real
 * infrastructure (sharing the `videos` table with the other domains). The
 * transcoder is the injectable seam (no ffmpeg in core), so this isolates
 * persistence while exercising success and bounded-failure flows. Runs when
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

/** A queue that records enqueued jobs for assertion. */
function recordingQueue(): ProcessingQueue & { jobs: ProcessingJob[] } {
  const jobs: ProcessingJob[] = [];
  return { jobs, enqueue: (job) => void jobs.push(job) };
}

/** An emitter that records the status transitions it received. */
function recordingEmitter(): ProcessingStatusEmitter & { events: ProcessingStatusEvent[] } {
  const events: ProcessingStatusEvent[] = [];
  return { events, emit: (e) => void events.push(e) };
}

/** A transcoder producing a valid output (1 thumbnail, 5s preview, 3 renditions). */
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

/** A transcoder that always fails (to exercise the bounded-failure path R8.6). */
const failingTranscoder: Transcoder = {
  async transcode(): Promise<TranscodeOutput> {
    throw new Error("transcode failed");
  },
};

suite("MediaPipeline on real Postgres store", () => {
  let pool: PgPool;
  const org = randomUUID();
  const readyVideo = randomUUID();
  const failVideo = randomUUID();

  async function seedVideo(id: string, key: string): Promise<void> {
    await pool.query(
      `INSERT INTO videos (id, organization_id, folder_id, title, duration_seconds, status, source_object_key, developer_mode, created_at)
       VALUES ($1, $2, NULL, $3, $4, 'uploading', $5, false, $6)`,
      [id, org, "Demo", 30, key, new Date().toISOString()],
    );
  }

  beforeAll(async () => {
    pool = new PgPool(poolOptions(DATABASE_URL!));
    await pool.initialize();
    await ensureProcessingSchema(pool);
    for (const v of [readyVideo, failVideo]) {
      await pool.query(`DELETE FROM renditions WHERE video_id = $1`, [v]).catch(() => {});
      await pool.query(`DELETE FROM assets WHERE video_id = $1`, [v]).catch(() => {});
      await pool.query(`DELETE FROM videos WHERE id = $1`, [v]).catch(() => {});
    }
    await seedVideo(readyVideo, "uploads/ready.mp4");
    await seedVideo(failVideo, "uploads/fail.mp4");
  });

  afterAll(async () => {
    if (pool) {
      for (const v of [readyVideo, failVideo]) {
        await pool.query(`DELETE FROM renditions WHERE video_id = $1`, [v]).catch(() => {});
        await pool.query(`DELETE FROM assets WHERE video_id = $1`, [v]).catch(() => {});
        await pool.query(`DELETE FROM videos WHERE id = $1`, [v]).catch(() => {});
      }
      await pool.close();
    }
  });

  it("enqueues a video and marks it queued (R8.1, R8.5)", async () => {
    const queue = recordingQueue();
    const emitter = recordingEmitter();
    const pipeline = new MediaPipeline({
      store: postgresProcessingStore(pool),
      queue,
      transcoder: goodTranscoder,
      emitter,
    });

    await pipeline.enqueue(readyVideo);

    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0]?.videoId).toBe(readyVideo);
    const store = postgresProcessingStore(pool);
    expect((await store.findVideoById(readyVideo))?.status).toBe("queued");
    expect(emitter.events.some((e) => e.status === "queued")).toBe(true);
  });

  it("processes a video: persists 1 thumbnail, 1 preview, 3 renditions, marks ready (R8.2–R8.4, R8.7)", async () => {
    const emitter = recordingEmitter();
    const pipeline = new MediaPipeline({
      store: postgresProcessingStore(pool),
      queue: recordingQueue(),
      transcoder: goodTranscoder,
      emitter,
    });

    const result = await pipeline.process({ videoId: readyVideo, organizationId: org });
    expect(result.status).toBe("ready");
    expect(result.renditions).toHaveLength(3);

    const store = postgresProcessingStore(pool);
    expect((await store.findVideoById(readyVideo))?.status).toBe("ready");

    const assets = await pool.query(
      `SELECT type FROM assets WHERE video_id = $1 ORDER BY type`,
      [readyVideo],
    );
    expect((assets.rows as Array<{ type: string }>).map((r) => r.type).sort()).toEqual([
      "preview",
      "thumbnail",
    ]);
    const rends = await pool.query(`SELECT count(*)::int AS n FROM renditions WHERE video_id = $1`, [readyVideo]);
    expect(Number((rends.rows[0] as { n: number }).n)).toBe(3);
    expect(emitter.events.some((e) => e.status === "ready")).toBe(true);
  });

  it("records failure and retains the source media after exhausting attempts (R8.6)", async () => {
    const emitter = recordingEmitter();
    const pipeline = new MediaPipeline({
      store: postgresProcessingStore(pool),
      queue: recordingQueue(),
      transcoder: failingTranscoder,
      emitter,
      options: { maxAttempts: 3 },
    });

    const result = await pipeline.process({ videoId: failVideo, organizationId: org });
    expect(result.status).toBe("failed");
    expect(result.attempts).toBe(3);

    const store = postgresProcessingStore(pool);
    const video = await store.findVideoById(failVideo);
    expect(video?.status).toBe("failed");
    // Source media is retained across the failure (R8.6).
    expect(video?.sourceObjectKey).toBe("uploads/fail.mp4");
    // No renditions were persisted on failure.
    const rends = await pool.query(`SELECT count(*)::int AS n FROM renditions WHERE video_id = $1`, [failVideo]);
    expect(Number((rends.rows[0] as { n: number }).n)).toBe(0);
    expect(emitter.events.some((e) => e.status === "failed" && e.failed === true)).toBe(true);
  });
});
