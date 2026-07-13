/**
 * Property 17: Offline recording upload retries are bounded.
 *
 * Feature: streetstudio, Property 17: Offline recording upload retries are bounded
 *
 * Validates: Requirements 6.11
 *
 * R6.11: WHEN connectivity is restored after an offline recording, THE Recorder
 * SHALL upload the stored recording, retrying up to 5 attempts on failure.
 *
 * The Recorder persists stops made while offline (R6.10) and, when connectivity
 * returns, uploads each stored recording through the injectable
 * {@link RecordingUploader} seam, retrying a failed upload up to
 * {@link MAX_OFFLINE_UPLOAD_ATTEMPTS} (5) times before giving up
 * ({@link Recorder.flushStoredRecordings}, which is exactly what the
 * connectivity-restored handler invokes).
 *
 * This property drives that reconnect path through the seams with an uploader
 * whose failure schedule is generated arbitrarily — it may fail some number of
 * times before succeeding, or fail forever. Across arbitrary recordings and
 * failure schedules it asserts, for every generated run, that:
 *
 *   - the uploader is invoked a BOUNDED number of times — never more than 5,
 *     no matter how many failures occur (the retry budget is bounded — R6.11);
 *   - when the upload eventually succeeds within the budget, it is attempted
 *     exactly (failures-before-success + 1) times, the stored recording is
 *     removed from the local store, and a success notification is surfaced; and
 *   - when every attempt fails, it is attempted exactly 5 times (never a sixth),
 *     the recording is RETAINED in the local store for a future reconnect, and
 *     an "exhausted" notification is surfaced.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  Recorder,
  MAX_OFFLINE_UPLOAD_ATTEMPTS,
  type RecorderDeps,
} from "./recorder.js";
import type {
  CaptureSources,
  CapturedMedia,
  ConnectivityMonitor,
  LocalRecordingStore,
  MediaCaptureSource,
  RecorderNotification,
  RecordingUploader,
  StoredRecording,
} from "./ports.js";

/**
 * A capture seam that is never exercised on the offline-upload path: the
 * recordings under test are already finalized and stored. Any call would be a
 * test-model bug, so it rejects loudly.
 */
const unusedCapture: MediaCaptureSource = {
  begin: async () => {
    throw new Error("capture.begin must not be called on the offline-upload path");
  },
};

/**
 * A {@link ConnectivityMonitor} reporting connectivity RESTORED (online). It
 * records reconnect subscriptions so the subscription lifecycle is exercised
 * without a real network.
 */
function onlineConnectivity(): ConnectivityMonitor {
  return {
    isOnline: () => true,
    onReconnect: () => () => {},
  };
}

/** Collects the notifications the Recorder surfaces so they can be asserted. */
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

/** An in-memory {@link LocalRecordingStore} seeded with one stored recording. */
function makeStore(seed: StoredRecording): {
  store: LocalRecordingStore;
  has: (id: string) => boolean;
  size: () => number;
} {
  const byId = new Map<string, StoredRecording>([[seed.id, seed]]);
  const store: LocalRecordingStore = {
    save: async (recording) => void byId.set(recording.id, recording),
    list: async () => [...byId.values()],
    remove: async (id) => void byId.delete(id),
  };
  return { store, has: (id) => byId.has(id), size: () => byId.size };
}

/**
 * A {@link RecordingUploader} whose attempts follow a fixed schedule and that
 * counts its invocations so the retry budget can be asserted.
 *
 * - `neverSucceed`: every attempt rejects (a failing upload that never recovers).
 * - otherwise: the first `failuresBeforeSuccess` attempts reject, then it
 *   resolves.
 */
function scheduledUploader(plan: {
  readonly failuresBeforeSuccess: number;
  readonly neverSucceed: boolean;
}): { uploader: RecordingUploader; calls: () => number } {
  let calls = 0;
  const uploader: RecordingUploader = {
    upload: async () => {
      calls += 1;
      if (plan.neverSucceed || calls <= plan.failuresBeforeSuccess) {
        throw new Error("upload-attempt-failed");
      }
    },
  };
  return { uploader, calls: () => calls };
}

