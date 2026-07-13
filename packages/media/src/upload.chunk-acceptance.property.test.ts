import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createHash } from "node:crypto";
import { AppError } from "@streetstudio/shared";
import type { Clock } from "@streetstudio/auth";
import { chunkSizeArb } from "@streetstudio/shared/testing";
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
 * Property 18: Chunk acceptance validates size and acknowledges each received chunk.
 *
 * Feature: streetstudio, Property 18: Chunk acceptance validates size and acknowledges each received chunk
 *
 * Validates: Requirements 7.1
 *
 * For an open upload session, {@link UploadService.putChunk}:
 *
 *  - accepts an ordered sequence of chunks whose declared size lies within the
 *    accepted window [MIN_CHUNK_BYTES, MAX_CHUNK_BYTES] (1 MB..100 MB) and
 *    acknowledges each one, with the acknowledgment reporting a monotonically
 *    increasing acknowledged count against a constant total (R7.1); and
 *  - rejects a chunk whose declared size is below MIN or above MAX with
 *    `UPLOAD_CHUNK_SIZE_INVALID`, persisting nothing for it (R7.1).
 *
 * Chunk size is modelled as metadata (`sizeBytes`) carried alongside a small
 * payload, so a 100 MB chunk is described without materialising the buffer.
 */

/* -------------------------------------------------------------------------
 * In-memory test doubles (mirror the setup in upload.test.ts).
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

/**
 * Build a chunk whose checksum matches its bytes under the default verifier,
 * with the declared logical size supplied as metadata (never a real buffer).
 */
function chunk(index: number, sizeBytes: number, body: string): UploadChunk {
  const data = new TextEncoder().encode(body);
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

/* -------------------------------------------------------------------------
 * Property 18
 * ---------------------------------------------------------------------- */

describe("Property 18: chunk acceptance validates size and acknowledges each chunk (R7.1)", () => {
  it("accepts ordered in-range chunks and acknowledges each with monotonic acknowledged/total", async () => {
    await fc.assert(
      fc.asyncProperty(
        // An ordered upload of 1..8 chunks, each with an in-range declared size.
        fc.array(fc.integer({ min: MIN_CHUNK_BYTES, max: MAX_CHUNK_BYTES }), {
          minLength: 1,
          maxLength: 8,
        }),
        async (sizes) => {
          const total = sizes.length;
          const { service, chunks, emitter } = harness();
          const session = await service.initSession(ACTOR, {
            organizationId: ORG,
            videoId: VIDEO_ID,
            totalChunks: total,
          });

          for (let index = 0; index < total; index++) {
            const ack = await service.putChunk(
              session.id,
              chunk(index, sizes[index]!, `body-${index}`),
            );
            // Each received chunk is acknowledged (R7.1).
            expect(ack.index).toBe(index);
            expect(ack.alreadyAcknowledged).toBe(false);
            // Acknowledged count advances by one per chunk; total is constant.
            expect(ack.acknowledged).toBe(index + 1);
            expect(ack.total).toBe(total);
            // The acknowledged chunk was persisted.
            expect(chunks.staged.get(session.id)?.has(index)).toBe(true);
          }

          // One progress event per acknowledgment, reporting acknowledged/total.
          expect(emitter.events.map((e) => e.acknowledged)).toEqual(
            Array.from({ length: total }, (_, i) => i + 1),
          );
          expect(emitter.events.every((e) => e.total === total)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects a size-invalid chunk with UPLOAD_CHUNK_SIZE_INVALID and persists nothing; accepts an in-range one", async () => {
    await fc.assert(
      fc.asyncProperty(chunkSizeArb, async ({ size, valid }) => {
        const { service, chunks } = harness();
        const session = await service.initSession(ACTOR, {
          organizationId: ORG,
          videoId: VIDEO_ID,
          totalChunks: 1,
        });

        const first = chunk(0, size, "payload");

        if (valid) {
          // In-range size (1 MB..100 MB): accepted and acknowledged (R7.1).
          const ack = await service.putChunk(session.id, first);
          expect(ack.acknowledged).toBe(1);
          expect(ack.total).toBe(1);
          expect(chunks.staged.get(session.id)?.has(0)).toBe(true);
        } else {
          // Out-of-window size: rejected and nothing persisted (R7.1).
          await expect(service.putChunk(session.id, first)).rejects.toMatchObject(
            { code: "UPLOAD_CHUNK_SIZE_INVALID" },
          );
          const err = await service.putChunk(session.id, first).catch((e) => e);
          expect(err).toBeInstanceOf(AppError);
          expect(chunks.staged.get(session.id)).toBeUndefined();

          // A correctly-sized retransmission on the still-open session is accepted.
          const ack = await service.putChunk(
            session.id,
            chunk(0, MIN_CHUNK_BYTES, "payload"),
          );
          expect(ack.acknowledged).toBe(1);
          expect(chunks.staged.get(session.id)?.has(0)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
