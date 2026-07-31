/**
 * Distributed media-processing worker.
 *
 * Drains the media-processing backlog from the canonical `video` table — the
 * durable source of truth — rather than an in-process, in-memory queue. This is
 * what makes processing survive a separate worker deployment (the Docker
 * `worker` target): the API's `uploads.complete` transitions a Video to
 * `queued` (via {@link MediaPipeline.enqueue}); one or more worker processes
 * then claim queued Videos and run the real ffmpeg pipeline.
 *
 * ── Concurrency safety ──────────────────────────────────────────────────────
 * A job is claimed with a single atomic statement that flips exactly one
 * `queued` row to `processing` using `FOR UPDATE SKIP LOCKED`, so N workers
 * polling the same table each grab a *different* Video and none double-processes
 * a job (the canonical Postgres competing-consumers pattern). The claimed row is
 * then handed to {@link MediaPipeline.process}, which re-reads it, runs the
 * transcoder with bounded retries, and transitions it to `ready`/`failed`.
 *
 * ── Honest seams / limits (documented, not faked) ───────────────────────────
 *  - Realtime fan-out: cross-process `processing-status` delivery needs a shared
 *    bus (e.g. Redis pub/sub); this worker updates the authoritative DB status
 *    and logs transitions, and takes an optional emitter for deployments that
 *    wire one. It does not invent an in-memory realtime channel.
 *  - Stale-claim recovery: a worker that crashes mid-transcode leaves a Video in
 *    `processing`. Reclaiming stale `processing` rows needs a claim timestamp
 *    (a schema addition) and is left as a documented follow-up; claiming only
 *    `queued` rows is the core distributed-safe behavior.
 */
import type { ProcessingResult, ProcessingStatusEmitter } from "@streetstudio/processing";
import type { Uuid } from "@streetstudio/shared";
import type { PgClient } from "../pg-client.js";
import type { MediaRuntime } from "./pipeline-runtime.js";

/** A Video claimed for processing. */
interface ClaimedJob {
  readonly videoId: Uuid;
  readonly organizationId: Uuid;
}

/** Options controlling the worker loop. */
export interface MediaWorkerOptions {
  /** Poll interval (ms) when the backlog is empty. Default 1000. */
  readonly pollIntervalMs?: number;
  /** Structured log sink; defaults to `console`. */
  readonly log?: (message: string, fields?: Record<string, unknown>) => void;
}

/**
 * Polls the canonical `video` table for `queued` Videos, atomically claims one
 * at a time, and processes it through the real media pipeline.
 */
export class MediaWorker {
  private readonly pg: PgClient;
  private readonly media: MediaRuntime;
  private readonly pollIntervalMs: number;
  private readonly log: (message: string, fields?: Record<string, unknown>) => void;
  private running = false;
  private stopped = false;
  private idle: Promise<void> | null = null;
  private wakeUp: (() => void) | null = null;

  constructor(pg: PgClient, media: MediaRuntime, options: MediaWorkerOptions = {}) {
    this.pg = pg;
    this.media = media;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.log =
      options.log ??
      ((message, fields) =>
        // eslint-disable-next-line no-console
        console.log(`[worker] ${message}`, fields ? JSON.stringify(fields) : ""));
  }

  /**
   * Atomically claim the oldest `queued` Video, transitioning it to
   * `processing` so no other worker can take it. Returns null when the backlog
   * is empty. Uses `FOR UPDATE SKIP LOCKED` for safe competing consumers.
   */
  async claimNext(): Promise<ClaimedJob | null> {
    const result = await this.pg.query<{ id: string; organization_id: string }>(
      `UPDATE video
          SET status = 'processing'
        WHERE id = (
          SELECT id FROM video
           WHERE status = 'queued'
           ORDER BY created_at ASC
           FOR UPDATE SKIP LOCKED
           LIMIT 1
        )
      RETURNING id, organization_id`,
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return { videoId: row.id as Uuid, organizationId: row.organization_id as Uuid };
  }

  /**
   * Claim and process a single Video. Returns the terminal {@link ProcessingResult}
   * when a job was available, or null when the backlog was empty. The claimed
   * Video is already `processing`; {@link MediaPipeline.process} runs the
   * transcoder and drives it to `ready`/`failed`.
   */
  async processOne(): Promise<ProcessingResult | null> {
    const job = await this.claimNext();
    if (!job) {
      return null;
    }
    this.log("claimed video", { videoId: job.videoId, organizationId: job.organizationId });
    try {
      const result = await this.media.process(job);
      this.log("processed video", {
        videoId: job.videoId,
        status: result.status,
        attempts: result.attempts,
        renditions: result.renditions.length,
      });
      return result;
    } catch (error) {
      // process() already records `failed` after exhausting attempts for
      // transcode errors; reaching here means an unexpected error (e.g. the
      // Video vanished). Leave the row in `processing` for stale-recovery /
      // operator inspection rather than silently dropping it.
      this.log("processing error", {
        videoId: job.videoId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Run the poll/claim/process loop until {@link stop} is called. Drains the
   * backlog greedily, then sleeps `pollIntervalMs` when empty (interruptible by
   * {@link stop}).
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.stopped = false;
    this.log("started", { pollIntervalMs: this.pollIntervalMs });
    while (!this.stopped) {
      let processedAny = false;
      // Greedily drain the backlog before sleeping.
      // eslint-disable-next-line no-await-in-loop
      while (!this.stopped && (await this.processOne()) !== null) {
        processedAny = true;
      }
      if (this.stopped) {
        break;
      }
      if (!processedAny) {
        // eslint-disable-next-line no-await-in-loop
        await this.sleep();
      }
    }
    this.running = false;
    this.log("stopped");
  }

  /** Signal the loop to stop after the in-flight job (if any) completes. */
  stop(): void {
    this.stopped = true;
    if (this.wakeUp) {
      this.wakeUp();
    }
  }

  /** Sleep for the poll interval, interruptible by {@link stop}. */
  private sleep(): Promise<void> {
    this.idle = new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.wakeUp = null;
        resolve();
      }, this.pollIntervalMs);
      this.wakeUp = () => {
        clearTimeout(timer);
        this.wakeUp = null;
        resolve();
      };
    });
    return this.idle;
  }
}

/** A logging {@link ProcessingStatusEmitter} for worker deployments with no shared realtime bus. */
export function loggingStatusEmitter(
  log: (message: string, fields?: Record<string, unknown>) => void = (m, f) =>
    // eslint-disable-next-line no-console
    console.log(`[worker] ${m}`, f ? JSON.stringify(f) : ""),
): ProcessingStatusEmitter {
  return {
    emit(event): void {
      log("processing-status", {
        videoId: event.videoId,
        organizationId: event.organizationId,
        status: event.status,
        ...(event.failed ? { failed: true } : {}),
      });
    },
  };
}
