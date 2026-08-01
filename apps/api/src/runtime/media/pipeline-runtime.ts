/**
 * Composition of the concrete {@link MediaPipeline} for the API_Service.
 *
 * This is the worker composition root the processing package refers to: it
 * binds the abstract pipeline seams to their real, vendor-backed adapters —
 * the {@link FfmpegTranscoder} (real ffmpeg via `ffmpeg-static`) writing to a
 * real {@link S3StorageDriver} (MinIO/S3) — over the canonical repository store
 * (`repositoryProcessingStore` on `createRepositories(streetSqlClient(pg))`,
 * the same store of record the HTTP slice uses).
 *
 * The queue is a minimal in-process FIFO and the realtime emitter is a no-op:
 * the API composition does not run a distributed worker or a WebSocket
 * transport here, so enqueue/process run in-process and status transitions are
 * dropped. Both are honest injectable seams that a production deployment swaps
 * for StreetJS queues / realtime without touching the pipeline or the adapters.
 */
import { createRepositories, streetSqlClient } from "@streetstudio/database";
import { createStorage, type Storage } from "@streetjs/storage";
import type { Worker } from "@streetjs/queue";
import {
  MediaPipeline,
  repositoryProcessingStore,
  type ProcessingJob,
  type ProcessingResult,
  type ProcessingStatusEmitter,
  type ProcessingStore,
} from "@streetstudio/processing";
import type { Uuid } from "@streetstudio/shared";
import type { PgClient } from "../pg-client.js";
import {
  FfmpegTranscoder,
  type FfmpegInvocation,
} from "./ffmpeg-transcoder.js";
import {
  createMediaQueue,
  type MediaWorkOptions,
  type StreetProcessingQueue,
} from "./street-queue.js";
// Object storage is owned by the published framework (ADR-0022 slice 3): the S3
// driver comes from `@streetjs/storage/s3` (a published subpath export), not a
// hand-rolled `@aws-sdk` adapter. The driver lazily loads `@aws-sdk/client-s3`
// (the optional peer this app provides), so no vendor SDK is imported here.
import { createS3StorageDriverFromConfig } from "@streetjs/storage/s3";
import type { StorageDriver } from "@streetjs/storage";

/** S3/MinIO + ffmpeg configuration for the media pipeline. */
export interface MediaRuntimeConfig {
  /** S3 endpoint (e.g. `http://localhost:9000`). */
  readonly s3Endpoint: string;
  /** S3 region. */
  readonly s3Region: string;
  /** S3 access key id. */
  readonly s3AccessKeyId: string;
  /** S3 secret access key. */
  readonly s3SecretAccessKey: string;
  /** Target bucket (must already exist). */
  readonly s3Bucket: string;
  /** Path-style addressing (required for MinIO); defaults to true. */
  readonly s3ForcePathStyle?: boolean;
  /** Absolute path to the ffmpeg binary. */
  readonly ffmpegPath: string;
  /** Absolute path to the ffprobe binary. */
  readonly ffprobePath: string;
  /** `REDIS_URL` for the durable queue driver; Memory driver when unset. */
  readonly redisUrl?: string | undefined;
  /** Optional evidence hook forwarded to the transcoder. */
  readonly onFfmpegInvocation?: (invocation: FfmpegInvocation) => void;
}

/** A no-op {@link ProcessingStatusEmitter} (no realtime transport is wired). */
const noopEmitter: ProcessingStatusEmitter = {
  emit(): void {
    /* realtime fan-out is not wired in this composition */
  },
};

/** The assembled media runtime handed to callers. */
export interface MediaRuntime {
  /** The composed pipeline. */
  readonly pipeline: MediaPipeline;
  /** The framework-backed media queue ({@link MediaPipeline} enqueues onto it). */
  readonly queue: StreetProcessingQueue;
  /** The storage facade over the S3 driver (for direct object access). */
  readonly storage: Storage;
  /** The underlying framework {@link StorageDriver} (for direct object access). */
  readonly driver: StorageDriver;
  /** Enqueue a video for processing (marks it `queued` + dispatches a job). */
  enqueue(videoId: Uuid): Promise<void>;
  /**
   * Process a job synchronously through the pipeline, bypassing the queue.
   * Used by the verification harness / tests; the runtime worker uses the
   * registered handler instead.
   */
  process(job: ProcessingJob): Promise<ProcessingResult>;
  /**
   * Enqueue a video and await its terminal result (inline single-node path).
   * Requires a running worker ({@link startWorker}); the worker's handler
   * resolves the awaited completion when the video reaches `ready`/`failed`.
   */
  enqueueAndAwait(videoId: Uuid, organizationId: Uuid): Promise<ProcessingResult>;
  /** Start the consuming worker (reservation loop). Idempotent per call. */
  startWorker(options?: MediaWorkOptions): Worker;
  /** Prove the queue backend is reachable (connect + PING for Redis). */
  initQueue(): Promise<void>;
  /** Probe the integer-second duration of a stored media object (0 if unknown). */
  probeDurationSeconds(objectKey: string): Promise<number>;
  /** Stop workers, close the queue driver/client, and release resources. */
  close(): Promise<void>;
}

/**
 * Build the concrete media pipeline runtime from a live {@link PgClient} and
 * the S3/ffmpeg configuration.
 */
