/**
 * Property 25: Processing status events use only defined status values.
 *
 * Feature: streetstudio, Property 25: Processing status events use only defined status values
 *
 * Validates: Requirements 8.5
 *
 * R8.5 constrains every processing-status event the pipeline emits to exactly
 * one of four lifecycle values: `queued`, `processing`, `ready`, or `failed`.
 * This property drives arbitrary processing runs through the pipeline's
 * injectable seams and asserts that NO other status value is ever emitted,
 * across every path the pipeline can take:
 *
 *   - `enqueue` (emits `queued`),
 *   - a successful `process` run (emits `processing` then `ready`),
 *   - a `process` run whose transcoder throws or returns invalid output on
 *     every attempt, exhausting the retry budget (emits `processing` then
 *     `failed`), and
 *   - a `process` run that fails a bounded number of attempts before succeeding
 *     (emits `processing` then `ready`).
 *
 * The transcoder is scripted per-attempt with an arbitrary sequence of
 * outcomes (throw / return-invalid / return-valid) and an arbitrary
 * `maxAttempts`, so the generated runs cover the queued, processing, ready, and
 * failed transitions in many orderings and combinations. Whatever the outcome,
 * every emitted event's `status` must be a member of the defined set.
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
  MIN_ABR_RENDITIONS,
  type ProcessingStatusEvent,
  type ProcessingStore,
  type Transcoder,
  type TranscodeOutput,
} from "./pipeline.js";

/** The only status values R8.5 permits a processing-status event to carry. */
const DEFINED_STATUSES = ["queued", "processing", "ready", "failed"] as const;
const DEFINED_STATUS_SET = new Set<string>(DEFINED_STATUSES);

/** A fixed clock so timestamps are deterministic under test. */
const fixedClock = { now: () => new Date("2024-01-01T00:00:00.000Z") };

/** Sequential id generator so persisted-record ids are stable and unique. */
function seqIds(): () => string {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

/**
 * In-memory {@link ProcessingStore}. Only status transitions matter for this
 * property; Asset/Rendition inserts are captured but unused.
 */
function makeStore(initial: VideoRecord): ProcessingStore {
  let video = initial;
  const assets: AssetRecord[] = [];
  const renditions: RenditionRecord[] = [];
  return {
    findVideo: async (organizationId, videoId) =>
      video.organizationId === organizationId && video.id === videoId
        ? video
        : null,
    findVideoById: async (videoId) => (video.id === videoId ? video : null),
    setVideoStatus: async (v, status) => {
      video = { ...v, status };
      return video;
    },
    insertAsset: async (record) => {
      assets.push(record);
      return record;
    },
    insertRendition: async (record) => {
      renditions.push(record);
      return record;
    },
  };
}

/** A valid transcode output (exactly one thumbnail, 3-10s preview, >=3 renditions). */
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

/**
 * An invalid transcode output: a preview outside the permitted 3-10s window,
 * which the pipeline treats as a failed attempt.
 */
function invalidOutput(): TranscodeOutput {
  return { ...validOutput(), preview: { objectKey: "bad.mp4", durationSeconds: 30 } };
}

/** Per-attempt outcome the scripted transcoder should produce. */
type Outcome = "throw" | "invalid" | "valid";

const outcomeArb: fc.Arbitrary<Outcome> = fc.constantFrom(
  "throw",
  "invalid",
  "valid",
);

/**
 * A transcoder scripted with a per-attempt outcome sequence. Attempts beyond
 * the script repeat the last outcome, so the transcoder is total for any
 * number of attempts the pipeline chooses to make.
 */
function scriptedTranscoder(outcomes: readonly Outcome[]): Transcoder {
  let call = 0;
  return {
    transcode: async () => {
      const outcome = outcomes[Math.min(call, outcomes.length - 1)] ?? "throw";
      call += 1;
      if (outcome === "throw") throw new Error("transcode-failed");
      if (outcome === "invalid") return invalidOutput();
      return validOutput();
    },
  };
}

/** Arbitrary Video record covering varied durations, folders, and dev mode. */
const videoArb: fc.Arbitrary<VideoRecord> = fc
  .record({
    id: fc.uuid(),
    organizationId: fc.uuid(),
    folderId: fc.option(fc.uuid(), { nil: null }),
    title: fc.string({ minLength: 1, maxLength: 80 }),
    durationSeconds: fc.integer({ min: 1, max: 100_000 }),
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

describe("Feature: streetstudio, Property 25: Processing status events use only defined status values", () => {
  it("emits only queued|processing|ready|failed across arbitrary runs (including failures)", async () => {
    await fc.assert(
      fc.asyncProperty(
        videoArb,
        // Arbitrary per-attempt outcome sequence exercising success, retries,
        // invalid output, and exhausted-failure paths.
        fc.array(outcomeArb, { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 1, max: 5 }),
        // Whether to enqueue (emits `queued`) before processing.
        fc.boolean(),
        async (video, outcomes, maxAttempts, doEnqueue) => {
          const store = makeStore(video);
          const events: ProcessingStatusEvent[] = [];
          const pipeline = new MediaPipeline({
            store,
            queue: { enqueue: () => {} },
            transcoder: scriptedTranscoder(outcomes),
            emitter: { emit: (e) => void events.push(e) },
            options: { clock: fixedClock, newId: seqIds(), maxAttempts },
          });

          if (doEnqueue) {
            await pipeline.enqueue(video.id);
          }
          await pipeline.process({
            videoId: video.id,
            organizationId: video.organizationId,
          });

          // The run must have produced at least one status event.
          expect(events.length).toBeGreaterThan(0);

          // R8.5: every emitted event uses only a defined status value.
          for (const e of events) {
            expect(DEFINED_STATUS_SET.has(e.status)).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
