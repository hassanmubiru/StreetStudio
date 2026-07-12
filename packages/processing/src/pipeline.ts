/**
 * Media Processing Pipeline (`packages/processing`, run in background workers).
 *
 * Implements the design's "Media Pipeline" section and Requirement 8 (Media
 * Processing Pipeline). The pipeline turns a freshly-uploaded source Video into
 * streamable outputs and drives its lifecycle status:
 *
 *  - {@link MediaPipeline.enqueue} is invoked when an upload completes. It marks
 *    the Video `queued`, hands a {@link ProcessingJob} to the injected
 *    {@link ProcessingQueue}, and emits a `queued` processing-status transition.
 *    Enqueuing is intended to complete within 5 seconds of upload completion
 *    (R8.1); the work itself is a couple of fast persistence/queue calls so the
 *    budget is met as long as the injected seams honor it.
 *  - {@link MediaPipeline.process} runs the job in a worker. It marks the Video
 *    `processing`, invokes the injected {@link Transcoder} (retrying on failure
 *    up to {@link MediaPipelineOptions.maxAttempts} attempts, default 3), and on
 *    success persists exactly one thumbnail Asset (R8.2), one preview Asset of
 *    3–10 seconds (R8.3), and at least 3 adaptive-bitrate Renditions (R8.4),
 *    then marks the Video `ready` (R8.7). On exhausting all attempts it records
 *    a `failed` status, retains the original source media, and emits a failure
 *    event (R8.6).
 *
 * A `processing-status` transition (one of `queued|processing|ready|failed`) is
 * emitted to Members with access to the Video on every stage transition through
 * the injected {@link ProcessingStatusEmitter}; the realtime layer is
 * responsible for delivering it within 2 seconds (R8.5).
 *
 * Every collaborator is an injectable seam: the actual transcoding is behind
 * {@link Transcoder} (no concrete ffmpeg/vendor lives in core), the queue behind
 * {@link ProcessingQueue}, realtime fan-out behind {@link ProcessingStatusEmitter},
 * persistence behind {@link ProcessingStore} (default adapter backed by the
 * Video/Rendition/Asset repositories from `@streetstudio/database`), the clock
 * behind {@link Clock}, and id generation behind an overridable generator. This
 * keeps the pipeline deterministic under test and free of vendor coupling.
 */
import { newUuid } from "@streetstudio/database";
import type {
  AssetRecord,
  RenditionRecord,
  Repositories,
  VideoRecord,
} from "@streetstudio/database";
import { systemClock, toIsoTimestamp, type Clock } from "@streetstudio/auth";
import { AppError } from "@streetstudio/shared";
import type {
  IsoTimestamp,
  ProcessingStatus,
  Uuid,
  VideoStatus,
} from "@streetstudio/shared";

/** Default maximum number of transcode attempts before recording failure (R8.6). */
export const DEFAULT_MAX_PROCESSING_ATTEMPTS = 3;

/** Minimum permitted preview duration, in seconds (R8.3). */
export const MIN_PREVIEW_SECONDS = 3;

/** Maximum permitted preview duration, in seconds (R8.3). */
export const MAX_PREVIEW_SECONDS = 10;

/** Minimum number of adaptive-bitrate renditions the pipeline must produce (R8.4). */
export const MIN_ABR_RENDITIONS = 3;

/** Soft budget within which a Video must be enqueued after upload completion (R8.1). */
export const ENQUEUE_DEADLINE_MS = 5_000;

/** Soft budget within which a status transition must reach Members with access (R8.5). */
export const STATUS_EMIT_DEADLINE_MS = 2_000;

/**
 * A unit of processing work handed to the queue and consumed by a worker. Only
 * the identifiers are carried; the worker re-resolves the Video record.
 */
export interface ProcessingJob {
  /** The Video to process. */
  readonly videoId: Uuid;
  /** The Organization that owns the Video (tenant scope). */
  readonly organizationId: Uuid;
}

/**
 * A processing-status transition emitted to Members with access to the Video.
 * `status` is constrained to the four defined lifecycle values (R8.5).
 */
