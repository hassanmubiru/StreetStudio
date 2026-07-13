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
  type AssembledObject,
  type ChunkStorage,
  type UploadChunk,
  type UploadProgressEmitter,
  type UploadStore,
} from "./upload.js";

/**
 * Property 20: Chunk assembly round-trip reconstructs the original media.
 *
 * Feature: streetstudio, Property 20: Chunk assembly round-trip reconstructs the original media
 *
 * Validates: Requirements 7.3
 *
 * For any byte payload split into an ordered sequence of chunks and uploaded to
 * completion, assembling the acknowledged chunks in index order reproduces the
 * original payload exactly. The upload declares each chunk's logical size as
 * >= 1 MB (satisfying the R7.1 window) while the actual persisted bytes stay
 * tiny, mirroring the existing unit test's approach. The ChunkStorage test
 * double here truly concatenates staged bytes in index order on assemble, so
 * asserting the assembled bytes equal the ordered concatenation of the inputs
 * proves the round trip.
 */

/* -------------------------------------------------------------------------
 * Test doubles (self-contained; upload.test.ts is not modified)
 * ---------------------------------------------------------------------- */

/** A fixed clock — expiry is irrelevant to the round-trip property. */
function fixedClock(startIso: string): Clock {
  const current = new Date(startIso);
  return { now: () => new Date(current) };
}

/** In-memory {@link UploadStore} over plain maps. */
function memoryStore(video: VideoRecord): UploadStore {
  const sessions = new Map<string, UploadSessionRecord>();
  const videos = new Map<string, VideoRecord>([[video.id, { ...video }]]);
  return {
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
 * In-memory {@link ChunkStorage} that ACTUALLY concatenates the staged bytes in
 * index order on assemble and retains the assembled bytes so the test can read
 * them back and compare against the original concatenation.
 */
function concatenatingChunkStorage(): ChunkStorage & {
  assembled: Map<string, Uint8Array>;
} {
  const staged = new Map<string, Map<number, Uint8Array>>();
  const assembled = new Map<string, Uint8Array>();
  return {
    assembled,
    async put(sessionId, index, data) {
      let perSession = staged.get(sessionId);
      if (!perSession) {
        perSession = new Map();
        staged.set(sessionId, perSession);
      }
      // Copy defensively so later mutation of the source cannot alter staged bytes.
      perSession.set(index, Uint8Array.from(data));
    },
    async assemble(sessionId, totalChunks): Promise<AssembledObject> {
      const perSession = staged.get(sessionId) ?? new Map<number, Uint8Array>();
      const parts: Uint8Array[] = [];
      for (let i = 0; i < totalChunks; i++) {
        parts.push(perSession.get(i) ?? new Uint8Array());
      }
      const total = parts.reduce((n, p) => n + p.byteLength, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const part of parts) {
        out.set(part, offset);
        offset += part.byteLength;
      }
      assembled.set(sessionId, out);
      return { key: `uploads/${sessionId}/source`, sizeBytes: out.byteLength };
    },
    async discard(sessionId) {
      staged.delete(sessionId);
    },
  };
}

/** No-op progress emitter. */
const nullEmitter: UploadProgressEmitter = { emit() {} };

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
function makeChunk(index: number, data: Uint8Array): UploadChunk {
  const checksum = createHash("sha256").update(data).digest("hex");
  // Declare a valid logical size (>= 1 MB) while keeping the real bytes tiny.
  return { index, sizeBytes: MIN_CHUNK_BYTES, data, checksum };
}

/** Concatenate a sequence of byte payloads in order. */
function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

describe("Feature: streetstudio, Property 20: Chunk assembly round-trip reconstructs the original media", () => {
  it("assembles uploaded chunks in order so reconstructed bytes equal the original concatenation (R7.3)", async () => {
    await fc.assert(
      fc.asyncProperty(
        // A non-empty ordered sequence of small chunk payloads. Payloads may be
        // empty individually; the sequence models an arbitrary media split.
        fc.array(
          fc.uint8Array({ minLength: 0, maxLength: 32 }),
          { minLength: 1, maxLength: 12 },
        ),
        async (payloads) => {
          const store = memoryStore(makeVideo());
          const chunkStorage = concatenatingChunkStorage();
          let idCounter = 0;
          const service = new UploadService({
            store,
            chunkStorage,
            progressEmitter: nullEmitter,
            clock: fixedClock(START),
            newId: () => `session-${++idCounter}` as never,
          });

          const session = await service.initSession(
            { memberId: "m" as never },
            { organizationId: ORG, videoId: VIDEO_ID, totalChunks: payloads.length },
          );

          // Upload every chunk in order.
          for (let i = 0; i < payloads.length; i++) {
            const ack = await service.putChunk(session.id, makeChunk(i, payloads[i]!));
            expect(ack.acknowledged).toBe(i + 1);
          }

          const video = await service.complete(session.id);
          expect(video.id).toBe(VIDEO_ID);

          // Round trip: the assembled bytes equal the ordered concatenation of
          // the original chunk payloads.
          const expected = concat(payloads);
          const actual = chunkStorage.assembled.get(session.id);
          expect(actual).toBeDefined();
          expect(Array.from(actual!)).toEqual(Array.from(expected));
        },
      ),
      { numRuns: 100 },
    );
  });
});