export async function buildMediaRuntime(
  pg: PgClient,
  config: MediaRuntimeConfig,
  statusEmitter: ProcessingStatusEmitter = noopEmitter,
): Promise<MediaRuntime> {
  const repositories = createRepositories(streetSqlClient(pg));

  // Framework-owned S3 driver (works against MinIO via endpoint + path-style).
  // Async because it lazily constructs the AWS client the first time.
  const driver = await createS3StorageDriverFromConfig({
    bucket: config.s3Bucket,
    region: config.s3Region,
    endpoint: config.s3Endpoint,
    credentials: {
      accessKeyId: config.s3AccessKeyId,
      secretAccessKey: config.s3SecretAccessKey,
    },
    forcePathStyle: config.s3ForcePathStyle ?? true,
  });
  // The facade over the same driver — provided for callers that prefer the
  // high-level Storage surface (the transcoder itself uses the driver directly).
  const storage = createStorage({ provider: "s3", driver });

  const transcoder = new FfmpegTranscoder({
    storage: driver,
    ffmpegPath: config.ffmpegPath,
    ffprobePath: config.ffprobePath,
    ...(config.onFfmpegInvocation
      ? { onInvocation: config.onFfmpegInvocation }
      : {}),
  });

  // The durable job queue is framework-owned (ADR-0022 slice 5): Redis-backed
  // when REDIS_URL is set, else the framework Memory driver.
  const queue = createMediaQueue({
    ...(config.redisUrl !== undefined ? { redisUrl: config.redisUrl } : {}),
  });

  const store: ProcessingStore = repositoryProcessingStore(repositories);
  const pipeline = new MediaPipeline({
    store,
    queue,
    transcoder,
    emitter: statusEmitter,
  });

  // Inline synchronous completions: a per-video promise registered by
  // enqueueAndAwait and resolved by the worker handler when the video reaches a
  // terminal state. This is how the single-node inline path returns the
  // ProcessingResult in the HTTP response without a bespoke in-memory queue.
  const completions = new Map<
    string,
    {
      resolve: (result: ProcessingResult) => void;
      reject: (error: unknown) => void;
    }
  >();

  // The worker handler: idempotent (an at-least-once redelivery of an
  // already-`ready` video is acked without reprocessing), and it resolves any
  // pending inline waiter with the terminal result.
  queue.registerHandler(async (job) => {
    const existing = await store.findVideo(job.organizationId, job.videoId);
    if (existing && existing.status === "ready") {
      // Already processed (redelivery). Ack without reprocessing; no inline
      // waiter exists for a redelivery in the single-dispatch inline flow.
      return;
    }
    const waiter = completions.get(job.videoId);
    try {
      const result = await pipeline.process(job);
      if (waiter) {
        completions.delete(job.videoId);
        waiter.resolve(result);
      }
    } catch (error) {
      // Unexpected failure (transcode errors are handled inside process() and
      // returned as `failed`). Resolve the inline waiter as failed so the HTTP
      // request does not hang, then rethrow so the queue can retry / dead-letter.
      if (waiter) {
        completions.delete(job.videoId);
        waiter.resolve({ status: "failed", attempts: 0, renditions: [] });
      }
      throw error;
    }
  });

  const workers: Worker[] = [];

  return {
    pipeline,
    queue,
    storage,
    driver,
    enqueue: (videoId) => pipeline.enqueue(videoId),
    process: (job) => pipeline.process(job),
    enqueueAndAwait(videoId, organizationId): Promise<ProcessingResult> {
      void organizationId; // organization is re-resolved by the pipeline
      const result = new Promise<ProcessingResult>((resolve, reject) => {
        completions.set(videoId, { resolve, reject });
      });
      // Register the waiter before enqueue so the worker cannot complete the
      // job before we are listening.
      return pipeline.enqueue(videoId).then(() => result);
    },
    startWorker(options: MediaWorkOptions = {}): Worker {
      const worker = queue.work(options);
      worker.start();
      workers.push(worker);
      return worker;
    },
    initQueue: () => queue.init(),
    probeDurationSeconds: (objectKey) =>
      transcoder.probeDurationSeconds(objectKey),
    async close(): Promise<void> {
      await Promise.all(workers.map((w) => w.stop().catch(() => undefined)));
      await queue.close().catch(() => undefined);
      // The framework StorageDriver owns and manages its own client lifecycle;
      // there is no explicit socket handle to release here.
    },
  };
}

/**
 * Read the media runtime configuration from environment variables, applying the
 * confirmed local-infra defaults (MinIO on :9000, bucket `streetstudio-media`)
 * and resolving the ffmpeg binary from `ffmpeg-static` when `FFMPEG_PATH` is
 * unset, and ffprobe from `ffprobe-static` when `FFPROBE_PATH` is unset.
 */
export function mediaRuntimeConfigFromEnv(
  env: NodeJS.ProcessEnv,
  ffmpegPath: string,
  ffprobePath: string,
): MediaRuntimeConfig {
  return {
    s3Endpoint: env["S3_ENDPOINT"] ?? "http://localhost:9000",
    s3Region: env["S3_REGION"] ?? "us-east-1",
    s3AccessKeyId: env["S3_ACCESS_KEY_ID"] ?? "streetstudio",
    s3SecretAccessKey: env["S3_SECRET_ACCESS_KEY"] ?? "streetstudio_dev_minio",
    s3Bucket: env["S3_BUCKET"] ?? "streetstudio-media",
    s3ForcePathStyle: true,
    ffmpegPath: env["FFMPEG_PATH"] ?? ffmpegPath,
    ffprobePath: env["FFPROBE_PATH"] ?? ffprobePath,
    ...(env["REDIS_URL"] ? { redisUrl: env["REDIS_URL"] } : {}),
  };
}
