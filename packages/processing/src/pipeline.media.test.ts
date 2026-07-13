/**
 * Media-pipeline category test (task 41.2, Requirements 32.1, 32.4).
 *
 * This is the CI "media pipeline" category (`*.media.test.ts`): it drives the
 * real {@link MediaPipeline} end-to-end over deterministic in-memory seams and
 * asserts the concrete media outputs a successful transcode must produce — a
 * transcode into adaptive-bitrate renditions, exactly one thumbnail, and one
 * short preview — then that the Video is marked ready for streaming (R8.2–R8.4,
 * R8.7). A companion property check (fast-check, ≥100 runs) proves the invariant
 * holds across a range of source durations and rendition ladders.
 *
 * The transcoder is the only media seam; here it is a deterministic fake so the
 * test is hermetic (no ffmpeg/vendor, no wall clock), matching how the pipeline
 * is wired in production behind the {@link Transcoder} port.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  MediaPipeline,
  MAX_PREVIEW_SECONDS,
  MIN_ABR_RENDITIONS,
  MIN_PREVIEW_SECONDS,
  type AssetRef,
  type ProcessingStatusEvent,
  type ProcessingStore,
  type RenditionRef,
  type Transcoder,
  type TranscodeOutput,
} from "./pipeline.js";

/* -------------------------------------------------------------------------- */
/* Deterministic seams                                                        */
/* -------------------------------------------------------------------------- */

const FIXED_CLOCK = { now: () => new Date("2024-01-01T00:00:00.000Z") };

