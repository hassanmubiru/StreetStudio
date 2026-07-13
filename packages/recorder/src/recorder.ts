/**
 * Recorder capture, controls, and offline upload (`packages/recording`).
 *
 * Implements the design's "Recorder" section and Requirement 6 (Browser and
 * Desktop Recording). The Recorder captures a screen/window/region with optional
 * camera/microphone/system audio (R6.1–R6.4); continues without unsupported
 * system audio and notifies the Member (R6.5); aborts and retains nothing on a
 * denied capture permission (R6.6); provides cursor highlighting/drawing tools
 * (R6.7) and keyboard shortcuts (R6.12) while recording; pauses/resumes while
 * retaining pre-pause media (R6.8); finalizes captured media within 10 seconds
 * on stop and initiates upload (R6.9); persists stops made while offline (R6.10)
 * and uploads them with at most five retries when connectivity returns (R6.11).
 *
 * All environment concerns are reached through the injectable ports in
 * {@link ./ports.ts}, so the Recorder is testable without a real browser. Errors
 * use the shared error taxonomy.
 */
import { AppError } from "@streetstudio/shared";
import { systemClock, toIsoTimestamp, type Clock } from "./clock.js";
import type {
  CaptureHandle,
  CaptureSources,
  CaptureTrack,
  ConnectivityMonitor,
  LocalRecordingStore,
  MediaCaptureSource,
  RecorderNotifier,
  RecordingUploader,
  StoredRecording,
} from "./ports.js";
import { CapturePermissionDeniedError } from "./ports.js";

/**
 * Maximum time the Recorder allows for finalizing captured media on stop before
 * treating the stop as failed (R6.9). Ten seconds.
 */
export const FINALIZE_DEADLINE_MS = 10_000;

/**
 * Maximum number of upload attempts for a recording stored while offline before
 * the Recorder gives up on the current reconnect (R6.11). Five attempts.
 */
export const MAX_OFFLINE_UPLOAD_ATTEMPTS = 5;

/** Lifecycle state of a recording session. */
export type RecorderState = "idle" | "recording" | "paused" | "stopping";

/** A control action a keyboard shortcut can trigger (R6.12). */
export type RecorderShortcutAction = "start" | "pause" | "resume" | "stop";

/**
 * Default keyboard shortcuts for the control actions (R6.12). Values are
 * platform-neutral accelerator strings the client binds to key events.
 */
export const DEFAULT_SHORTCUTS: Readonly<
  Record<RecorderShortcutAction, string>
> = Object.freeze({
  start: "CmdOrCtrl+Shift+R",
  pause: "CmdOrCtrl+Shift+P",
  resume: "CmdOrCtrl+Shift+P",
  stop: "CmdOrCtrl+Shift+S",
});

/** A drawing/annotation tool available while recording (R6.7). */
export type AnnotationTool = "none" | "cursor-highlight" | "pen" | "arrow" | "rectangle";

/** The annotation tools available to the Member during a recording (R6.7). */
export interface AnnotationState {
  /** Whether cursor highlighting is active. */
  readonly cursorHighlight: boolean;
  /** The currently selected drawing tool. */
  readonly tool: AnnotationTool;
}

/** Handle describing an active recording session (R6.1). */
export interface RecordingSession {
  /** Stable identifier for the session. */
  readonly id: string;
  /** The sources being captured. */
  readonly sources: CaptureSources;
  /** Tracks the environment actually granted. */
  readonly grantedTracks: readonly CaptureTrack[];
}

/** Where a finalized recording ended up after {@link Recorder.stop}. */
export type StopDisposition = "uploaded" | "stored-offline";

/** Outcome of stopping a recording (R6.9, R6.10). */
export interface Recording {
  /** The session that was stopped. */
  readonly sessionId: string;
  /** The finalized media. */
  readonly media: import("./ports.js").CapturedMedia;
  /** Whether the media was uploaded immediately or stored for later (R6.9, R6.10). */
  readonly disposition: StopDisposition;
}

