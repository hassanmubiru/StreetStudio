/**
 * Injectable ports (seams) for the Recorder.
 *
 * The Recorder in {@link ./recorder.ts} owns all capture, control, and offline
 * upload *policy* (Requirement 6) but never talks to a real browser, file
 * system, or network directly. Every environment-specific concern is reached
 * through one of the narrow interfaces defined here, so the Recorder is fully
 * testable without a real browser:
 *
 *  - {@link MediaCaptureSource} — the capture/media source seam that wraps the
 *    platform capture APIs (screen/window/region + optional camera/microphone/
 *    system audio),
 *  - {@link LocalRecordingStore} — the local-store seam that persists offline
 *    stops until connectivity returns,
 *  - {@link RecordingUploader} — the uploader seam that initiates upload of a
 *    finalized recording,
 *  - {@link ConnectivityMonitor} — reports online/offline state and reconnects,
 *  - {@link RecorderNotifier} — surfaces user-facing notifications.
 */
import type { IsoTimestamp } from "@streetstudio/shared";

/** The surface a recording captures: a full screen, a window, or a region (R6.1). */
export type CaptureSurface = "screen" | "window" | "region";

/**
 * The sources a recording may capture. The screen/window/region surface is
 * always captured (R6.1); camera (R6.2), microphone (R6.3), and system audio
 * (R6.4) are optional.
 */
export interface CaptureSources {
  /** Which display surface to capture (R6.1). */
  readonly surface: CaptureSurface;
  /** Capture camera video alongside the screen (R6.2). */
  readonly camera?: boolean;
  /** Capture microphone audio (R6.3). */
  readonly microphone?: boolean;
  /** Capture system audio where supported (R6.4, R6.5). */
  readonly systemAudio?: boolean;
}

/** A single track kind that may be granted by the capture environment. */
export type CaptureTrack = "screen" | "camera" | "microphone" | "system-audio";

/**
 * Raised by a {@link MediaCaptureSource} when the environment denies a
 * requested capture permission. The Recorder catches this, aborts, retains no
 * media, and surfaces the denial (R6.6). Carrying the denied track keeps the
 * surfaced error specific about *which* permission was denied.
 */
export class CapturePermissionDeniedError extends Error {
  /** The track whose permission the environment denied. */
  readonly deniedTrack: CaptureTrack;
  constructor(deniedTrack: CaptureTrack) {
    super(`capture permission denied for ${deniedTrack}`);
    this.name = "CapturePermissionDeniedError";
    this.deniedTrack = deniedTrack;
    Object.setPrototypeOf(this, CapturePermissionDeniedError.prototype);
  }
}

/** A finalized media blob produced by {@link CaptureHandle.finalize}. */
export interface CapturedMedia {
  /** The assembled media bytes. */
  readonly bytes: Uint8Array;
  /** MIME type of the assembled media (e.g. `video/webm`). */
  readonly mimeType: string;
  /** Captured duration in milliseconds, excluding paused spans. */
  readonly durationMs: number;
}

/**
 * An open capture, driven by the Recorder. The handle accumulates captured
 * media internally; the Recorder controls its lifecycle. Pausing suspends
 * capture while retaining everything captured before the pause (R6.8); resuming
 * continues appending; finalizing assembles the retained media (R6.9); disposing
 * abandons the capture and discards everything (R6.6).
 */
export interface CaptureHandle {
  /** Tracks the environment actually granted. */
  readonly grantedTracks: readonly CaptureTrack[];
  /**
   * Whether the environment supports system audio. When system audio was
   * requested but this is `false`, the Recorder continues without it and
   * notifies the Member (R6.5).
   */
  readonly systemAudioSupported: boolean;
  /** Suspend capture, retaining media captured before the pause (R6.8). */
  pause(): void;
  /** Resume capture after a pause. */
  resume(): void;
  /** Assemble and return the captured media. Resolves once finalized (R6.9). */
  finalize(): Promise<CapturedMedia>;
  /** Abandon the capture and discard all captured media (R6.6). */
  dispose(): void;
}

/**
 * The capture/media source seam. Wraps the platform capture APIs so the
 * Recorder can select sources and drive capture without a real browser.
 */
export interface MediaCaptureSource {
  /**
   * Begin capturing the requested sources.
   *
   * Rejects with {@link CapturePermissionDeniedError} when the environment
   * denies a requested permission (R6.6). When system audio is requested but
   * unsupported, resolves with a handle whose `systemAudioSupported` is `false`
   * and no `system-audio` track granted, so the Recorder can continue without
   * it (R6.5).
   */
  begin(sources: CaptureSources): Promise<CaptureHandle>;
}

/** A recording persisted locally while offline, awaiting upload (R6.10). */
export interface StoredRecording {
  /** Stable identifier for the stored recording. */
  readonly id: string;
  /** The finalized media awaiting upload. */
  readonly media: CapturedMedia;
  /** The sources the recording was captured from. */
  readonly sources: CaptureSources;
  /** When the recording was stopped and stored. */
  readonly storedAt: IsoTimestamp;
}

/**
 * The local-store seam. Persists recordings stopped while offline so they
 * survive until connectivity returns (R6.10) and can then be uploaded (R6.11).
 */
export interface LocalRecordingStore {
  /** Persist a recording locally. */
  save(recording: StoredRecording): Promise<void>;
  /** List all locally stored recordings awaiting upload. */
  list(): Promise<readonly StoredRecording[]>;
  /** Remove a stored recording once it has been uploaded successfully. */
  remove(id: string): Promise<void>;
}

/**
 * The uploader seam. Initiates upload of a finalized recording to the
 * API_Service (R6.9). The Recorder treats a rejected promise as a failed
 * attempt eligible for retry (R6.11).
 */
export interface RecordingUploader {
  /** Upload a finalized recording. Rejecting signals a failed attempt. */
  upload(media: CapturedMedia, sources: CaptureSources): Promise<void>;
}

/** Reports connectivity and notifies the Recorder when connectivity returns. */
export interface ConnectivityMonitor {
  /** Whether the client currently has connectivity. */
  isOnline(): boolean;
  /**
   * Subscribe to connectivity-restored events. The Recorder uploads stored
   * offline recordings on reconnect (R6.11). Returns an unsubscribe function.
   */
  onReconnect(listener: () => void): () => void;
}

/** Kinds of user-facing notification the Recorder can surface. */
export type RecorderNotificationKind =
  | "system-audio-unavailable"
  | "recording-stored-offline"
  | "offline-upload-succeeded"
  | "offline-upload-exhausted";

/** A user-facing notification emitted by the Recorder. */
export interface RecorderNotification {
  /** The notification kind. */
  readonly kind: RecorderNotificationKind;
  /** A human-readable message safe to show the Member. */
  readonly message: string;
}

/** Sink for user-facing Recorder notifications (e.g. R6.5 system-audio notice). */
export interface RecorderNotifier {
  /** Surface a notification to the Member. */
  notify(notification: RecorderNotification): void;
}
