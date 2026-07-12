/**
 * @streetstudio/processing
 *
 * Public entry point for the media processing pipeline: transcode, thumbnail,
 * and preview generation. Runs in background workers via StreetJS queues.
 */
export const DOMAIN =
  "Media processing pipeline: transcode, thumbnail, and preview generation." as const;

/** Processing lifecycle status values. */
export type ProcessingStatus = "queued" | "processing" | "ready" | "failed";

// --- Media Processing Pipeline (task 16.1) ---------------------------------
export {
  MediaPipeline,
  repositoryProcessingStore,
  DEFAULT_MAX_PROCESSING_ATTEMPTS,
  MIN_PREVIEW_SECONDS,
  MAX_PREVIEW_SECONDS,
  MIN_ABR_RENDITIONS,
  ENQUEUE_DEADLINE_MS,
  STATUS_EMIT_DEADLINE_MS,
} from "./pipeline.js";
export type {
  MediaPipelineDeps,
  MediaPipelineOptions,
  ProcessingJob,
  ProcessingResult,
  ProcessingStatusEvent,
  ProcessingStatusEmitter,
  ProcessingQueue,
  ProcessingStore,
  Transcoder,
  TranscodeSource,
  TranscodeOutput,
  TranscodeThumbnail,
  TranscodePreview,
  TranscodeRendition,
  AssetRef,
  RenditionRef,
} from "./pipeline.js";
