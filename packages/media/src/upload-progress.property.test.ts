import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createHash } from "node:crypto";
import type { Clock } from "@streetstudio/auth";
import type {
  UploadSessionRecord,
  VideoRecord,
} from "@streetstudio/database";

import {
  UploadService,
  MIN_CHUNK_BYTES,
  MAX_CHUNK_BYTES,
  type AssembledObject,
  type ChunkStorage,
  type UploadChunk,
  type UploadProgressEmitter,
  type UploadProgressEvent,
  type UploadStore,
} from "./upload.js";

/**
 * Property 23: Upload progress reflects acknowledged chunk count.
 *
 * Feature: streetstudio, Property 23: Upload progress reflects acknowledged chunk count
 *
 * Validates: Requirements 7.7
 *
 * For any sequence of chunk acknowledgments, an upload-progress event is emitted
 * on each chunk acknowledgment reporting the count of acknowledged chunks
 * relative to the total expected chunks. Across an arbitrary ordered upload the
 * emitted acknowledged counts are exactly 1, 2, ..., total (one per ack,
 * strictly monotonic) with the reported total held constant, and an idempotent
 * re-acknowledgment of an already-acknowledged chunk emits a progress event that
 * does not advance the reported acknowledged count.
 */

/* -------------------------------------------------------------------------
 * Test doubles (mirror packages/media/src/upload.test.ts)
 * ---------------------------------------------------------------------- */

/** A mutable clock so the 24h lifetime is deterministic. */
function mutableClock(startIso: string): Clock & { set(iso: string): void } {
  let current = new Date(startIso);
  return {
    now: () => new Date(current),
    set(iso: string) {
      current = new Date(iso);
    },
  };
}

/** In-memory {@link UploadStore} over plain maps. */
function memoryStore(video: VideoRecord): UploadStore & {
  sessions: Map<string, UploadSessionRecord>;
  videos: Map<string, VideoRecord>;
} {
  const sessions = new Map<string, UploadSessionRecord>();
  const videos = new Map<string, VideoRecord>([[video.id, { ...video }]]);
  return {
    sessions,
    videos,
    async insertSession(record) {
      sessions.set(record.id, { ...record });
      return record;
    },
    async findSession(id) {
      const found = sessions.get(id);
      return found ? { ...found } : null;
    },
    async updateSession(record) {
      sessions.set(record.id, { ...record });
      return record;
    },
    async findVideo(orgId, videoId) {
      const found = videos.get(videoId);
      return found && found.organizationId === orgId ? { ...found } : null;
    },
    async updateVideo(record) {
      videos.set(record.id, { ...record });
      return record;
    },
  };
}

/** In-memory {@link ChunkStorage} that concatenates staged bytes. */
function memoryChunkStorage(): ChunkStorage & {
  staged: Map<string, Map<number, Uint8Array>>;
  discarded: Set<string>;
} {
  const staged = new Map<string, Map<number, Uint8Array>>();
  const discarded = new Set<string>();
  return {
    staged,
    discarded,
    async put(sessionId, index, data) {
      let perSession = staged.get(sessionId);
      if (!perSession) {
        perSession = new Map();
        staged.set(sessionId, perSession);
      }
      perSession.set(index, data);
    },
    async assemble(sessionId, totalChunks): Promise<AssembledObject> {
      const perSession = staged.get(sessionId) ?? new Map();
      let size = 0;
      for (let i = 0; i < totalChunks; i++) {
        size += (perSession.get(i) ?? new Uint8Array()).byteLength;
      }
      return { key: `uploads/${sessionId}/source`, sizeBytes: size };
    },
    async discard(sessionId) {
      discarded.add(sessionId);
      staged.delete(sessionId);
    },
  };
}

/** Collecting emitter that records every emitted progress event. */
function collectingEmitter(): UploadProgressEmitter & {
  events: UploadProgressEvent[];
} {
  const events: UploadProgressEvent[] = [];
  return {
    events,
    emit(event) {
      events.push(event);
    },
  };
}

const ORG = "11111111-1111-4111-8111-111111111111";
const VIDEO_ID = "22222222-2222-4222-8222-222222222222";
const START = "2024-01-01T00:00:00.000Z";

function makeVideo(): VideoRecord {
  return {
    id: VIDEO_ID,
    organizationId: ORG,
    folderId: null,
    title: "clip",
    durationSeconds: 12,
    status: "uploading",
    sourceObjectKey: null,
    developerMode: false,
    createdAt: START,
  };
}

/** Build a chunk whose checksum matches its bytes under the default verifier. */
function chunk(index: number, sizeBytes: number): UploadChunk {
  const data = new TextEncoder().encode(`chunk-${index}`);
  const checksum = createHash("sha256").update(data).digest("hex");
  return { index, sizeBytes, data, checksum };
}

interface Harness {
  service: UploadService;
  store: ReturnType<typeof memoryStore>;
  chunks: ReturnType<typeof memoryChunkStorage>;
  emitter: ReturnType<typeof collectingEmitter>;
  clock: ReturnType<typeof mutableClock>;
}