/** Arbitrary finalized media awaiting upload. */
const mediaArb: fc.Arbitrary<CapturedMedia> = fc.record({
  bytes: fc
    .array(fc.integer({ min: 0, max: 255 }), { minLength: 0, maxLength: 32 })
    .map((xs) => Uint8Array.from(xs)),
  mimeType: fc.constantFrom("video/webm", "video/mp4"),
  durationMs: fc.integer({ min: 0, max: 3_600_000 }),
});

/** Arbitrary capture sources for the stored recording. */
const sourcesArb: fc.Arbitrary<CaptureSources> = fc.record({
  surface: fc.constantFrom("screen", "window", "region"),
  camera: fc.boolean(),
  microphone: fc.boolean(),
  systemAudio: fc.boolean(),
});

/** Arbitrary stored recording (as persisted while offline — R6.10). */
const storedRecordingArb: fc.Arbitrary<StoredRecording> = fc.record({
  id: fc.uuid(),
  media: mediaArb,
  sources: sourcesArb,
  storedAt: fc.constant("2024-01-01T00:00:00.000Z" as StoredRecording["storedAt"]),
});

/**
 * Arbitrary upload failure schedule. `failuresBeforeSuccess` ranges beyond the
 * budget (0..10) so both "succeeds within budget" and "exceeds budget" cases
 * are generated; `neverSucceed` forces the always-failing case.
 */
const uploadPlanArb = fc.record({
  failuresBeforeSuccess: fc.integer({ min: 0, max: 10 }),
  neverSucceed: fc.boolean(),
});

describe("Feature: streetstudio, Property 17: Offline recording upload retries are bounded", () => {
  it("retries a stored offline recording's upload at most 5 times on connectivity restore", async () => {
    await fc.assert(
      fc.asyncProperty(
        storedRecordingArb,
        uploadPlanArb,
        async (recording, plan) => {
          const { store, has, size } = makeStore(recording);
          const { uploader, calls } = scheduledUploader(plan);
          const { notifier, notifications } = makeNotifier();

          const recorder = new Recorder({
            capture: unusedCapture,
            uploader,
            localStore: store,
            connectivity: onlineConnectivity(),
            notifier,
          });

          // Connectivity restored: upload the stored offline recording (R6.11).
          // This is exactly the action the reconnect handler invokes.
          await recorder.flushStoredRecordings();

          const succeedsWithinBudget =
            !plan.neverSucceed &&
            plan.failuresBeforeSuccess < MAX_OFFLINE_UPLOAD_ATTEMPTS;

          // Core bound (R6.11): the uploader is NEVER invoked more than 5 times,
          // regardless of how many failures were scheduled.
          expect(calls()).toBeLessThanOrEqual(MAX_OFFLINE_UPLOAD_ATTEMPTS);

          const kinds = notifications().map((n) => n.kind);

          if (succeedsWithinBudget) {
            // Exactly the failures plus the succeeding attempt — no wasted tries.
            expect(calls()).toBe(plan.failuresBeforeSuccess + 1);
            // The recording was uploaded, so it is removed from local storage.
            expect(has(recording.id)).toBe(false);
            expect(size()).toBe(0);
            expect(kinds).toContain("offline-upload-succeeded");
            expect(kinds).not.toContain("offline-upload-exhausted");
          } else {
            // Every attempt failed: exactly the bounded budget, never a sixth.
            expect(calls()).toBe(MAX_OFFLINE_UPLOAD_ATTEMPTS);
            // The recording is retained for a future reconnect (never lost).
            expect(has(recording.id)).toBe(true);
            expect(size()).toBe(1);
            expect(kinds).toContain("offline-upload-exhausted");
            expect(kinds).not.toContain("offline-upload-succeeded");
          }

          recorder.dispose();
        },
      ),
      { numRuns: 200 },
    );
  });
});
