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
  /**
   * Stable identifier for this worker instance, recorded on each claim so an
   * operator can see which worker holds a Video. Defaults to a random id.
   */
  readonly workerId?: string;
  /**
   * How long a claimed Video may stay `processing` before another worker may
   * reclaim it (crash recovery). Default 300000 (5 min). A claim older than
   * this is assumed to belong to a dead worker and its Video is requeued.
   */
  readonly claimTimeoutMs?: number;
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
  private readonly workerId: string;
  private readonly claimTimeoutMs: number;
  private running = false;
  private stopped = false;
  private claimTableReady = false;
  private lastReclaimAt = 0;
  private idle: Promise<void> | null = null;
  private wakeUp: (() => void) | null = null;

  constructor(pg: PgClient, media: MediaRuntime, options: MediaWorkerOptions = {}) {
    this.pg = pg;
    this.media = media;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.workerId =
      options.workerId ?? `worker-${Math.random().toString(36).slice(2, 10)}`;
    this.claimTimeoutMs = options.claimTimeoutMs ?? 300_000;
    this.log =
      options.log ??
      ((message, fields) =>
        // eslint-disable-next-line no-console
        console.log(`[worker] ${message}`, fields ? JSON.stringify(fields) : ""));
  }

  /**
   * Create the worker-owned claim-tracking table (idempotent). This lives in the
   * composition layer — NOT in the canonical `@streetstudio/database` schema —
   * so crash-recovery bookkeeping never touches the tested domain schema. One
   * row per in-flight Video records when and by whom it was claimed.
   */
  async ensureClaimTable(): Promise<void> {
    if (this.claimTableReady) return;
    await this.pg.query(
      `CREATE TABLE IF NOT EXISTS processing_claim (
         video_id uuid PRIMARY KEY,
         organization_id uuid NOT NULL,
         worker_id text NOT NULL,
         claimed_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    this.claimTableReady = true;
  }

  /**
   * Atomically claim the oldest `queued` Video, transitioning it to
   * `processing` so no other worker can take it. Returns null when the backlog
   * is empty. Uses `FOR UPDATE SKIP LOCKED` for safe competing consumers.
   */
  async claimNext(): Promise<ClaimedJob | null> {
    await this.ensureClaimTable();
    // Claim the Video and record the claim atomically in one transaction, so a
    // crash can never leave a `processing` Video without a claim row (which
    // would make it un-reclaimable). `FOR UPDATE SKIP LOCKED` keeps N workers as
    // safe competing consumers.
    return this.pg.transaction(async (tx) => {
      const result = await tx.query<{ id: string; organization_id: string }>(
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
      await tx.query(
        `INSERT INTO processing_claim (video_id, organization_id, worker_id, claimed_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (video_id) DO UPDATE SET worker_id = EXCLUDED.worker_id, claimed_at = now()`,
        [row.id, row.organization_id, this.workerId],
      );
      return {
        videoId: row.id as Uuid,
        organizationId: row.organization_id as Uuid,
      };
    });
  }

  /** Release a Video's claim row once processing reaches a terminal state. */
  private async releaseClaim(videoId: Uuid): Promise<void> {
    try {
      await this.pg.query(`DELETE FROM processing_claim WHERE video_id = $1`, [videoId]);
    } catch (error) {
      this.log("claim release failed", {
        videoId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Requeue Videos whose claim is older than {@link claimTimeoutMs} — i.e. held
   * by a worker that crashed mid-transcode — so another worker can pick them up.
   * Only rows still `processing` are reset (a Video that finished after the
   * cutoff is left alone); the stale claims are then removed. Returns the count
   * requeued. Runs in a transaction for atomicity.
   */
  async reclaimStale(): Promise<number> {
    await this.ensureClaimTable();
    const seconds = Math.max(1, Math.ceil(this.claimTimeoutMs / 1000));
    return this.pg.transaction(async (tx) => {
      const reset = await tx.query<{ id: string }>(
        `UPDATE video SET status = 'queued'
          WHERE status = 'processing'
            AND id IN (
              SELECT video_id FROM processing_claim
               WHERE claimed_at < now() - make_interval(secs => $1)
            )
        RETURNING id`,
        [seconds],
      );
      await tx.query(
        `DELETE FROM processing_claim WHERE claimed_at < now() - make_interval(secs => $1)`,
        [seconds],
      );
      const count = reset.rows.length;
      if (count > 0) {
        this.log("reclaimed stale processing videos", {
          count,
          olderThanSeconds: seconds,
        });
      }
      return count;
    });
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
      // Terminal (ready/failed) — the claim is done; release it.
      await this.releaseClaim(job.videoId);
      return result;
    } catch (error) {
      // process() already records `failed` after exhausting attempts for
      // transcode errors; reaching here means an unexpected error (e.g. the
      // Video vanished). Release the claim so a stuck row does not linger — the
      // Video keeps its DB status for operator inspection.
      this.log("processing error", {
        videoId: job.videoId,
        error: error instanceof Error ? error.message : String(error),
      });
      await this.releaseClaim(job.videoId);
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
    await this.ensureClaimTable();
    this.log("started", {
      pollIntervalMs: this.pollIntervalMs,
      workerId: this.workerId,
      claimTimeoutMs: this.claimTimeoutMs,
    });
    while (!this.stopped) {
      // Crash recovery: periodically requeue Videos abandoned by a dead worker
      // (throttled to roughly once per claim-timeout window).
      if (Date.now() - this.lastReclaimAt >= Math.min(this.claimTimeoutMs, 60_000)) {
        this.lastReclaimAt = Date.now();
        // eslint-disable-next-line no-await-in-loop
        await this.reclaimStale().catch((error) =>
          this.log("reclaim failed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
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