/** Dependencies wiring the Recorder to its environment seams. */
export interface RecorderDeps {
  /** Capture/media source seam (R6.1–R6.6). */
  readonly capture: MediaCaptureSource;
  /** Uploader seam that initiates upload of finalized recordings (R6.9). */
  readonly uploader: RecordingUploader;
  /** Local-store seam for offline stops (R6.10, R6.11). */
  readonly localStore: LocalRecordingStore;
  /** Connectivity reporting + reconnect notifications (R6.10, R6.11). */
  readonly connectivity: ConnectivityMonitor;
  /** Sink for user-facing notifications (R6.5, R6.10). */
  readonly notifier: RecorderNotifier;
  /** Time source; defaults to the system clock. */
  readonly clock?: Clock;
  /** Shortcut bindings; defaults to {@link DEFAULT_SHORTCUTS} (R6.12). */
  readonly shortcuts?: Readonly<Record<RecorderShortcutAction, string>>;
  /** ID generator for sessions and stored recordings; defaults to a counter. */
  readonly generateId?: () => string;
  /** Finalize deadline override in ms; defaults to {@link FINALIZE_DEADLINE_MS}. */
  readonly finalizeDeadlineMs?: number;
}

/**
 * Client-side Recorder. One instance manages at most one active session at a
 * time and drives the injected seams to satisfy Requirement 6.
 */
export class Recorder {
  private readonly capture: MediaCaptureSource;
  private readonly uploader: RecordingUploader;
  private readonly localStore: LocalRecordingStore;
  private readonly connectivity: ConnectivityMonitor;
  private readonly notifier: RecorderNotifier;
  private readonly clock: Clock;
  private readonly shortcuts: Readonly<Record<RecorderShortcutAction, string>>;
  private readonly generateId: () => string;
  private readonly finalizeDeadlineMs: number;

  private state: RecorderState = "idle";
  private handle: CaptureHandle | null = null;
  private session: RecordingSession | null = null;
  private annotation: AnnotationState = { cursorHighlight: false, tool: "none" };
  private idCounter = 0;
  private readonly unsubscribeReconnect: () => void;

  constructor(deps: RecorderDeps) {
    this.capture = deps.capture;
    this.uploader = deps.uploader;
    this.localStore = deps.localStore;
    this.connectivity = deps.connectivity;
    this.notifier = deps.notifier;
    this.clock = deps.clock ?? systemClock;
    this.shortcuts = deps.shortcuts ?? DEFAULT_SHORTCUTS;
    this.generateId =
      deps.generateId ?? (() => `rec-${++this.idCounter}`);
    this.finalizeDeadlineMs = deps.finalizeDeadlineMs ?? FINALIZE_DEADLINE_MS;

    // Upload any recordings stored while offline once connectivity returns
    // (R6.11). Fire-and-forget; failures are surfaced via the notifier.
    this.unsubscribeReconnect = this.connectivity.onReconnect(() => {
      void this.flushStoredRecordings();
    });
  }

  /** The current lifecycle state. */
  get currentState(): RecorderState {
    return this.state;
  }

  /** The active session, or null when idle. */
  get activeSession(): RecordingSession | null {
    return this.session;
  }

  /** The keyboard shortcut bindings for the control actions (R6.12). */
  get keyboardShortcuts(): Readonly<Record<RecorderShortcutAction, string>> {
    return this.shortcuts;
  }

  /**
   * Start a recording that captures the selected screen/window/region with any
   * optional camera/microphone/system audio (R6.1–R6.4).
   *
   * When system audio is requested but unsupported, capture continues without
   * it and the Member is notified (R6.5). When the environment denies a
   * requested permission, the recording is aborted, no media is retained, and
   * an authorization error naming the denied permission is thrown (R6.6).
   */
  async start(sources: CaptureSources): Promise<RecordingSession> {
    if (this.state !== "idle") {
      throw new AppError("CONFLICT", {
        details: { reason: "recording-already-active", state: this.state },
      });
    }

    let handle: CaptureHandle;
    try {
      handle = await this.capture.begin(sources);
    } catch (err) {
      if (err instanceof CapturePermissionDeniedError) {
        // R6.6: abort and retain nothing. No handle was opened, so there is no
        // captured media to discard.
        throw new AppError("AUTHORIZATION_DENIED", {
          details: { reason: "capture-permission-denied", deniedPermission: err.deniedTrack },
          cause: err,
        });
      }
      throw new AppError("CAPABILITY_UNAVAILABLE", {
        details: { reason: "capture-failed" },
        cause: err,
      });
    }

    // R6.5: system audio requested but unsupported — continue and notify.
    if (sources.systemAudio === true && !handle.systemAudioSupported) {
      this.notifier.notify({
        kind: "system-audio-unavailable",
        message: "System audio is unavailable on this device; recording continues without it.",
      });
    }

    const session: RecordingSession = {
      id: this.generateId(),
      sources,
      grantedTracks: handle.grantedTracks,
    };
    this.handle = handle;
    this.session = session;
    this.state = "recording";
    this.annotation = { cursorHighlight: false, tool: "none" };
    return session;
  }

