/**
 * Unit tests for the Recorder's capture, controls, and stop/offline behavior.
 *
 * Feature: streetstudio — Requirement 6 (Browser and Desktop Recording).
 *
 * These example-based tests exercise the Recorder through its injectable seams
 * ({@link MediaCaptureSource}, {@link RecordingUploader},
 * {@link LocalRecordingStore}, {@link ConnectivityMonitor},
 * {@link RecorderNotifier}) using in-memory doubles, so no real browser,
 * network, or file system is required. They cover:
 *
 *   - capture source selection: screen/window/region with optional
 *     camera/microphone/system audio (R6.1–R6.4);
 *   - pause suspends capture and resume retains pre-pause media (R6.8);
 *   - system audio selected but unsupported → recording continues without it and
 *     the Member is notified (R6.5);
 *   - denied capture permission aborts and retains no media (R6.6);
 *   - stopping while offline persists the recording locally (R6.10);
 *   - finalize-on-stop initiates upload when online (R6.9).
 */
import { describe, it, expect } from "vitest";
import { AppError } from "@streetstudio/shared";
import { Recorder, type RecorderDeps } from "./recorder.js";
import {
  CapturePermissionDeniedError,
  type CaptureHandle,
  type CaptureSources,
  type CaptureTrack,
  type CapturedMedia,
  type ConnectivityMonitor,
  type LocalRecordingStore,
  type MediaCaptureSource,
  type RecorderNotification,
  type RecordingUploader,
  type StoredRecording,
} from "./ports.js";

/* --------------------------- in-memory doubles ---------------------------- */

/**
 * A fake {@link CaptureHandle} that records lifecycle events and models capture
 * accumulation. `captureChunk` appends a byte only while not paused, so tests
 * can assert that pause suspends capture and resume retains the pre-pause media
 * (R6.8). `finalize` assembles the retained bytes.
 */
class FakeCaptureHandle implements CaptureHandle {
  readonly grantedTracks: readonly CaptureTrack[];
  readonly systemAudioSupported: boolean;
  readonly events: string[] = [];
  private readonly chunks: number[] = [];
  private paused = false;
  private disposed = false;
  private finalizeError: Error | null;

  constructor(opts: {
    grantedTracks: readonly CaptureTrack[];
    systemAudioSupported: boolean;
    finalizeError?: Error;
  }) {
    this.grantedTracks = opts.grantedTracks;
    this.systemAudioSupported = opts.systemAudioSupported;
    this.finalizeError = opts.finalizeError ?? null;
  }