function harness(): Harness {
  const store = memoryStore(makeVideo());
  const chunks = memoryChunkStorage();
  const emitter = collectingEmitter();
  const clock = mutableClock(START);
  let idCounter = 0;
  const service = new UploadService({
    store,
    chunkStorage: chunks,
    progressEmitter: emitter,
    clock,
    newId: () => `session-${++idCounter}` as never,
  });
  return { service, store, chunks, emitter, clock };
}

const ACTOR = { memberId: "m" as never };

/** A declared chunk size somewhere inside the accepted [1 MB, 100 MB] window. */
const validSize = fc.integer({ min: MIN_CHUNK_BYTES, max: MAX_CHUNK_BYTES });

describe("Feature: streetstudio, Property 23: Upload progress reflects acknowledged chunk count", () => {
  // Sub-property A: acknowledging an arbitrary ordered upload emits exactly one
  // progress event per ack, whose acknowledged counts are 1, 2, ..., total
  // (strictly monotonic, one per ack) with the reported total held constant and
  // scoped to the correct session/video/org.
  it("emits one progress event per ack with acknowledged counts 1..total and constant total", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 12 }), // total chunks
        validSize,
        async (total, size) => {
          const { service, emitter } = harness();

          const session = await service.initSession(ACTOR, {
            organizationId: ORG,
            videoId: VIDEO_ID,
            totalChunks: total,
          });

          for (let i = 0; i < total; i++) {
            const ack = await service.putChunk(session.id, chunk(i, size));
            expect(ack.alreadyAcknowledged).toBe(false);
            expect(ack.acknowledged).toBe(i + 1);
          }

          // Exactly one progress event was emitted per acknowledgment.
          expect(emitter.events).toHaveLength(total);

          // The reported acknowledged counts are exactly 1, 2, ..., total.
          expect(emitter.events.map((e) => e.acknowledged)).toEqual(
            Array.from({ length: total }, (_, i) => i + 1),
          );

          // Every event reports the constant total and is scoped correctly.
          for (const event of emitter.events) {
            expect(event.total).toBe(total);
            expect(event.sessionId).toBe(session.id);
            expect(event.videoId).toBe(VIDEO_ID);
            expect(event.organizationId).toBe(ORG);
            // Progress reflects a real fraction of the expected work.
            expect(event.acknowledged).toBeGreaterThanOrEqual(1);
            expect(event.acknowledged).toBeLessThanOrEqual(event.total);
          }

          // The acknowledged count is strictly increasing across the sequence.
          for (let i = 1; i < emitter.events.length; i++) {
            expect(emitter.events[i]!.acknowledged).toBe(
              emitter.events[i - 1]!.acknowledged + 1,
            );
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // Sub-property B: an idempotent re-acknowledgment of an already-acknowledged
  // chunk still emits a progress event, but it does NOT advance the reported
  // acknowledged count — the last progressing value stands and total is unchanged.
  it("does not advance the reported acknowledged count on idempotent re-acks", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }), // total chunks
        fc.integer({ min: 1, max: 10 }), // prefix length (>= 1 so an ack exists)
        validSize,
        fc.array(fc.nat(), { minLength: 1, maxLength: 8 }), // replayed-index picks
        async (total, prefixRequest, size, picks) => {
          const { service, emitter } = harness();
          const prefix = Math.min(prefixRequest, total);

          const session = await service.initSession(ACTOR, {
            organizationId: ORG,
            videoId: VIDEO_ID,
            totalChunks: total,
          });

          for (let i = 0; i < prefix; i++) {
            await service.putChunk(session.id, chunk(i, size));
          }

          const progressingAcks = emitter.events.length;
          expect(progressingAcks).toBe(prefix);
          // The last progressing value is the prefix length.
          expect(emitter.events.at(-1)!.acknowledged).toBe(prefix);

          // Replay already-acknowledged chunks (index < prefix) repeatedly.
          for (const pick of picks) {
            const index = pick % prefix;
            const replay = await service.putChunk(session.id, chunk(index, size));
            expect(replay.alreadyAcknowledged).toBe(true);
          }

          // Each replay still emits a progress event...
          expect(emitter.events).toHaveLength(prefix + picks.length);

          // ...but no event past the progressing prefix advances the count:
          // every replay reports the same acknowledged prefix and constant total.
          for (let i = prefix; i < emitter.events.length; i++) {
            expect(emitter.events[i]!.acknowledged).toBe(prefix);
            expect(emitter.events[i]!.total).toBe(total);
          }

          // The reported acknowledged count is non-decreasing overall and never
          // exceeds the number of genuine acknowledgments.
          let previous = 0;
          for (const event of emitter.events) {
            expect(event.acknowledged).toBeGreaterThanOrEqual(previous);
            expect(event.acknowledged).toBeLessThanOrEqual(prefix);
            previous = event.acknowledged;
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