  /**
   * Pause the recording, suspending capture while retaining everything captured
   * before the pause (R6.8). No-op semantics are rejected: pausing when not
   * recording is a conflict.
   */
  pause(): void {
    if (this.state !== "recording" || this.handle === null) {
      throw new AppError("CONFLICT", {
        details: { reason: "cannot-pause", state: this.state },
      });
    }
    this.handle.pause();
    this.state = "paused";
  }

  /** Resume a paused recording, continuing capture (R6.8). */
  resume(): void {
    if (this.state !== "paused" || this.handle === null) {
      throw new AppError("CONFLICT", {
        details: { reason: "cannot-resume", state: this.state },
      });
    }
    this.handle.resume();
    this.state = "recording";
  }

  /**
   * Stop the recording: finalize the captured media within
   * {@link finalizeDeadlineMs} (R6.9) and either initiate upload immediately or,
   * when offline, persist it locally for upload on reconnect (R6.10, R6.11).
   */
  async stop(): Promise<Recording> {
    if ((this.state !== "recording" && this.state !== "paused") || this.handle === null || this.session === null) {
      throw new AppError("CONFLICT", {
        details: { reason: "cannot-stop", state: this.state },
      });
    }

    const handle = this.handle;
    const session = this.session;
    this.state = "stopping";

    let media: import("./ports.js").CapturedMedia;
    try {
      media = await this.finalizeWithinDeadline(handle);
    } catch (err) {
      // Finalization failed or exceeded the 10s deadline: discard and reset.
      handle.dispose();
      this.reset();
      throw err instanceof AppError
        ? err
        : new AppError("UPLOAD_FAILED", {
            details: { reason: "finalize-failed" },
            cause: err,
          });
    }

    // Capture is complete; release capture resources before upload/persist.
    this.reset();

    if (!this.connectivity.isOnline()) {
      // R6.10: stopped while offline — persist locally for later upload.
      await this.storeOffline(session, media);
      return { sessionId: session.id, media, disposition: "stored-offline" };
    }

    // R6.9: online — initiate upload immediately. If the immediate upload
    // fails, fall back to local persistence so it is retried on reconnect
    // (R6.11) rather than being lost.
    try {
      await this.uploader.upload(media, session.sources);
      return { sessionId: session.id, media, disposition: "uploaded" };
    } catch {
      await this.storeOffline(session, media);
      return { sessionId: session.id, media, disposition: "stored-offline" };
    }
  }

  /* --------------------------- annotations (R6.7) ----------------------- */

  /** The current annotation/drawing state (R6.7). */
  get annotationState(): AnnotationState {
    return this.annotation;
  }

  /** Toggle cursor highlighting on/off. Only valid while recording (R6.7). */
  setCursorHighlight(enabled: boolean): void {
    this.requireActiveForAnnotation();
    this.annotation = { ...this.annotation, cursorHighlight: enabled };
  }

  /** Select a drawing tool. Only valid while recording (R6.7). */
  setDrawingTool(tool: AnnotationTool): void {
    this.requireActiveForAnnotation();
    this.annotation = { ...this.annotation, tool };
  }

  /* --------------------------- shortcuts (R6.12) ------------------------ */