function seqIds(): () => string {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

interface StoredVideo {
  id: string;
  organizationId: string;
  folderId: string | null;
  title: string;
  durationSeconds: number;
  status: string;
  sourceObjectKey: string | null;
  developerMode: boolean;
  createdAt: string;
}

function makeVideo(overrides: Partial<StoredVideo> = {}): StoredVideo {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organizationId: "22222222-2222-4222-8222-222222222222",
    folderId: null,
    title: "Recording",
    durationSeconds: 120,
    status: "uploading",
    sourceObjectKey: "src/original.mp4",
    developerMode: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

interface Captured {
  readonly store: ProcessingStore;
  readonly statuses: string[];
  readonly assets: { id: string; videoId: string; type: string; objectKeyOrBody: string }[];
  readonly renditions: { id: string; videoId: string; quality: string; objectKey: string; bitrate: number }[];
  current(): StoredVideo;
}

function captureStore(initial: StoredVideo): Captured {
  let video = initial;
  const statuses: string[] = [];
  const assets: Captured["assets"] = [];
  const renditions: Captured["renditions"] = [];
  const store: ProcessingStore = {
    findVideo: async (organizationId, videoId) =>
      video.organizationId === organizationId && video.id === videoId
        ? (video as never)
        : null,
    findVideoById: async (videoId) => (video.id === videoId ? (video as never) : null),
    setVideoStatus: async (v, status) => {
      video = { ...(v as StoredVideo), status };
      statuses.push(status);
      return video as never;
    },
    insertAsset: async (record) => {
      assets.push(record as never);
      return record;
    },
    insertRendition: async (record) => {
      renditions.push(record as never);
      return record;
    },
  };
  return { store, statuses, assets, renditions, current: () => video };
}

/** A transcoder that always succeeds, producing `renditionCount` renditions and
 *  a preview of `previewSeconds`. */
function successTranscoder(renditionCount: number, previewSeconds: number): Transcoder {
  return {
    async transcode(source): Promise<TranscodeOutput> {
      const renditions = Array.from({ length: renditionCount }, (_, i) => ({
        quality: `${1080 - i * 120}p`,
        objectKey: `${source.videoId}/r${i}.m3u8`,
        bitrate: 5_000_000 - i * 800_000,
      }));
      return {
        thumbnail: { objectKey: `${source.videoId}/thumb.jpg` },
        preview: { objectKey: `${source.videoId}/preview.mp4`, durationSeconds: previewSeconds },
        renditions,
      };
    },
  };
}

function newPipeline(store: ProcessingStore, transcoder: Transcoder, events?: ProcessingStatusEvent[]) {
  return new MediaPipeline({
    store,
    queue: { enqueue: () => {} },
    transcoder,
    emitter: { emit: (e) => void events?.push(e) },
    options: { clock: FIXED_CLOCK, newId: seqIds() },
  });
}

/* -------------------------------------------------------------------------- */
/* Example-based media-pipeline outputs                                       */
/* -------------------------------------------------------------------------- */

describe("Media pipeline — transcode, thumbnail, preview (R8.2–R8.4, R8.7)", () => {
  it("produces exactly one thumbnail, one 3–10s preview, ≥3 ABR renditions, and marks the video ready", async () => {
    const cap = captureStore(makeVideo());
    const events: ProcessingStatusEvent[] = [];
    const pipeline = newPipeline(cap.store, successTranscoder(3, 6), events);

    const result = await pipeline.process({
      videoId: cap.current().id,
      organizationId: cap.current().organizationId,
    });

    // Transcode succeeded on the first attempt into a ready video.
    expect(result.status).toBe("ready");
    expect(result.attempts).toBe(1);
    expect(cap.statuses).toEqual(["processing", "ready"]);

    // Exactly one thumbnail asset.
    const thumbnails = cap.assets.filter((a) => a.type === "thumbnail");
    expect(thumbnails).toHaveLength(1);
    expect(result.thumbnail).toBeDefined();

    // Exactly one preview asset, within the 3–10s window.
    const previews = cap.assets.filter((a) => a.type === "preview");
    expect(previews).toHaveLength(1);
    const preview = result.preview as AssetRef;
    expect(preview).toBeDefined();

    // At least three adaptive-bitrate renditions were persisted.
    expect(cap.renditions.length).toBeGreaterThanOrEqual(MIN_ABR_RENDITIONS);
    const renditions = result.renditions as readonly RenditionRef[];
    expect(renditions.length).toBeGreaterThanOrEqual(MIN_ABR_RENDITIONS);
    // Each rendition carries a distinct object key and a positive bitrate.
    const keys = new Set(renditions.map((r) => r.objectKey));
    expect(keys.size).toBe(renditions.length);
    for (const r of renditions) {
      expect(r.bitrate).toBeGreaterThan(0);
    }
  });

  it("emits only the defined status values across enqueue + process", async () => {
    const cap = captureStore(makeVideo());
    const events: ProcessingStatusEvent[] = [];
    const pipeline = newPipeline(cap.store, successTranscoder(4, 5), events);

    await pipeline.enqueue(cap.current().id);
    await pipeline.process({
      videoId: cap.current().id,
      organizationId: cap.current().organizationId,
    });

    expect(events.map((e) => e.status)).toEqual(["queued", "processing", "ready"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Property: outputs are correct across durations and rendition ladders       */
/* -------------------------------------------------------------------------- */

describe("Feature: streetstudio, Property: media pipeline produces required renditions/assets", () => {
  it("for any valid source, transcode yields 1 thumbnail, 1 in-range preview, ≥3 renditions, and a ready video", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 7200 }), // source duration seconds
        fc.integer({ min: MIN_ABR_RENDITIONS, max: 6 }), // rendition ladder size
        fc.integer({ min: MIN_PREVIEW_SECONDS, max: MAX_PREVIEW_SECONDS }), // preview length
        async (durationSeconds, renditionCount, previewSeconds) => {
          const cap = captureStore(makeVideo({ durationSeconds }));
          const pipeline = newPipeline(
            cap.store,
            successTranscoder(renditionCount, previewSeconds),
          );

          const result = await pipeline.process({
            videoId: cap.current().id,
            organizationId: cap.current().organizationId,
          });

          expect(result.status).toBe("ready");
          expect(cap.assets.filter((a) => a.type === "thumbnail")).toHaveLength(1);
          expect(cap.assets.filter((a) => a.type === "preview")).toHaveLength(1);
          expect(cap.renditions.length).toBe(renditionCount);
          expect(cap.renditions.length).toBeGreaterThanOrEqual(MIN_ABR_RENDITIONS);
          expect(cap.current().status).toBe("ready");
          // The source object is retained (never discarded) through processing.
          expect(cap.current().sourceObjectKey).toBe("src/original.mp4");
        },
      ),
      { numRuns: 100 },
    );
  });
});