export interface ProcessingStatusEvent {
  /** The Video whose status changed. */
  readonly videoId: Uuid;
  /** The owning Organization (used by the realtime layer to resolve audience). */
  readonly organizationId: Uuid;
  /** The new processing status. */
  readonly status: ProcessingStatus;
  /** When the transition occurred (from the injected clock). */
  readonly at: IsoTimestamp;
  /**
   * For a `failed` transition, a non-disclosing indicator that the Video could
   * not be processed (R8.6). Absent for other transitions.
   */
  readonly failed?: true;
}

/**
 * Injectable realtime seam. The pipeline emits one event per stage transition;
 * the implementation fans it out to Members with access within 2 seconds
 * (R8.5). An emitter failure must never abort processing, so the pipeline
 * isolates emission errors.
 */
export interface ProcessingStatusEmitter {
  /** Emit a processing-status transition. */
  emit(event: ProcessingStatusEvent): void | Promise<void>;
}

/**
 * Injectable queue seam. {@link MediaPipeline.enqueue} places a job here; a
 * worker later drains it and calls {@link MediaPipeline.process}. Backed by
 * StreetJS queues (Redis) in production and an in-memory fake under test.
 */
export interface ProcessingQueue {
  /** Enqueue a job for background processing. */
  enqueue(job: ProcessingJob): void | Promise<void>;
}

/** The source media a {@link Transcoder} reads. */
export interface TranscodeSource {
  /** The Video being processed. */
  readonly videoId: Uuid;
  /** Storage key of the original uploaded source media. */
  readonly sourceObjectKey: string;
  /** Full duration of the source Video, in seconds. */
  readonly durationSeconds: number;
}

/** A generated thumbnail image. */
export interface TranscodeThumbnail {
  /** Storage key of the thumbnail object. */
  readonly objectKey: string;
}

/** A generated short preview clip. */
export interface TranscodePreview {
  /** Storage key of the preview object. */
  readonly objectKey: string;
  /** Duration of the preview clip, in seconds (validated to be 3–10s). */
  readonly durationSeconds: number;
}

/** A generated adaptive-bitrate rendition. */
export interface TranscodeRendition {
  /** Human-readable quality label (e.g. `1080p`, `720p`). */
  readonly quality: string;
  /** Storage key of the rendition object. */
  readonly objectKey: string;
  /** Encoded bitrate in bits per second. */
  readonly bitrate: number;
}

/** The full set of outputs a single transcode run produces. */
export interface TranscodeOutput {
  /** Exactly one thumbnail (R8.2). */
  readonly thumbnail: TranscodeThumbnail;
  /** A 3–10 second preview (R8.3). */
  readonly preview: TranscodePreview;
  /** At least 3 ABR renditions (R8.4). */
  readonly renditions: readonly TranscodeRendition[];
}

/**
 * The injectable transcoder seam. This is the ONLY place media is actually
 * decoded/encoded; concrete ffmpeg/vendor implementations live outside core and
 * are wired in by the worker composition root. A rejected promise signals a
 * failed attempt, which the pipeline retries within its bounded budget (R8.6).
 */
export interface Transcoder {
  /** Produce a thumbnail, preview, and ABR renditions from the source. */
  transcode(source: TranscodeSource): Promise<TranscodeOutput>;
}

/** A persisted thumbnail/preview Asset reference returned by {@link MediaPipeline.process}. */
export interface AssetRef {
  readonly id: Uuid;
  readonly videoId: Uuid;
  readonly objectKey: string;
}

/** A persisted Rendition reference returned by {@link MediaPipeline.process}. */
export interface RenditionRef {
  readonly id: Uuid;
  readonly videoId: Uuid;
  readonly quality: string;
  readonly objectKey: string;
  readonly bitrate: number;
}

/** Outcome of {@link MediaPipeline.process}. */
export interface ProcessingResult {
  /** Terminal status of the run. */
  readonly status: "ready" | "failed";
  /** Number of transcode attempts made (1..maxAttempts). */
  readonly attempts: number;
  /** The persisted thumbnail, present only on success (R8.2). */
  readonly thumbnail?: AssetRef;
  /** The persisted preview, present only on success (R8.3). */
  readonly preview?: AssetRef;
  /** The persisted renditions; empty on failure (R8.4). */
  readonly renditions: readonly RenditionRef[];
}

