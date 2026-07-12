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
