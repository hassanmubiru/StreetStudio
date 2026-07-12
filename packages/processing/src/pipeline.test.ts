/**
 * Unit sanity checks for the Media Processing Pipeline (task 16.1).
 *
 * These are example-based checks over the pipeline's core behavior using
 * in-memory seams. The exhaustive property-based tests for required outputs,
 * status values, and bounded failures live in tasks 16.2–16.4.
 */
import { describe, expect, it } from "vitest";
import type { AssetRecord, RenditionRecord, VideoRecord } from "@streetstudio/database";
import { AppError } from "@streetstudio/shared";
import {
  MediaPipeline,
  MIN_ABR_RENDITIONS,
  type ProcessingJob,
  type ProcessingStatusEvent,
  type ProcessingStore,
  type Transcoder,
  type TranscodeOutput,
} from "./pipeline.js";

/** A fixed clock for deterministic timestamps. */
const fixedClock = { now: () => new Date("2024-01-01T00:00:00.000Z") };

/** Sequential id generator so assertions are stable. */
function seqIds(): () => string {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

function makeVideo(overrides: Partial<VideoRecord> = {}): VideoRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organizationId: "22222222-2222-4222-8222-222222222222",
    folderId: null,
    title: "Demo",
    durationSeconds: 120,
    status: "uploading",
    sourceObjectKey: "src/original.mp4",
    developerMode: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** In-memory store capturing status transitions and persisted outputs. */
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

function goodOutput(): TranscodeOutput {
  return {
    thumbnail: { objectKey: "thumb.jpg" },
    preview: { objectKey: "preview.mp4", durationSeconds: 6 },
    renditions: [
      { quality: "1080p", objectKey: "r1.m3u8", bitrate: 5_000_000 },
      { quality: "720p", objectKey: "r2.m3u8", bitrate: 2_800_000 },
      { quality: "480p", objectKey: "r3.m3u8", bitrate: 1_400_000 },
    ],
  };
}

const okTranscoder = (output: TranscodeOutput): Transcoder => ({
  transcode: async () => output,
});

describe("MediaPipeline.enqueue", () => {
  it("marks the video queued, enqueues a job, and emits a queued transition", async () => {
    const { store, statuses } = makeStore(makeVideo());
    const jobs: ProcessingJob[] = [];
    const events: ProcessingStatusEvent[] = [];
    const pipeline = new MediaPipeline({
      store,
      queue: { enqueue: (job) => void jobs.push(job) },
      transcoder: okTranscoder(goodOutput()),
      emitter: { emit: (e) => void events.push(e) },
      options: { clock: fixedClock, newId: seqIds() },
    });

    await pipeline.enqueue("11111111-1111-4111-8111-111111111111");

    expect(statuses).toEqual(["queued"]);
    expect(jobs).toHaveLength(1);
    expect(events.map((e) => e.status)).toEqual(["queued"]);
  });

  it("rejects an unknown video with NOT_FOUND", async () => {
    const { store } = makeStore(makeVideo());
    const pipeline = new MediaPipeline({
      store,
      queue: { enqueue: () => {} },
      transcoder: okTranscoder(goodOutput()),
      emitter: { emit: () => {} },
      options: { clock: fixedClock, newId: seqIds() },
    });
    await expect(pipeline.enqueue("deadbeef-dead-4ead-8ead-deaddeaddead")).rejects.toBeInstanceOf(
      AppError,
    );
  });
});

describe("MediaPipeline.process (success)", () => {
  it("produces one thumbnail, one preview, >=3 renditions, and marks ready", async () => {
    const video = makeVideo();
    const { store, statuses, assets, renditions } = makeStore(video);
    const events: ProcessingStatusEvent[] = [];
    const pipeline = new MediaPipeline({
      store,
      queue: { enqueue: () => {} },
      transcoder: okTranscoder(goodOutput()),
      emitter: { emit: (e) => void events.push(e) },
      options: { clock: fixedClock, newId: seqIds() },
    });

    const result = await pipeline.process({
      videoId: video.id,
      organizationId: video.organizationId,
    });

    expect(result.status).toBe("ready");
    expect(result.attempts).toBe(1);
    expect(assets.filter((a) => a.type === "thumbnail")).toHaveLength(1);
    expect(assets.filter((a) => a.type === "preview")).toHaveLength(1);
    expect(renditions.length).toBeGreaterThanOrEqual(MIN_ABR_RENDITIONS);
    expect(statuses).toEqual(["processing", "ready"]);
    expect(events.map((e) => e.status)).toEqual(["processing", "ready"]);
  });
});

describe("MediaPipeline.process (failure)", () => {
  it("retries up to maxAttempts, then records failure and retains the source", async () => {
    const video = makeVideo();
    const { store, statuses, current } = makeStore(video);
    const events: ProcessingStatusEvent[] = [];
    let calls = 0;
    const failingTranscoder: Transcoder = {
      transcode: async () => {
        calls += 1;
        throw new Error("boom");
      },
    };
    const pipeline = new MediaPipeline({
      store,
      queue: { enqueue: () => {} },
      transcoder: failingTranscoder,
      emitter: { emit: (e) => void events.push(e) },
      options: { clock: fixedClock, newId: seqIds(), maxAttempts: 3 },
    });

    const result = await pipeline.process({
      videoId: video.id,
      organizationId: video.organizationId,
    });

    expect(result.status).toBe("failed");
    expect(result.attempts).toBe(3);
    expect(calls).toBe(3);
    expect(statuses).toEqual(["processing", "failed"]);
    const failEvent = events.at(-1);
    expect(failEvent?.status).toBe("failed");
    expect(failEvent?.failed).toBe(true);
    // Source media is retained on failure (R8.6).
    expect(current().sourceObjectKey).toBe("src/original.mp4");
  });

  it("treats an invalid preview duration as a failed attempt", async () => {
    const video = makeVideo();
    const { store, statuses } = makeStore(video);
    const badOutput: TranscodeOutput = {
      ...goodOutput(),
      preview: { objectKey: "preview.mp4", durationSeconds: 30 },
    };
    const pipeline = new MediaPipeline({
      store,
      queue: { enqueue: () => {} },
      transcoder: okTranscoder(badOutput),
      emitter: { emit: () => {} },
      options: { clock: fixedClock, newId: seqIds(), maxAttempts: 2 },
    });

    const result = await pipeline.process({
      videoId: video.id,
      organizationId: video.organizationId,
    });

    expect(result.status).toBe("failed");
    expect(statuses).toEqual(["processing", "failed"]);
  });

  it("treats fewer than 3 renditions as a failed attempt", async () => {
    const video = makeVideo();
    const { store } = makeStore(video);
    const badOutput: TranscodeOutput = {
      ...goodOutput(),
      renditions: goodOutput().renditions.slice(0, 2),
    };
    const pipeline = new MediaPipeline({
      store,
      queue: { enqueue: () => {} },
      transcoder: okTranscoder(badOutput),
      emitter: { emit: () => {} },
      options: { clock: fixedClock, newId: seqIds(), maxAttempts: 1 },
    });

    const result = await pipeline.process({
      videoId: video.id,
      organizationId: video.organizationId,
    });
    expect(result.status).toBe("failed");
  });

  it("emits only defined status values across a full run", async () => {
    const video = makeVideo();
    const { store } = makeStore(video);
    const events: ProcessingStatusEvent[] = [];
    const pipeline = new MediaPipeline({
      store,
      queue: { enqueue: () => {} },
      transcoder: okTranscoder(goodOutput()),
      emitter: { emit: (e) => void events.push(e) },
      options: { clock: fixedClock, newId: seqIds() },
    });
    await pipeline.enqueue(video.id);
    await pipeline.process({ videoId: video.id, organizationId: video.organizationId });
    const allowed = new Set(["queued", "processing", "ready", "failed"]);
    for (const e of events) {
      expect(allowed.has(e.status)).toBe(true);
    }
  });
});