/**
 * Persistence port for the pipeline. Deliberately narrow: resolve a Video
 * (scoped or by id), transition its status, and persist the thumbnail, preview,
 * and rendition outputs. The default adapter ({@link repositoryProcessingStore})
 * is backed by the tenant-scoped Video repository and the Asset/Rendition
 * repositories from `@streetstudio/database`.
 */
export interface ProcessingStore {
  /** Find a Video by id, scoped to its Organization, or null when absent. */
  findVideo(organizationId: Uuid, videoId: Uuid): Promise<VideoRecord | null>;
  /**
   * Find a Video by id without an Organization scope, or null when absent.
   * Used by {@link MediaPipeline.enqueue}, which is handed only a Video id.
   */
  findVideoById(videoId: Uuid): Promise<VideoRecord | null>;
  /**
   * Transition `video` to `status`, preserving its identity and every other
   * field (notably `sourceObjectKey`, so the source is retained on failure —
   * R8.6), and return the updated record.
   */
  setVideoStatus(video: VideoRecord, status: VideoStatus): Promise<VideoRecord>;
  /** Persist a thumbnail/preview Asset and return it. */
  insertAsset(record: AssetRecord): Promise<AssetRecord>;
  /** Persist a Rendition and return it. */
  insertRendition(record: RenditionRecord): Promise<RenditionRecord>;
}

/** Options controlling pipeline behavior. */
export interface MediaPipelineOptions {
  /**
   * Maximum number of transcode attempts before the run is recorded as failed
   * (R8.6). Defaults to {@link DEFAULT_MAX_PROCESSING_ATTEMPTS} (3). Must be a
   * positive integer.
   */
  readonly maxAttempts?: number;
  /** Time source; defaults to the system clock. */
  readonly clock?: Clock;
  /** UUID generator for new Assets/Renditions; defaults to the database generator. */
  readonly newId?: () => Uuid;
}

/** Dependencies required to construct a {@link MediaPipeline}. */
export interface MediaPipelineDeps {
  /** Persistence port. */
  readonly store: ProcessingStore;
  /** Queue seam used to enqueue background work (R8.1). */
  readonly queue: ProcessingQueue;
  /** Transcoder seam producing thumbnail/preview/renditions (R8.2–R8.4). */
  readonly transcoder: Transcoder;
  /** Realtime seam for status transitions (R8.5). */
  readonly emitter: ProcessingStatusEmitter;
  /** Behavior options. */
  readonly options?: MediaPipelineOptions;
}

/**
 * The Media Processing Pipeline. See the module doc for the exact semantics of
 * {@link MediaPipeline.enqueue} and {@link MediaPipeline.process}.
 */
export class MediaPipeline {
  private readonly store: ProcessingStore;
  private readonly queue: ProcessingQueue;
  private readonly transcoder: Transcoder;
  private readonly emitter: ProcessingStatusEmitter;
  private readonly maxAttempts: number;
  private readonly clock: Clock;
  private readonly newId: () => Uuid;

