/* Temporary sanity checks for the Recorder (task 15.1). Not a committed test. */
import assert from "node:assert/strict";
import { AppError } from "@streetstudio/shared";
import { Recorder, MAX_OFFLINE_UPLOAD_ATTEMPTS } from "./recorder.js";
import {
  CapturePermissionDeniedError,
  type CaptureHandle,
  type CaptureSources,
  type CapturedMedia,
  type ConnectivityMonitor,
  type LocalRecordingStore,
  type MediaCaptureSource,
  type RecorderNotification,
  type RecordingUploader,
  type StoredRecording,
} from "./ports.js";

const media: CapturedMedia = { bytes: new Uint8Array([1, 2, 3]), mimeType: "video/webm", durationMs: 1000 };

function makeHandle(opts: { systemAudioSupported?: boolean } = {}): CaptureHandle {
  let paused = false;
  return {
    grantedTracks: ["screen"],
    systemAudioSupported: opts.systemAudioSupported ?? true,
    pause() { paused = true; },
    resume() { paused = false; },
    async finalize() { return media; },
    dispose() { void paused; },
  };
}

function makeCapture(handle: CaptureHandle | Error): MediaCaptureSource {
  return {
    async begin(_sources: CaptureSources) {
      if (handle instanceof Error) throw handle;
      return handle;
    },
  };
}

class MemStore implements LocalRecordingStore {
  items = new Map<string, StoredRecording>();
  async save(r: StoredRecording) { this.items.set(r.id, r); }
  async list() { return [...this.items.values()]; }
  async remove(id: string) { this.items.delete(id); }
}

class Conn implements ConnectivityMonitor {
  online: boolean;
  listeners: (() => void)[] = [];
  constructor(online: boolean) { this.online = online; }
  isOnline() { return this.online; }
  onReconnect(l: () => void) { this.listeners.push(l); return () => {}; }
  fire() { this.online = true; for (const l of this.listeners) l(); }
}

const sources: CaptureSources = { surface: "screen", systemAudio: true };

async function run() {
  // 1. Unsupported system audio -> notify + continue (R6.5)
  {
    const notes: RecorderNotification[] = [];
    const uploads: number[] = [];
    const rec = new Recorder({
      capture: makeCapture(makeHandle({ systemAudioSupported: false })),
      uploader: { async upload() { uploads.push(1); } },
      localStore: new MemStore(),
      connectivity: new Conn(true),
      notifier: { notify: (n) => notes.push(n) },
    });
    const session = await rec.start(sources);
    assert.equal(rec.currentState, "recording");
    assert.ok(notes.some((n) => n.kind === "system-audio-unavailable"), "should notify system-audio-unavailable");
    // annotations only while recording (R6.7)
    rec.setCursorHighlight(true);
    rec.setDrawingTool("pen");
    assert.deepEqual(rec.annotationState, { cursorHighlight: true, tool: "pen" });
    // pause/resume (R6.8)
    rec.pause();
    assert.equal(rec.currentState, "paused");
    rec.resume();
    assert.equal(rec.currentState, "recording");
    // stop online -> uploaded (R6.9)
    const out = await rec.stop();
    assert.equal(out.disposition, "uploaded");
    assert.equal(uploads.length, 1);
    assert.equal(rec.currentState, "idle");
    assert.ok(session.id);
    rec.dispose();
  }

  // 2. Denied permission -> abort, retain nothing, AUTHORIZATION_DENIED (R6.6)
  {
    let saved = 0;
    const store = new MemStore();
    const rec = new Recorder({
      capture: makeCapture(new CapturePermissionDeniedError("microphone")),
      uploader: { async upload() {} },
      localStore: store,
      connectivity: new Conn(true),
      notifier: { notify: () => {} },
    });
    await assert.rejects(
      () => rec.start({ surface: "screen", microphone: true }),
      (e: unknown) => e instanceof AppError && e.code === "AUTHORIZATION_DENIED",
    );
    assert.equal(rec.currentState, "idle");
    assert.equal((await store.list()).length, 0);
    void saved;
  }

  // 3. Offline stop -> stored, reconnect flush uploads with retries (R6.10, R6.11)
  {
    const notes: RecorderNotification[] = [];
    const store = new MemStore();
    const conn = new Conn(false);
    let attempts = 0;
    const uploader: RecordingUploader = {
      async upload() {
        attempts++;
        // fail the first 3 attempts, succeed on the 4th (within the 5 budget)
        if (attempts < 4) throw new Error("network");
      },
    };
    const rec = new Recorder({
      capture: makeCapture(makeHandle()),
      uploader,
      localStore: store,
      connectivity: conn,
      notifier: { notify: (n) => notes.push(n) },
    });
    await rec.start({ surface: "window" });
    const out = await rec.stop();
    assert.equal(out.disposition, "stored-offline");
    assert.equal((await store.list()).length, 1);
    assert.ok(notes.some((n) => n.kind === "recording-stored-offline"));
    // reconnect -> flush
    conn.fire();
    await rec.flushStoredRecordings();
    assert.equal(attempts <= MAX_OFFLINE_UPLOAD_ATTEMPTS, true);
    assert.equal((await store.list()).length, 0, "stored recording removed after success");
    assert.ok(notes.some((n) => n.kind === "offline-upload-succeeded"));
    rec.dispose();
  }

  // 4. Offline stop -> exhausts 5 attempts, remains stored (R6.11)
  {
    const notes: RecorderNotification[] = [];
    const store = new MemStore();
    const conn = new Conn(true);
    let attempts = 0;
    const rec = new Recorder({
      capture: makeCapture(makeHandle()),
      uploader: { async upload() { attempts++; throw new Error("always fails"); } },
      localStore: store,
      connectivity: conn,
      notifier: { notify: (n) => notes.push(n) },
    });
    // seed a stored recording directly, then flush
    await store.save({ id: "x1", media, sources: { surface: "region" }, storedAt: new Date().toISOString() });
    await rec.flushStoredRecordings();
    assert.equal(attempts, MAX_OFFLINE_UPLOAD_ATTEMPTS, "exactly 5 attempts");
    assert.equal((await store.list()).length, 1, "remains stored after exhaustion");
    assert.ok(notes.some((n) => n.kind === "offline-upload-exhausted"));
    rec.dispose();
  }

  // 5. Keyboard shortcuts exposed for all controls (R6.12)
  {
    const rec = new Recorder({
      capture: makeCapture(makeHandle()),
      uploader: { async upload() {} },
      localStore: new MemStore(),
      connectivity: new Conn(true),
      notifier: { notify: () => {} },
    });
    const s = rec.keyboardShortcuts;
    assert.ok(s.start && s.pause && s.resume && s.stop);
    await rec.trigger("start", { surface: "screen" });
    assert.equal(rec.currentState, "recording");
    await rec.trigger("stop");
    assert.equal(rec.currentState, "idle");
    rec.dispose();
  }

  console.log("recorder sanity checks passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
