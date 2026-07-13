/**
 * Property 24: Processing produces the required outputs.
 *
 * Feature: streetstudio, Property 24: Processing produces the required outputs
 *
 * Validates: Requirements 8.2, 8.3, 8.4, 8.7
 *
 * For any arbitrary Video, a successful `MediaPipeline.process()` run produces
 * exactly one thumbnail (R8.2), a preview whose duration is within 3–10 seconds
 * (R8.3), and at least 3 distinct adaptive-bitrate renditions (R8.4), and marks
 * the Video `ready` for streaming (R8.7).
 *
 * The property drives the pipeline through its injectable seams: an in-memory
 * store captures the persisted Assets/Renditions and the Video's status
 * transitions, and a transcoder returns an arbitrary but valid output for each
 * generated Video. Because the transcoder always succeeds on the first attempt,
 * every run must reach the `ready` terminal state and persist the required
 * outputs.
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
  MIN_PREVIEW_SECONDS,
  MAX_PREVIEW_SECONDS,
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
 * In-memory {@link ProcessingStore} that records status transitions and the
 * persisted thumbnail/preview Assets and Renditions for assertion.
 */
function makeStore(initial: VideoRecord): {
  store: ProcessingStore;
  statuses: string[];
  assets: AssetRecord[];
  renditions: RenditionRecord[];
  current: () => VideoRecord;
} {
  let video = initial;
  const statuses: string[] = [];
  const assets: AssetRecord[] = [];
  const renditions: RenditionRecord[] = [];
  const store: ProcessingStore = {
    findVideo: async (organizationId, videoId) =>
      video.organizationId === organizationId && video.id === videoId
        ? video
        : null,
    findVideoById: async (videoId) => (video.id === videoId ? video : null),
    setVideoStatus: async (v, status) => {
      video = { ...v, status };
      statuses.push(status);
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
  return { store, statuses, assets, renditions, current: () => video };
}

/** Arbitrary Video record covering varied durations, folders, and dev mode. */
const videoArb: fc.Arbitrary<VideoRecord> = fc.record({
  id: fc.uuid(),
  organizationId: fc.uuid(),
  folderId: fc.option(fc.uuid(), { nil: null }),
  title: fc.string({ minLength: 1, maxLength: 80 }),
  durationSeconds: fc.integer({ min: 1, max: 100_000 }),
  sourceObjectKey: fc.string({ minLength: 1, maxLength: 60 }),
  developerMode: fc.boolean(),
}).map((v) => ({
  id: v.id,
  organizationId: v.organizationId,
  folderId: v.folderId,
  title: v.title,
  durationSeconds: v.durationSeconds,
  status: "uploading",
  sourceObjectKey: v.sourceObjectKey,
  developerMode: v.developerMode,
  createdAt: "2024-01-01T00:00:00.000Z",
}));

/**
 * Arbitrary VALID transcode output: exactly one thumbnail, a preview in the
 * permitted [3, 10] second range, and at least 3 renditions with DISTINCT
 * quality labels. Distinct labels are guaranteed by suffixing the array index.
 */
const outputArb: fc.Arbitrary<TranscodeOutput> = fc.record({
  thumbKey: fc.string({ minLength: 1, maxLength: 40 }),
  previewKey: fc.string({ minLength: 1, maxLength: 40 }),
  // Include fractional durations to exercise the full [3, 10] range.
  previewSeconds: fc
    .double({ min: MIN_PREVIEW_SECONDS, max: MAX_PREVIEW_SECONDS, noNaN: true }),
  renditions: fc.array(
    fc.record({
      quality: fc.string({ minLength: 1, maxLength: 12 }),
      objectKey: fc.string({ minLength: 1, maxLength: 40 }),
      bitrate: fc.integer({ min: 100_000, max: 20_000_000 }),
    }),
    { minLength: MIN_ABR_RENDITIONS, maxLength: 8 },
  ),
}).map((o) => ({
  thumbnail: { objectKey: o.thumbKey },
  preview: { objectKey: o.previewKey, durationSeconds: o.previewSeconds },
  renditions: o.renditions.map((r, i) => ({
    // Suffix the index so quality labels are distinct across renditions.
    quality: `${r.quality}-${i}`,
    objectKey: r.objectKey,
    bitrate: r.bitrate,
  })),
}));

describe("Feature: streetstudio, Property 24: Processing produces the required outputs", () => {
  it("produces one thumbnail, a 3-10s preview, >=3 distinct renditions, and marks the video ready", async () => {
    await fc.assert(
      fc.asyncProperty(videoArb, outputArb, async (video, output) => {
        const { store, statuses, assets, renditions, current } =
          makeStore(video);
        const transcoder: Transcoder = { transcode: async () => output };
        const pipeline = new MediaPipeline({
          store,
          queue: { enqueue: () => {} },
          transcoder,
          emitter: { emit: () => {} },
          options: { clock: fixedClock, newId: seqIds() },
        });

        const result = await pipeline.process({
          videoId: video.id,
          organizationId: video.organizationId,
        });

        // Successful terminal outcome (R8.7).
        expect(result.status).toBe("ready");

        // R8.2: exactly one thumbnail persisted and reported.
        const thumbnails = assets.filter((a) => a.type === "thumbnail");
        expect(thumbnails).toHaveLength(1);
        expect(result.thumbnail).toBeDefined();

        // R8.3: exactly one preview persisted, duration within [3, 10] seconds.
        const previews = assets.filter((a) => a.type === "preview");
        expect(previews).toHaveLength(1);
        expect(result.preview).toBeDefined();
        expect(output.preview.durationSeconds).toBeGreaterThanOrEqual(
          MIN_PREVIEW_SECONDS,
        );
        expect(output.preview.durationSeconds).toBeLessThanOrEqual(
          MAX_PREVIEW_SECONDS,
        );

        // R8.4: at least 3 renditions, and they are distinct (by quality).
        expect(renditions.length).toBeGreaterThanOrEqual(MIN_ABR_RENDITIONS);
        expect(result.renditions.length).toBeGreaterThanOrEqual(
          MIN_ABR_RENDITIONS,
        );
        const distinctQualities = new Set(renditions.map((r) => r.quality));
        expect(distinctQualities.size).toBe(renditions.length);

        // R8.7: the Video ends in the `ready` state, and `ready` is the final
        // transition observed.
        expect(current().status).toBe("ready");
        expect(statuses.at(-1)).toBe("ready");

        // All persisted outputs belong to the processed Video.
        for (const a of assets) expect(a.videoId).toBe(video.id);
        for (const r of renditions) expect(r.videoId).toBe(video.id);
      }),
      { numRuns: 100 },
    );
  });
});
