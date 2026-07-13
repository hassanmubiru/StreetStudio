import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createHash } from "node:crypto";
import { AppError } from "@streetstudio/shared";
import type { Clock } from "@streetstudio/auth";
import type {
  UploadSessionRecord,
  VideoRecord,
} from "@streetstudio/database";

import {
  UploadService,
  MIN_CHUNK_BYTES,
  MAX_CHUNK_BYTES,
  UPLOAD_SESSION_LIFETIME_MS,
  type AssembledObject,
  type ChunkStorage,
  type UploadChunk,
  type UploadProgressEmitter,
  type UploadProgressEvent,
  type UploadStore,
} from "./upload.js";

/**
 * Property 19: Interrupted uploads resume without retransmitting acknowledged
 * chunks.
 *
 * Feature: streetstudio, Property 19: Interrupted uploads resume without retransmitting acknowledged chunks
 *
 * Validates: Requirements 7.2
 *
 * For any partially uploaded Video resumed within the 24-hour session lifetime,
 * transmission continues from the chunk immediately following the last
 * acknowledged chunk (status.nextExpectedIndex), and no already-acknowledged
 * chunk is re-transmitted or re-persisted: a retransmitted acknowledged chunk is
 * idempotently re-acked (alreadyAcknowledged) and staged only once, while an
 * out-of-order gap ahead of the next expected index is rejected without
 * mutating session state.
 */

/* -------------------------------------------------------------------------
 * Test doubles (mirrors packages/media/src/upload.test.ts, with per-chunk
 * put-call counting so we can assert acknowledged chunks are never re-persisted)
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

/**
 * In-memory {@link ChunkStorage} that concatenates staged bytes and, in
 * addition to the standard double, records how many times each chunk index was
 * persisted so the "never re-persisted" invariant is observable.
 */
