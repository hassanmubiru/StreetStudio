/**
 * The media-processing queue, backed by the **published** `@streetjs/queue`
 * (ADR-0022 slice 5).
 *
 * ── Ownership ────────────────────────────────────────────────────────────────
 * A durable job queue — enqueue, reserve-with-visibility-lease, at-least-once
 * delivery, bounded retry, dead-lettering, and multi-worker crash recovery — is
 * reusable infrastructure owned by the framework (`@streetjs/queue`). This
 * adapter no longer hand-rolls a queue: it composes the framework `Queue` and
 * exposes exactly the small surface the product needs — the {@link ProcessingQueue}
 * seam the {@link MediaPipeline} enqueues onto, a handler registration for the
 * worker loop, and a `work()`/`drainOnce()` runner. The lease-based reclaim in
 * the framework `RedisDriver` supersedes the product's former `processing_claim`
 * table + `reclaimStale` bookkeeping.
 *
 * ── Backend selection ────────────────────────────────────────────────────────
 * When `REDIS_URL` is set the durable, multi-worker `RedisDriver` is used over
 * the framework's `RedisClient` (a boundary-clean bare `streetjs` export). When
 * it is unset the framework's zero-dependency `MemoryDriver` is used — a
 * single-node fallback that is still framework-owned, so no hand-rolled queue
 * remains on either path. Redis remains authoritative only for *job delivery*;
 * the canonical `video.status` in Postgres stays authoritative for *domain
 * status*, and the registered handler bridges the two idempotently (an
 * at-least-once redelivery of an already-`ready` Video is acked without
 * reprocessing).
 */
import { createQueue, Job, MemoryDriver } from "@streetjs/queue";
import type { Queue, QueueDriver, Worker } from "@streetjs/queue";
import { RedisDriver } from "@streetjs/queue/redis";
import { RedisClient } from "streetjs";
import type { ProcessingJob, ProcessingQueue } from "@streetstudio/processing";

/** The single job type routed through the media queue. */
const TRANSCODE_TYPE = "media.transcode";
/** The named queue media jobs land on. */
const MEDIA_QUEUE = "media";

/** A strongly-typed transcode job carrying the pipeline's {@link ProcessingJob}. */
class TranscodeJob extends Job<ProcessingJob> {
  readonly type = TRANSCODE_TYPE;
  constructor(payload: ProcessingJob) {
    // Land on the media queue; allow a couple of redeliveries before DLQ so a
    // transient infra blip does not strand a video (the handler is idempotent).
    super(payload, { queue: MEDIA_QUEUE, maxAttempts: 3 });
  }
}

/** Options for constructing the media queue adapter. */
export interface StreetProcessingQueueDeps {
  /** `REDIS_URL`; when present the durable Redis driver is used. */
  readonly redisUrl?: string | undefined;
  /** Redis key prefix namespacing all queue keys. */
  readonly keyPrefix?: string;
  /** Visibility lease (ms) before an un-acked reservation is reclaimed. */
  readonly visibilityMs?: number;
}

/** Options for the worker/inline runner. */
export interface MediaWorkOptions {
  /** Max videos processed concurrently by this worker. Default 1. */
  readonly concurrency?: number;
  /** Stop the worker once the queue drains (one-shot / inline drain). */
  readonly stopWhenEmpty?: boolean;
  /** Poll interval (ms) when the driver has no push wake-up. */
  readonly pollIntervalMs?: number;
}

/**
 * The product-facing media queue: the {@link ProcessingQueue} the pipeline
 * enqueues onto, plus handler registration and a worker/inline runner over the
 * framework `Queue`.
 */
export interface StreetProcessingQueue extends ProcessingQueue {
  /** True when the durable Redis driver is active (vs. the Memory fallback). */
  readonly distributed: boolean;
  /** Register the handler a worker runs per reserved job (the pipeline processor). */
  registerHandler(handler: (job: ProcessingJob) => Promise<unknown> | unknown): void;
  /** Start the reservation loop; returns the framework {@link Worker}. */
  work(options?: MediaWorkOptions): Worker;
  /** Verify the backend is reachable (connects + PING for the Redis driver). */
  init(): Promise<void>;
  /** Graceful shutdown: stop workers, drain in-flight, close the driver/client. */
  close(): Promise<void>;
}

/** Parse a `redis://[:password@]host:port` URL into `RedisClient` options. */
function redisClientOptionsFromUrl(redisUrl: string): {
  host: string;
  port: number;
  password?: string;
} {
  const url = new URL(redisUrl);
  const host = url.hostname || "localhost";
  const port = url.port ? Number(url.port) : 6379;
  // A password may arrive as either the URL password or (per the redis URL
  // convention) the username slot; prefer the password field.
  const password = url.password || url.username || undefined;
  return { host, port, ...(password ? { password } : {}) };
}

/**
 * Build the media queue adapter. Selects the durable Redis driver when
 * `REDIS_URL` is set, otherwise the framework Memory driver. Does not connect
 * yet — call {@link StreetProcessingQueue.init} to prove reachability at boot.
 */
export function createMediaQueue(
  deps: StreetProcessingQueueDeps,
): StreetProcessingQueue {
  let client: RedisClient | undefined;
  let driver: QueueDriver;
  const distributed = Boolean(deps.redisUrl);

  if (deps.redisUrl) {
    client = new RedisClient(redisClientOptionsFromUrl(deps.redisUrl));
    driver = new RedisDriver({
      client,
      keyPrefix: deps.keyPrefix ?? "streetstudio:media",
      visibilityMs: deps.visibilityMs ?? 300_000,
    });
  } else {
    driver = new MemoryDriver();
  }

  const queue: Queue = createQueue({ driver, defaultQueue: MEDIA_QUEUE });

  return {
    distributed,
    async enqueue(job: ProcessingJob): Promise<void> {
      await queue.dispatch(new TranscodeJob(job));
    },
    registerHandler(handler): void {
      queue.register<ProcessingJob>(TRANSCODE_TYPE, async (payload) => {
        await handler(payload);
      });
    },
    work(options: MediaWorkOptions = {}): Worker {
      return queue.work({
        queues: [MEDIA_QUEUE],
        concurrency: options.concurrency ?? 1,
        ...(options.stopWhenEmpty ? { stopWhenEmpty: true } : {}),
        ...(options.pollIntervalMs !== undefined
          ? { pollIntervalMs: options.pollIntervalMs }
          : {}),
        ...(deps.visibilityMs !== undefined
          ? { visibilityMs: deps.visibilityMs }
          : {}),
      });
    },
    async init(): Promise<void> {
      // Fail fast at boot if the configured backend is unreachable (the Redis
      // driver connects + PINGs; the Memory driver is a no-op).
      await driver.init();
    },
    async close(): Promise<void> {
      await queue.close();
      client?.close();
    },
  };
}