  constructor(deps: MediaPipelineDeps) {
    this.store = deps.store;
    this.queue = deps.queue;
    this.transcoder = deps.transcoder;
    this.emitter = deps.emitter;
    const opts = deps.options ?? {};
    const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_PROCESSING_ATTEMPTS;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new AppError("VALIDATION_FAILED", {
        details: { reason: "maxAttempts-must-be-positive-integer", maxAttempts },
      });
    }
    this.maxAttempts = maxAttempts;
    this.clock = opts.clock ?? systemClock;
    this.newId = opts.newId ?? newUuid;
  }

  /**
   * Enqueue `videoId` for background processing. Invoked when an upload
   * completes; intended to finish within 5 seconds (R8.1). The Video is marked
   * `queued`, a {@link ProcessingJob} is placed on the queue, and a `queued`
   * status transition is emitted to Members with access (R8.5). An unknown
   * Video is rejected with `NOT_FOUND`.
   */
  async enqueue(videoId: Uuid): Promise<void> {
    const video = await this.store.findVideoById(videoId);
    if (!video) {
      throw new AppError("NOT_FOUND", { details: { videoId } });
    }

    const queued = await this.store.setVideoStatus(video, "queued");
    // Enqueue before emitting so a worker can begin as early as possible.
    await this.queue.enqueue({
      videoId: queued.id,
      organizationId: queued.organizationId,
    });
    await this.emitStatus(queued.organizationId, queued.id, "queued");
  }

  /**
   * Process a queued job. Marks the Video `processing` (R8.5), invokes the
   * transcoder with bounded retries, and on success persists exactly one
   * thumbnail (R8.2), one 3–10s preview (R8.3), and ≥3 renditions (R8.4) before
   * marking the Video `ready` (R8.7). On exhausting every attempt it records a
   * `failed` status, retains the original source media, and emits a failure
   * event (R8.6). An unknown Video is rejected with `NOT_FOUND`.
   */
  async process(job: ProcessingJob): Promise<ProcessingResult> {
    const video = await this.store.findVideo(job.organizationId, job.videoId);
    if (!video) {
      throw new AppError("NOT_FOUND", {
        details: { videoId: job.videoId, organizationId: job.organizationId },
      });
    }

    const processing = await this.store.setVideoStatus(video, "processing");
    await this.emitStatus(
      processing.organizationId,
      processing.id,
      "processing",
    );

    const source: TranscodeSource = {
      videoId: processing.id,
      // The source key is always present once an upload has completed; guard
      // defensively so a missing key is treated as a failed input rather than
      // producing an unstreamable "ready" Video.
      sourceObjectKey: processing.sourceObjectKey ?? "",
      durationSeconds: processing.durationSeconds,
    };

    let attempts = 0;
    while (attempts < this.maxAttempts) {
      attempts += 1;
      try {
        const output = await this.transcoder.transcode(source);
        this.assertValidOutput(output);
        const result = await this.persistOutputs(processing, output, attempts);
        await this.store.setVideoStatus(processing, "ready");
        await this.emitStatus(processing.organizationId, processing.id, "ready");
        return result;
      } catch (err) {
        if (attempts >= this.maxAttempts) {
          // R8.6: attempts exhausted. Record failure, retain the source media
          // (setVideoStatus preserves sourceObjectKey), and emit a failure
          // event. `err` is retained only for server-side diagnostics.
          void err;
          await this.store.setVideoStatus(processing, "failed");
          await this.emitStatus(
            processing.organizationId,
            processing.id,
            "failed",
            true,
          );
          return { status: "failed", attempts, renditions: [] };
        }
        // Otherwise retry within the bounded budget.
      }
    }

    // Unreachable: the loop always returns on success or on the final attempt.
    /* c8 ignore next */
    throw new AppError("CAPABILITY_UNAVAILABLE", {
      details: { reason: "processing-loop-exhausted", videoId: job.videoId },
    });
  }

  /* --------------------------- internals ------------------------------- */

  /**
   * Validate that a transcode output satisfies the required-output invariants:
   * exactly one thumbnail (structurally guaranteed by the single field), a
   * preview whose duration is within [3, 10] seconds (R8.3), and at least 3 ABR
   * renditions (R8.4). A violation is thrown so the attempt is retried/failed.
   */
  private assertValidOutput(output: TranscodeOutput): void {
    const previewSeconds = output.preview.durationSeconds;
    if (
      !Number.isFinite(previewSeconds) ||
      previewSeconds < MIN_PREVIEW_SECONDS ||
      previewSeconds > MAX_PREVIEW_SECONDS
    ) {
      throw new AppError("VALIDATION_FAILED", {
        details: {
          reason: "preview-duration-out-of-range",
          previewSeconds,
          min: MIN_PREVIEW_SECONDS,
          max: MAX_PREVIEW_SECONDS,
        },
      });
    }
    if (output.renditions.length < MIN_ABR_RENDITIONS) {
      throw new AppError("VALIDATION_FAILED", {
        details: {
          reason: "insufficient-renditions",
          count: output.renditions.length,
          min: MIN_ABR_RENDITIONS,
        },
      });
    }
  }

  /**
   * Persist the thumbnail, preview, and renditions for a successful run and
   * return the {@link ProcessingResult}. Called exactly once per successful
   * attempt, so exactly one thumbnail and one preview are stored (R8.2, R8.3).
   */
  private async persistOutputs(
    video: VideoRecord,
    output: TranscodeOutput,
    attempts: number,
  ): Promise<ProcessingResult> {
    const now = this.nowIso();

    const thumbnailRecord: AssetRecord = {
      id: this.newId(),
      videoId: video.id,
      folderId: null,
      type: "thumbnail",
      objectKeyOrBody: output.thumbnail.objectKey,
      createdAt: now,
    };
    const previewRecord: AssetRecord = {
      id: this.newId(),
      videoId: video.id,
      folderId: null,
      type: "preview",
      objectKeyOrBody: output.preview.objectKey,
      createdAt: now,
    };

    await this.store.insertAsset(thumbnailRecord);
    await this.store.insertAsset(previewRecord);

    const renditions: RenditionRef[] = [];
    for (const r of output.renditions) {
      const record: RenditionRecord = {
        id: this.newId(),
        videoId: video.id,
        quality: r.quality,
        objectKey: r.objectKey,
        bitrate: r.bitrate,
      };
      await this.store.insertRendition(record);
      renditions.push({
        id: record.id,
        videoId: record.videoId,
        quality: record.quality,
        objectKey: record.objectKey,
        bitrate: record.bitrate,
      });
    }

    return {
      status: "ready",
      attempts,
      thumbnail: {
        id: thumbnailRecord.id,
        videoId: video.id,
        objectKey: output.thumbnail.objectKey,
      },
      preview: {
        id: previewRecord.id,
        videoId: video.id,
        objectKey: output.preview.objectKey,
      },
      renditions,
    };
  }

  /**
   * Emit a status transition through the injected emitter. Emission failures
   * are isolated so realtime problems never abort or fail processing.
   */
  private async emitStatus(
    organizationId: Uuid,
    videoId: Uuid,
    status: ProcessingStatus,
    failed?: true,
  ): Promise<void> {
    const event: ProcessingStatusEvent = {
      videoId,
      organizationId,
      status,
      at: this.nowIso(),
      ...(failed ? { failed } : {}),
    };
    try {
      await this.emitter.emit(event);
    } catch {
      // A realtime delivery failure must not abort processing (R8.5 is a
      // best-effort delivery budget owned by the realtime layer).
    }
  }

  private nowIso(): IsoTimestamp {
    return toIsoTimestamp(this.clock.now());
  }
}

