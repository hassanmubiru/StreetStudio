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
import {
  MediaPipeline,
  repositoryProcessingStore,
  type ProcessingJob,
  type ProcessingQueue,
  type ProcessingResult,
  type ProcessingStatusEmitter,
} from "@streetstudio/processing";
import type { Uuid } from "@streetstudio/shared";
import type { PgClient } from "../pg-client.js";
import {
  FfmpegTranscoder,
  type FfmpegInvocation,
} from "./ffmpeg-transcoder.js";
import { S3StorageDriver } from "./s3-storage-driver.js";

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
  /** Optional evidence hook forwarded to the transcoder. */
  readonly onFfmpegInvocation?: (invocation: FfmpegInvocation) => void;
}

/** A minimal in-process FIFO {@link ProcessingQueue}. */
export class InProcessQueue implements ProcessingQueue {
  private readonly jobs: ProcessingJob[] = [];

  /** Place a job on the queue. */
  enqueue(job: ProcessingJob): void {
    this.jobs.push(job);
  }

  /** Remove and return the next job, or `undefined` when empty. */
  dequeue(): ProcessingJob | undefined {
    return this.jobs.shift();
  }

  /** Number of jobs currently queued. */
  get size(): number {
    return this.jobs.length;
  }
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
  /** The in-process queue backing {@link MediaPipeline.enqueue}. */
  readonly queue: InProcessQueue;
  /** The storage facade over the S3 driver (for direct object access). */
  readonly storage: Storage;
  /** The underlying S3 driver (exposed for source uploads / cleanup). */
  readonly driver: S3StorageDriver;
  /** Enqueue a video for processing (marks it `queued`). */
  enqueue(videoId: Uuid): Promise<void>;
  /** Process a job synchronously, returning its terminal result. */
  process(job: ProcessingJob): Promise<ProcessingResult>;
  /** Drain the queue, processing every job in FIFO order. */
  drain(): Promise<ProcessingResult[]>;
  /** Probe the integer-second duration of a stored media object (0 if unknown). */
  probeDurationSeconds(objectKey: string): Promise<number>;
  /** Release the S3 client sockets. */
  close(): void;
}

/**
 * Build the concrete media pipeline runtime from a live {@link PgClient} and
 * the S3/ffmpeg configuration.
 */
export function buildMediaRuntime(
  pg: PgClient,
  config: MediaRuntimeConfig,
): MediaRuntime {
  const repositories = createRepositories(streetSqlClient(pg));

  const driver = new S3StorageDriver({
    endpoint: config.s3Endpoint,
    region: config.s3Region,
    accessKeyId: config.s3AccessKeyId,
    secretAccessKey: config.s3SecretAccessKey,
    bucket: config.s3Bucket,
    forcePathStyle: config.s3ForcePathStyle ?? true,
  });
  // The facade over the same driver — provided for callers that prefer the
  // high-level Storage surface (the transcoder itself uses the driver directly).
  const storage = createStorage({ provider: "s3", driver });

  const transcoder = new FfmpegTranscoder({
    storage: driver,
    ffmpegPath: config.ffmpegPath,
    ...(config.onFfmpegInvocation
      ? { onInvocation: config.onFfmpegInvocation }
      : {}),
  });

  const queue = new InProcessQueue();
  const pipeline = new MediaPipeline({
    store: repositoryProcessingStore(repositories),
    queue,
    transcoder,
    emitter: noopEmitter,
  });

  return {
    pipeline,
    queue,
    storage,
    driver,
    enqueue: (videoId) => pipeline.enqueue(videoId),
    process: (job) => pipeline.process(job),
    async drain(): Promise<ProcessingResult[]> {
      const results: ProcessingResult[] = [];
      let job = queue.dequeue();
      while (job) {
        results.push(await pipeline.process(job));
        job = queue.dequeue();
      }
      return results;
    },
    probeDurationSeconds: (objectKey) =>
      transcoder.probeDurationSeconds(objectKey),
    close(): void {
      driver.destroy();
    },
  };
}

/**
 * Read the media runtime configuration from environment variables, applying the
 * confirmed local-infra defaults (MinIO on :9000, bucket `streetstudio-media`)
 * and resolving the ffmpeg binary from `ffmpeg-static` when `FFMPEG_PATH` is
 * unset.
 */
export function mediaRuntimeConfigFromEnv(
  env: NodeJS.ProcessEnv,
  ffmpegPath: string,
): MediaRuntimeConfig {
  return {
    s3Endpoint: env["S3_ENDPOINT"] ?? "http://localhost:9000",
    s3Region: env["S3_REGION"] ?? "us-east-1",
    s3AccessKeyId: env["S3_ACCESS_KEY_ID"] ?? "streetstudio",
    s3SecretAccessKey: env["S3_SECRET_ACCESS_KEY"] ?? "streetstudio_dev_minio",
    s3Bucket: env["S3_BUCKET"] ?? "streetstudio-media",
    s3ForcePathStyle: true,
    ffmpegPath: env["FFMPEG_PATH"] ?? ffmpegPath,
  };
}
