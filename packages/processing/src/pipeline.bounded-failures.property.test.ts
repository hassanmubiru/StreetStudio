/**
 * Property 26: Processing failures are bounded and preserve the source.
 *
 * Feature: streetstudio, Property 26: Processing failures are bounded and preserve the source
 *
 * Validates: Requirements 8.6
 *
 * R8.6: IF processing of a Video fails, THEN the Media_Pipeline SHALL retry
 * processing up to 3 attempts, and upon exhausting the attempts SHALL record a
 * failure status, retain the original source media, and emit a processing
 * failure event indicating the Video could not be processed.
 *
 * This property drives the pipeline through its injectable seams with a
 * transcoder that fails on EVERY attempt (either by throwing or by returning an
 * output the pipeline rejects as invalid). Across arbitrary Videos and
 * arbitrary retry budgets it asserts, for every generated run, that:
 *
 *   - the transcoder is invoked a bounded number of times — never more than the
 *     configured `maxAttempts`, and never more than 3 under the default budget
 *     (the retry budget is bounded — R8.6);
 *   - the terminal result is `failed` with no renditions, and the Video's
 *     persisted status is `failed`;
 *   - the original source media is RETAINED: the Video still exists in the
 *     store and its `sourceObjectKey` is byte-for-byte the value it started
 *     with (never cleared, never deleted — R8.6); and
 *   - exactly one processing-failure event is emitted, carrying status `failed`
 *     and the non-disclosing `failed: true` indicator (R8.6).
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type {
  AssetRecord,
  RenditionRecord,
  VideoRecord,
} from "@streetstudio/database";
import {
  MediaPipeline,
  DEFAULT_MAX_PROCESSING_ATTEMPTS,
  MIN_ABR_RENDITIONS,
  type ProcessingStatusEvent,
  type ProcessingStore,
  type Transcoder,
  type TranscodeOutput,
} from "./pipeline.js";

/** A fixed clock so timestamps are deterministic under test. */
const fixedClock = { now: () => new Date("2024-01-01T00:00:00.000Z") };