  /** Simulate the environment capturing a media chunk. Ignored while paused. */
  captureChunk(byte: number): void {
    if (this.paused || this.disposed) return;
    this.chunks.push(byte);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  pause(): void {
    this.events.push("pause");
    this.paused = true;
  }

  resume(): void {
    this.events.push("resume");
    this.paused = false;
  }

  async finalize(): Promise<CapturedMedia> {
    this.events.push("finalize");
    if (this.finalizeError !== null) {
      throw this.finalizeError;
    }
    return {
      bytes: Uint8Array.from(this.chunks),
      mimeType: "video/webm",
      durationMs: this.chunks.length,
    };
  }

  dispose(): void {
    this.events.push("dispose");
    this.disposed = true;
    this.chunks.length = 0;
  }
}

/** Derive the tracks the environment grants for a given source selection. */
function tracksFor(sources: CaptureSources): CaptureTrack[] {
  const tracks: CaptureTrack[] = ["screen"];
  if (sources.camera === true) tracks.push("camera");
  if (sources.microphone === true) tracks.push("microphone");
  if (sources.systemAudio === true) tracks.push("system-audio");
  return tracks;
}

/**
 * A configurable {@link MediaCaptureSource}. By default it grants tracks that
 * mirror the requested sources. It can be configured to deny a permission
 * (R6.6) or to lack system-audio support (R6.5). Records the last `begin` call.
 */
function makeCapture(opts?: {
  denyTrack?: CaptureTrack;
  systemAudioSupported?: boolean;
  finalizeError?: Error;
}): {
  capture: MediaCaptureSource;
  lastSources: () => CaptureSources | null;
  handle: () => FakeCaptureHandle | null;
  beginCalls: () => number;
} {
  let lastSources: CaptureSources | null = null;
  let handle: FakeCaptureHandle | null = null;
  let beginCalls = 0;
  const systemAudioSupported = opts?.systemAudioSupported ?? true;
  const capture: MediaCaptureSource = {
    begin: async (sources) => {
      beginCalls += 1;
      lastSources = sources;
      if (opts?.denyTrack !== undefined) {
        throw new CapturePermissionDeniedError(opts.denyTrack);
      }
      const granted = tracksFor(sources).filter((t) =>
        t === "system-audio" ? systemAudioSupported : true,
      );
      handle = new FakeCaptureHandle({
        grantedTracks: granted,
        systemAudioSupported,
        finalizeError: opts?.finalizeError,
      });
      return handle;
    },
  };
  return {
    capture,
    lastSources: () => lastSources,
    handle: () => handle,
    beginCalls: () => beginCalls,
  };
}

/** An in-memory {@link RecordingUploader} that records what it uploaded. */
function makeUploader(opts?: { fail?: boolean }): {
  uploader: RecordingUploader;
  uploads: () => readonly { media: CapturedMedia; sources: CaptureSources }[];
} {
  const uploads: { media: CapturedMedia; sources: CaptureSources }[] = [];
  const uploader: RecordingUploader = {
    upload: async (media, sources) => {
      if (opts?.fail === true) {
        throw new Error("upload-failed");
      }
      uploads.push({ media, sources });
    },
  };
  return { uploader, uploads: () => uploads };
}

/** An in-memory {@link LocalRecordingStore}. */
function makeStore(): {
  store: LocalRecordingStore;
  saved: () => readonly StoredRecording[];
} {
  const byId = new Map<string, StoredRecording>();
  const store: LocalRecordingStore = {
    save: async (recording) => void byId.set(recording.id, recording),
    list: async () => [...byId.values()],
    remove: async (id) => void byId.delete(id),
  };
  return { store, saved: () => [...byId.values()] };
}

/** A {@link ConnectivityMonitor} with a fixed online/offline state. */
function makeConnectivity(online: boolean): ConnectivityMonitor {
  return {
    isOnline: () => online,
    onReconnect: () => () => {},
  };
}

/** A notifier that collects surfaced notifications. */
function makeNotifier(): {
  notifier: RecorderDeps["notifier"];
  notifications: () => readonly RecorderNotification[];
} {
  const notifications: RecorderNotification[] = [];
  return {
    notifier: { notify: (n) => void notifications.push(n) },
    notifications: () => notifications,
  };
}

/** Assemble a Recorder with the given seams and sensible in-memory defaults. */
function makeRecorder(overrides: Partial<RecorderDeps> & { capture: MediaCaptureSource }): {
  recorder: Recorder;
  deps: RecorderDeps;
} {
  const deps: RecorderDeps = {
    capture: overrides.capture,
    uploader: overrides.uploader ?? makeUploader().uploader,
    localStore: overrides.localStore ?? makeStore().store,
    connectivity: overrides.connectivity ?? makeConnectivity(true),
    notifier: overrides.notifier ?? makeNotifier().notifier,
    clock: overrides.clock,
    generateId: overrides.generateId,
  };
  return { recorder: new Recorder(deps), deps };
}

/* ------------------------------ (a) sources ------------------------------- */

describe("Recorder capture source selection (R6.1–R6.4)", () => {
  it.each<{ surface: CaptureSources["surface"] }>([
    { surface: "screen" },
    { surface: "window" },
    { surface: "region" },
  ])("captures the selected $surface surface", async ({ surface }) => {
    const cap = makeCapture();
    const { recorder } = makeRecorder({ capture: cap.capture });

    const session = await recorder.start({ surface });

    expect(cap.lastSources()).toEqual({ surface });
    expect(session.sources.surface).toBe(surface);
    expect(session.grantedTracks).toContain("screen");
    expect(recorder.currentState).toBe("recording");
    recorder.dispose();
  });

  it("captures camera, microphone, and system audio when selected", async () => {
    const cap = makeCapture();
    const { recorder } = makeRecorder({ capture: cap.capture });

    const session = await recorder.start({
      surface: "window",
      camera: true,
      microphone: true,
      systemAudio: true,
    });

    expect(session.grantedTracks).toEqual([
      "screen",
      "camera",
      "microphone",
      "system-audio",
    ]);
    expect(recorder.activeSession).toBe(session);
    recorder.dispose();
  });

  it("captures only the screen when no optional sources are selected", async () => {
    const cap = makeCapture();
    const { recorder } = makeRecorder({ capture: cap.capture });

    const session = await recorder.start({ surface: "screen" });

    expect(session.grantedTracks).toEqual(["screen"]);
    recorder.dispose();
  });

  it("rejects starting a second recording while one is active", async () => {
    const cap = makeCapture();
    const { recorder } = makeRecorder({ capture: cap.capture });
    await recorder.start({ surface: "screen" });

    await expect(recorder.start({ surface: "window" })).rejects.toBeInstanceOf(AppError);
    expect(recorder.currentState).toBe("recording");
    recorder.dispose();
  });
});

/* --------------------------- (b) pause / resume --------------------------- */

describe("Recorder pause/resume retains pre-pause media (R6.8)", () => {
  it("suspends capture on pause and retains media captured before the pause", async () => {
    const cap = makeCapture();
    const { recorder } = makeRecorder({ capture: cap.capture });

    await recorder.start({ surface: "screen" });
    const handle = cap.handle();
    expect(handle).not.toBeNull();

    // Capture some media before pausing.
    handle!.captureChunk(1);
    handle!.captureChunk(2);

    recorder.pause();
    expect(recorder.currentState).toBe("paused");
    expect(handle!.isPaused).toBe(true);

    // Attempts to capture while paused are suspended (dropped).
    handle!.captureChunk(99);

    recorder.resume();
    expect(recorder.currentState).toBe("recording");
    expect(handle!.isPaused).toBe(false);

    // Capture more after resuming.
    handle!.captureChunk(3);

    const recording = await recorder.stop();

    // Pre-pause media (1,2) retained; paused chunk (99) dropped; post-resume (3) kept.
    expect([...recording.media.bytes]).toEqual([1, 2, 3]);
    expect(handle!.events).toEqual(["pause", "resume", "finalize"]);
  });

  it("rejects pausing when not recording and resuming when not paused", async () => {
    const cap = makeCapture();
    const { recorder } = makeRecorder({ capture: cap.capture });

    // Idle: cannot pause or resume.
    expect(() => recorder.pause()).toThrow(AppError);
    expect(() => recorder.resume()).toThrow(AppError);

    await recorder.start({ surface: "screen" });
    // Recording: cannot resume (not paused).
    expect(() => recorder.resume()).toThrow(AppError);
    recorder.dispose();
  });
});

/* ----------------------- (c) unsupported system audio --------------------- */

describe("Recorder system audio unsupported (R6.5)", () => {
  it("continues recording without system audio and notifies the Member", async () => {
    const cap = makeCapture({ systemAudioSupported: false });
    const { notifier, notifications } = makeNotifier();
    const { recorder } = makeRecorder({ capture: cap.capture, notifier });

    const session = await recorder.start({ surface: "screen", systemAudio: true });

    // Recording continues.
    expect(recorder.currentState).toBe("recording");
    // No system-audio track was granted.
    expect(session.grantedTracks).not.toContain("system-audio");
    // The Member is notified system audio is unavailable.
    const kinds = notifications().map((n) => n.kind);
    expect(kinds).toContain("system-audio-unavailable");
    recorder.dispose();
  });

  it("does not notify about system audio when it is supported", async () => {
    const cap = makeCapture({ systemAudioSupported: true });
    const { notifier, notifications } = makeNotifier();
    const { recorder } = makeRecorder({ capture: cap.capture, notifier });

    await recorder.start({ surface: "screen", systemAudio: true });

    expect(notifications().map((n) => n.kind)).not.toContain("system-audio-unavailable");
    recorder.dispose();
  });
});

/* ------------------------ (d) denied permission --------------------------- */

describe("Recorder denied capture permission (R6.6)", () => {
  it("aborts, retains no media, and returns an error naming the denied permission", async () => {
    const cap = makeCapture({ denyTrack: "microphone" });
    const { recorder } = makeRecorder({ capture: cap.capture });

    await expect(
      recorder.start({ surface: "screen", microphone: true }),
    ).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
      details: { reason: "capture-permission-denied", deniedPermission: "microphone" },
    });

    // Aborted: idle, no active session, no capture handle opened (no media retained).
    expect(recorder.currentState).toBe("idle");
    expect(recorder.activeSession).toBeNull();
    expect(cap.handle()).toBeNull();
    recorder.dispose();
  });
});