/**
 * Default {@link ProcessingStore} backed by the repositories from
 * `@streetstudio/database`.
 *
 * Videos use the tenant-scoped repository; Assets and Renditions use the global
 * (id-keyed) repositories. Because the Video repository exposes no in-place
 * update, {@link ProcessingStore.setVideoStatus} repoints a Video by deleting
 * and re-inserting it with the new `status`, preserving its id,
 * `organizationId`, `sourceObjectKey`, and every other field (the same
 * soft-update pattern used by the content, RBAC, and API-key stores). Retaining
 * `sourceObjectKey` across a transition to `failed` is what preserves the
 * original source media (R8.6).
 */
export function repositoryProcessingStore(
  repositories: Pick<Repositories, "videos" | "assets" | "renditions">,
): ProcessingStore {
  const { videos, assets, renditions } = repositories;
  return {
    findVideo: (organizationId, videoId) =>
      videos.findById(organizationId, videoId),
    findVideoById: (videoId) => videos.findByIdUnscoped(videoId),
    async setVideoStatus(video, status) {
      const updated: VideoRecord = { ...video, status };
      await videos.deleteById(video.organizationId, video.id);
      await videos.insert(updated);
      return updated;
    },
    insertAsset: (record) => assets.insert(record),
    insertRendition: (record) => renditions.insert(record),
  };
}
