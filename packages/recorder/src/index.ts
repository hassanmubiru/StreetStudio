/**
 * @streetstudio/recording
 *
 * Public entry point for Recorder capture and the chunked/resumable upload
 * client. Consumed by the web and desktop clients. This is the ONLY module
 * other packages may import from; internal modules are not part of the public
 * surface and must not be imported directly.
 */
export const DOMAIN =
  "Recorder capture and chunked/resumable upload client logic." as const;

// --- Recorder capture, controls, and offline upload (task 15.1) -----------
export {
  Recorder,
  FINALIZE_DEADLINE_MS,
  MAX_OFFLINE_UPLOAD_ATTEMPTS,
  DEFAULT_SHORTCUTS,
} from "./recorder.js";
export type {
  RecorderDeps,
  RecorderState,
  RecorderShortcutAction,
  AnnotationTool,
  AnnotationState,
  RecordingSession,
  Recording,
  StopDisposition,
} from "./recorder.js";

// --- Injectable Recorder ports (seams) ------------------------------------
export { CapturePermissionDeniedError } from "./ports.js";
export type {
  CaptureSurface,
  CaptureSources,
  CaptureTrack,
  CapturedMedia,
  CaptureHandle,
  MediaCaptureSource,
  StoredRecording,
  LocalRecordingStore,
  RecordingUploader,
  ConnectivityMonitor,
  RecorderNotificationKind,
  RecorderNotification,
  RecorderNotifier,
} from "./ports.js";

// --- Time seam -------------------------------------------------------------
export { systemClock, toIsoTimestamp } from "./clock.js";
export type { Clock } from "./clock.js";