/* -------------------- (e) stop: offline persist / online upload ----------- */

describe("Recorder stop finalization, upload, and offline storage (R6.9, R6.10)", () => {
  it("finalizes and initiates upload when online", async () => {
    const cap = makeCapture();
    const up = makeUploader();
    const st = makeStore();
    const { recorder } = makeRecorder({
      capture: cap.capture,
      uploader: up.uploader,
      localStore: st.store,
      connectivity: makeConnectivity(true),
    });

    const sources: CaptureSources = { surface: "screen", camera: true };
    await recorder.start(sources);
    cap.handle()!.captureChunk(7);

    const recording = await recorder.stop();

    expect(recording.disposition).toBe("uploaded");
    expect(up.uploads()).toHaveLength(1);
    expect([...up.uploads()[0]!.media.bytes]).toEqual([7]);
    expect(up.uploads()[0]!.sources).toEqual(sources);
    // Nothing persisted locally when the upload succeeds online.
    expect(st.saved()).toHaveLength(0);
    expect(recorder.currentState).toBe("idle");
  });

  it("persists the recording locally when stopped while offline", async () => {
    const cap = makeCapture();
    const up = makeUploader();
    const st = makeStore();
    const { notifier, notifications } = makeNotifier();
    const { recorder } = makeRecorder({
      capture: cap.capture,
      uploader: up.uploader,
      localStore: st.store,
      connectivity: makeConnectivity(false),
      notifier,
    });

    const sources: CaptureSources = { surface: "region" };
    await recorder.start(sources);
    cap.handle()!.captureChunk(5);

    const recording = await recorder.stop();

    expect(recording.disposition).toBe("stored-offline");
    // No upload attempted while offline.
    expect(up.uploads()).toHaveLength(0);
    // Recording persisted locally for later upload (R6.10).
    const saved = st.saved();
    expect(saved).toHaveLength(1);
    expect([...saved[0]!.media.bytes]).toEqual([5]);
    expect(saved[0]!.sources).toEqual(sources);
    // The Member is notified it was stored offline.
    expect(notifications().map((n) => n.kind)).toContain("recording-stored-offline");
    expect(recorder.currentState).toBe("idle");
  });

  it("falls back to local storage when an online upload fails", async () => {
    const cap = makeCapture();
    const up = makeUploader({ fail: true });
    const st = makeStore();
    const { recorder } = makeRecorder({
      capture: cap.capture,
      uploader: up.uploader,
      localStore: st.store,
      connectivity: makeConnectivity(true),
    });

    await recorder.start({ surface: "screen" });
    const recording = await recorder.stop();

    expect(recording.disposition).toBe("stored-offline");
    expect(st.saved()).toHaveLength(1);
  });

  it("can stop from a paused state", async () => {
    const cap = makeCapture();
    const { recorder } = makeRecorder({ capture: cap.capture });

    await recorder.start({ surface: "screen" });
    cap.handle()!.captureChunk(1);
    recorder.pause();

    const recording = await recorder.stop();
    expect(recording.disposition).toBe("uploaded");
    expect(recorder.currentState).toBe("idle");
  });
});