function memoryChunkStorage(): ChunkStorage & {
  staged: Map<string, Map<number, Uint8Array>>;
  discarded: Set<string>;
  putCalls: Map<string, number>;
} {
  const staged = new Map<string, Map<number, Uint8Array>>();
  const discarded = new Set<string>();
  const putCalls = new Map<string, number>();
  return {
    staged,
    discarded,
    putCalls,
    async put(sessionId, index, data) {
      const key = `${sessionId}:${index}`;
      putCalls.set(key, (putCalls.get(key) ?? 0) + 1);
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

/** Collecting emitter. */
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
const START_MS = new Date(START).getTime();

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

/**
 * A resume gap strictly shorter than the 24h lifetime keeps the session alive:
 * expiry resets to now + 24h on each ack, so any advance below the lifetime is
 * within the window (`isExpired` triggers only at or past the deadline).
 */
const resumeGapMs = fc.integer({ min: 0, max: UPLOAD_SESSION_LIFETIME_MS - 1 });

/** A declared chunk size somewhere inside the accepted [1 MB, 100 MB] window. */
const validSize = fc.integer({ min: MIN_CHUNK_BYTES, max: MAX_CHUNK_BYTES });

describe("Feature: streetstudio, Property 19: Interrupted uploads resume without retransmitting acknowledged chunks", () => {
  // Sub-property A: after acknowledging a prefix, status.nextExpectedIndex is
  // the chunk after the last ack, and resuming from there (within the lifetime)
  // completes the upload while persisting every chunk exactly once.
  it("resumes from nextExpectedIndex within the lifetime, persisting each chunk once", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 8 }), // total chunks
        fc.integer({ min: 0, max: 8 }), // requested prefix length
        fc.array(resumeGapMs, { minLength: 8, maxLength: 8 }), // per-ack time gaps
        validSize,
        async (total, prefixRequest, gaps, size) => {
          const { service, chunks, clock } = harness();
          const prefix = Math.min(prefixRequest, total);

          const session = await service.initSession(ACTOR, {
            organizationId: ORG,
            videoId: VIDEO_ID,
            totalChunks: total,
          });

          let elapsed = 0;
          // Acknowledge the prefix, advancing the clock (still within 24h/ack).
          for (let i = 0; i < prefix; i++) {
            elapsed += gaps[i]!;
            clock.set(new Date(START_MS + elapsed).toISOString());
            const ack = await service.putChunk(session.id, chunk(i, size));
            expect(ack.alreadyAcknowledged).toBe(false);
            expect(ack.acknowledged).toBe(i + 1);
          }

          // The resuming client is told exactly where to continue (R7.2).
          const st = await service.status(session.id);
          expect(st.nextExpectedIndex).toBe(prefix);
          expect(st.acknowledged).toBe(prefix);
          expect(st.status).toBe("open");

          // Resume from nextExpectedIndex through the end, still within window.
          for (let i = prefix; i < total; i++) {
            elapsed += gaps[i]!;
            clock.set(new Date(START_MS + elapsed).toISOString());
            const ack = await service.putChunk(session.id, chunk(i, size));
            expect(ack.alreadyAcknowledged).toBe(false);
            expect(ack.acknowledged).toBe(i + 1);
          }

          // Every chunk was persisted exactly once — none retransmitted.
          for (let i = 0; i < total; i++) {
            expect(chunks.putCalls.get(`${session.id}:${i}`)).toBe(1);
          }

          const video = await service.complete(session.id);
          expect(video.status).toBe("queued");
        },
      ),
      { numRuns: 200 },
    );
  });

  // Sub-property B: retransmitting any already-acknowledged chunk is re-acked
  // idempotently — acknowledged/nextExpectedIndex are unchanged and the chunk is
  // NOT staged again (still exactly one persist for that index).
  it("idempotently re-acks a retransmitted acknowledged chunk without re-persisting", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 8 }), // total chunks
        fc.integer({ min: 1, max: 8 }), // prefix length (>= 1 so an ack exists)
        validSize,
        fc.array(fc.nat(), { minLength: 1, maxLength: 6 }), // replayed-index picks
        async (total, prefixRequest, size, picks) => {
          const { service, chunks } = harness();
          const prefix = Math.min(prefixRequest, total);

          const session = await service.initSession(ACTOR, {
            organizationId: ORG,
            videoId: VIDEO_ID,
            totalChunks: total,
          });

          for (let i = 0; i < prefix; i++) {
            await service.putChunk(session.id, chunk(i, size));
          }

          const beforePutCalls = new Map(chunks.putCalls);

          // Retransmit already-acknowledged chunks (index < prefix) repeatedly.
          for (const pick of picks) {
            const index = pick % prefix;
            const replay = await service.putChunk(session.id, chunk(index, size));
            expect(replay.alreadyAcknowledged).toBe(true);
            // The acknowledged count is unchanged by a replay.
            expect(replay.acknowledged).toBe(prefix);

            const st = await service.status(session.id);
            expect(st.nextExpectedIndex).toBe(prefix);
            expect(st.acknowledged).toBe(prefix);
          }

          // No acknowledged chunk was re-persisted by the replays.
          for (let i = 0; i < prefix; i++) {
            const key = `${session.id}:${i}`;
            expect(chunks.putCalls.get(key)).toBe(beforePutCalls.get(key));
            expect(chunks.putCalls.get(key)).toBe(1);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // Sub-property C: a chunk ahead of the next expected index (an out-of-order
  // gap) is rejected and leaves the session state untouched — nothing is acked
  // or persisted for the gap index.
  it("rejects an out-of-order gap ahead of nextExpectedIndex without mutating state", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 8 }), // total chunks (need room for a gap)
        fc.integer({ min: 0, max: 8 }), // prefix length
        fc.integer({ min: 1, max: 8 }), // extra offset defining the gap
        validSize,
        async (total, prefixRequest, gapOffset, size) => {
          // Leave at least one index beyond the next expected so a gap exists.
          const prefix = Math.min(prefixRequest, total - 2 < 0 ? 0 : total - 2);
          const nextExpected = prefix;
          const gapIndex = Math.min(nextExpected + gapOffset, total - 1);
          fc.pre(gapIndex > nextExpected); // ensure a genuine forward gap

          const { service, chunks } = harness();
          const session = await service.initSession(ACTOR, {
            organizationId: ORG,
            videoId: VIDEO_ID,
            totalChunks: total,
          });

          for (let i = 0; i < prefix; i++) {
            await service.putChunk(session.id, chunk(i, size));
          }

          await expect(
            service.putChunk(session.id, chunk(gapIndex, size)),
          ).rejects.toBeInstanceOf(AppError);
          await expect(
            service.putChunk(session.id, chunk(gapIndex, size)),
          ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

          // State is untouched: still expecting the same next chunk, and the
          // gap index was never persisted.
          const st = await service.status(session.id);
          expect(st.acknowledged).toBe(prefix);
          expect(st.nextExpectedIndex).toBe(prefix);
          expect(st.status).toBe("open");
          expect(chunks.putCalls.get(`${session.id}:${gapIndex}`)).toBeUndefined();
        },
      ),
      { numRuns: 200 },
    );
  });
});