  /**
   * Dispatch a control action, e.g. from a bound keyboard shortcut (R6.12).
   * Returns the started session for `start`, and resolves once the action
   * completes for the others.
   */
  async trigger(action: RecorderShortcutAction, sources?: CaptureSources): Promise<void> {
    switch (action) {
      case "start":
        if (sources === undefined) {
          throw new AppError("VALIDATION_FAILED", {
            details: { reason: "start-requires-sources" },
          });
        }
        await this.start(sources);
        return;
      case "pause":
        this.pause();
        return;
      case "resume":
        this.resume();
        return;
      case "stop":
        await this.stop();
        return;
    }
  }

  /** Release the reconnect subscription. Call when the Recorder is torn down. */
  dispose(): void {
    this.unsubscribeReconnect();
    if (this.handle !== null) {
      this.handle.dispose();
    }
    this.reset();
  }

  /* --------------------------- internals -------------------------------- */

  private requireActiveForAnnotation(): void {
    if (this.state !== "recording" && this.state !== "paused") {
      throw new AppError("CONFLICT", {
        details: { reason: "annotation-requires-active-recording", state: this.state },
      });
    }
  }

  private reset(): void {
    this.handle = null;
    this.session = null;
    this.state = "idle";
    this.annotation = { cursorHighlight: false, tool: "none" };
  }

  /**
   * Finalize `handle`, rejecting with `UPLOAD_FAILED` if it does not complete
   * within {@link finalizeDeadlineMs} (R6.9).
   */
  private finalizeWithinDeadline(
    handle: CaptureHandle,
  ): Promise<import("./ports.js").CapturedMedia> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(
          new AppError("UPLOAD_FAILED", {
            details: { reason: "finalize-deadline-exceeded", deadlineMs: this.finalizeDeadlineMs },
          }),
        );
      }, this.finalizeDeadlineMs);
      if (
        typeof timer === "object" &&
        typeof (timer as { unref?: () => void }).unref === "function"
      ) {
        (timer as { unref: () => void }).unref();
      }
      handle.finalize().then(
        (media) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(media);
        },
        (err: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
    });
  }

  private async storeOffline(
    session: RecordingSession,
    media: import("./ports.js").CapturedMedia,
  ): Promise<void> {
    const stored: StoredRecording = {
      id: this.generateId(),
      media,
      sources: session.sources,
      storedAt: toIsoTimestamp(this.clock.now()),
    };
    await this.localStore.save(stored);
    this.notifier.notify({
      kind: "recording-stored-offline",
      message: "You're offline; the recording was saved and will upload when you reconnect.",
    });
  }

  /**
   * Upload every locally stored recording, retrying each up to
   * {@link MAX_OFFLINE_UPLOAD_ATTEMPTS} times (R6.11). A recording that succeeds
   * is removed from the store; one that exhausts its attempts is left stored for
   * a future reconnect and the Member is notified.
   */
  async flushStoredRecordings(): Promise<void> {
    if (!this.connectivity.isOnline()) {
      return;
    }
    const pending = await this.localStore.list();
    for (const recording of pending) {
      const uploaded = await this.uploadWithRetries(recording);
      if (uploaded) {
        await this.localStore.remove(recording.id);
        this.notifier.notify({
          kind: "offline-upload-succeeded",
          message: "A recording saved while offline has finished uploading.",
        });
      } else {
        this.notifier.notify({
          kind: "offline-upload-exhausted",
          message: "A saved recording could not be uploaded after several attempts; it will be retried later.",
        });
      }
    }
  }

  /**
   * Attempt to upload a stored recording, making at most
   * {@link MAX_OFFLINE_UPLOAD_ATTEMPTS} attempts (R6.11). Returns whether the
   * upload eventually succeeded.
   */
  private async uploadWithRetries(recording: StoredRecording): Promise<boolean> {
    for (let attempt = 1; attempt <= MAX_OFFLINE_UPLOAD_ATTEMPTS; attempt++) {
      try {
        await this.uploader.upload(recording.media, recording.sources);
        return true;
      } catch {
        // Retry until the attempt budget is exhausted (R6.11).
        if (attempt === MAX_OFFLINE_UPLOAD_ATTEMPTS) {
          return false;
        }
      }
    }
    return false;
  }
}