/** Sequential id generator so persisted-record ids are stable and unique. */
function seqIds(): () => string {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

/**
 * In-memory {@link ProcessingStore} that faithfully models the retain-source
 * behavior: `setVideoStatus` preserves every field except `status` (matching
 * the production adapter, which repoints the Video while keeping its
 * `sourceObjectKey`). `deleted` flips only if the Video is ever removed, which
 * must never happen on the failure path.
 */
function makeStore(initial: VideoRecord): {
  store: ProcessingStore;
  current: () => VideoRecord | null;
} {
  let video: VideoRecord | null = initial;
  const store: ProcessingStore = {
    findVideo: async (organizationId, videoId) =>
      video && video.organizationId === organizationId && video.id === videoId
        ? video
        : null,
    findVideoById: async (videoId) =>
      video && video.id === videoId ? video : null,
    setVideoStatus: async (v, status) => {
      // Preserve identity and every other field (notably sourceObjectKey).
      video = { ...v, status };
      return video;
    },
    insertAsset: async (record: AssetRecord) => record,
    insertRendition: async (record: RenditionRecord) => record,
  };
  return { store, current: () => video };
}

/** A structurally valid transcode output (used to build an invalid variant). */
function validOutput(): TranscodeOutput {
  return {
    thumbnail: { objectKey: "thumb.jpg" },
    preview: { objectKey: "preview.mp4", durationSeconds: 6 },
    renditions: Array.from({ length: MIN_ABR_RENDITIONS }, (_, i) => ({
      quality: `q-${i}`,
      objectKey: `r${i}.m3u8`,
      bitrate: 1_000_000 + i,
    })),
  };
}

/** How each (always-failing) attempt should fail. */
type FailureMode = "throw" | "invalid-preview" | "insufficient-renditions";

const failureModeArb: fc.Arbitrary<FailureMode> = fc.constantFrom(
  "throw",
  "invalid-preview",
  "insufficient-renditions",
);

/**
 * A transcoder that ALWAYS fails, in the given manner, and counts its calls so
 * the test can assert the retry budget is honored. "throw" rejects the promise;
 * the other modes return outputs the pipeline rejects during validation, which
 * also count as failed attempts.
 */
function alwaysFailingTranscoder(mode: FailureMode): {
  transcoder: Transcoder;
  calls: () => number;
} {
  let calls = 0;
  const transcoder: Transcoder = {
    transcode: async () => {
      calls += 1;
      if (mode === "throw") throw new Error("transcode-failed");
      if (mode === "invalid-preview") {
        // Preview duration outside the permitted 3–10s window.
        return { ...validOutput(), preview: { objectKey: "bad.mp4", durationSeconds: 30 } };
      }
      // Fewer than MIN_ABR_RENDITIONS renditions.
      return { ...validOutput(), renditions: validOutput().renditions.slice(0, MIN_ABR_RENDITIONS - 1) };
    },
  };
  return { transcoder, calls: () => calls };
}

/** Arbitrary Video record covering varied durations, folders, and dev mode. */
const videoArb: fc.Arbitrary<VideoRecord> = fc
  .record({
    id: fc.uuid(),
    organizationId: fc.uuid(),
    folderId: fc.option(fc.uuid(), { nil: null }),
    title: fc.string({ minLength: 1, maxLength: 80 }),
    durationSeconds: fc.integer({ min: 1, max: 100_000 }),
    // A non-empty source key so "retained" is observable and distinct.
    sourceObjectKey: fc.string({ minLength: 1, maxLength: 60 }),
    developerMode: fc.boolean(),
  })
  .map((v) => ({
    id: v.id,
    organizationId: v.organizationId,
    folderId: v.folderId,
    title: v.title,
    durationSeconds: v.durationSeconds,
    status: "uploading" as const,
    sourceObjectKey: v.sourceObjectKey,
    developerMode: v.developerMode,
    createdAt: "2024-01-01T00:00:00.000Z",
  }));

/**
 * The retry budget: either an explicit `maxAttempts` in 1..3, or the default
 * (omitted). Both must be bounded by 3 (R8.6). `nil` marks "use the default".
 */
const maxAttemptsArb: fc.Arbitrary<number | undefined> = fc.option(
  fc.integer({ min: 1, max: 3 }),
  { nil: undefined },
);

describe("Feature: streetstudio, Property 26: Processing failures are bounded and preserve the source", () => {
  it("retries at most 3 times, then records failure, retains the source, and emits a failure event", async () => {
    await fc.assert(
      fc.asyncProperty(
        videoArb,
        failureModeArb,
        maxAttemptsArb,
        async (video, mode, maxAttempts) => {
          const originalSourceKey = video.sourceObjectKey;
          const { store, current } = makeStore(video);
          const { transcoder, calls } = alwaysFailingTranscoder(mode);
          const events: ProcessingStatusEvent[] = [];

          const pipeline = new MediaPipeline({
            store,
            queue: { enqueue: () => {} },
            transcoder,
            emitter: { emit: (e) => void events.push(e) },
            options: {
              clock: fixedClock,
              newId: seqIds(),
              ...(maxAttempts === undefined ? {} : { maxAttempts }),
            },
          });

          const result = await pipeline.process({
            videoId: video.id,
            organizationId: video.organizationId,
          });

          const effectiveMax = maxAttempts ?? DEFAULT_MAX_PROCESSING_ATTEMPTS;

          // Bounded retries (R8.6): the transcoder is invoked exactly the retry
          // budget (all attempts fail), never more than that budget, and never
          // more than 3 under the default.
          expect(calls()).toBe(effectiveMax);
          expect(calls()).toBeLessThanOrEqual(effectiveMax);
          expect(calls()).toBeLessThanOrEqual(DEFAULT_MAX_PROCESSING_ATTEMPTS);

          // Terminal failure result with no renditions.
          expect(result.status).toBe("failed");
          expect(result.attempts).toBe(effectiveMax);
          expect(result.renditions).toEqual([]);

          // The Video is retained (never deleted) and recorded as failed.
          const persisted = current();
          expect(persisted).not.toBeNull();
          expect(persisted?.status).toBe("failed");

          // Source media is retained byte-for-byte (R8.6): the source key is
          // unchanged, non-empty, and never cleared.
          expect(persisted?.sourceObjectKey).toBe(originalSourceKey);
          expect(persisted?.id).toBe(video.id);

          // Exactly one processing-failure event, non-disclosing (R8.6).
          const failureEvents = events.filter((e) => e.status === "failed");
          expect(failureEvents).toHaveLength(1);
          expect(failureEvents[0]?.failed).toBe(true);
          expect(failureEvents[0]?.videoId).toBe(video.id);
          expect(failureEvents[0]?.organizationId).toBe(video.organizationId);
        },
      ),
      { numRuns: 200 },
    );
  });
});
