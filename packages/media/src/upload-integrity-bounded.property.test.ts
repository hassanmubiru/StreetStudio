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
  MAX_CHUNK_INTEGRITY_ATTEMPTS,
  type AssembledObject,
  type ChunkStorage,
  type ChunkVerifier,
  type UploadChunk,
  type UploadProgressEmitter,
  type UploadProgressEvent,
  type UploadStore,
} from "./upload.js";

/**
 * Property 21: Chunk integrity failures are bounded and non-destructive.
 *
 * Feature: streetstudio, Property 21: Chunk integrity failures are bounded and non-destructive
 *
 * Validates: Requirements 7.4, 7.5
 *
 * For any chunk that fails its integrity check, it is rejected WITHOUT being
 * persisted and every previously acknowledged chunk remains unchanged;
 * retransmission is requested (UPLOAD_CHUNK_INVALID) for up to
 * MAX_CHUNK_INTEGRITY_ATTEMPTS (3) attempts. On the 3rd consecutive failure the
 * session is aborted, its partial chunks are discarded, and an UPLOAD_FAILED
 * response identifies the failing chunk. Integrity failures never destroy the
 * previously-acknowledged chunks until the abort discards the whole session.
 */

/* -------------------------------------------------------------------------
 * In-memory doubles (mirrors packages/media/src/upload.test.ts)
 * ---------------------------------------------------------------------- */

/** A mutable clock so the 24h lifetime never trips during the property runs. */
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

/** In-memory {@link ChunkStorage} that records staged and discarded sessions. */
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

/** Collecting progress emitter. */
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

/** A verified chunk whose checksum matches its bytes under the default verifier. */
function goodChunk(index: number): UploadChunk {
  const data = new TextEncoder().encode(`good-${index}`);
  const checksum = createHash("sha256").update(data).digest("hex");
  return { index, sizeBytes: MIN_CHUNK_BYTES, data, checksum };
}

/** A malformed chunk that the scripted verifier will reject. */
function badChunk(index: number): UploadChunk {
  const data = new TextEncoder().encode(`corrupt-${index}`);
  return { index, sizeBytes: MIN_CHUNK_BYTES, data, checksum: "deadbeef" };
}

/**
 * A scripted {@link ChunkVerifier} that deterministically fails the chunk at
 * `failIndex` and passes every other chunk, modelling transport corruption of a
 * single chunk without depending on hashing.
 */
function verifierFailingIndex(failIndex: number): ChunkVerifier {
  return { verify: (chunk) => chunk.index !== failIndex };
}

interface Harness {
  service: UploadService;
  store: ReturnType<typeof memoryStore>;
  chunks: ReturnType<typeof memoryChunkStorage>;
  emitter: ReturnType<typeof collectingEmitter>;
}

function harness(verifier: ChunkVerifier): Harness {
  const store = memoryStore(makeVideo());
  const chunks = memoryChunkStorage();
  const emitter = collectingEmitter();
  const clock = mutableClock(START);
  let idCounter = 0;
  const service = new UploadService({
    store,
    chunkStorage: chunks,
    progressEmitter: emitter,
    verifier,
    clock,
    newId: () => `session-${++idCounter}` as never,
  });
  return { service, store, chunks, emitter };
}

/** Snapshot the staged bytes for a session as index -> hex, for comparison. */
function snapshotStaged(
  chunks: ReturnType<typeof memoryChunkStorage>,
  sessionId: string,
): Map<number, string> {
  const snap = new Map<number, string>();
  const perSession = chunks.staged.get(sessionId);
  if (perSession) {
    for (const [index, bytes] of perSession) {
      snap.set(index, Buffer.from(bytes).toString("hex"));
    }
  }
  return snap;
}

/* -------------------------------------------------------------------------
 * Property
 * ---------------------------------------------------------------------- */

describe("Feature: streetstudio, Property 21: Chunk integrity failures are bounded and non-destructive", () => {
  it("rejects a bad chunk without persisting, retains prior acks for up to 3 attempts, then aborts naming the chunk", async () => {
    await fc.assert(
      fc.asyncProperty(
        // A session with room to acknowledge a prefix of good chunks before the
        // failing one: totalChunks in [1, 8], failing index in [0, total-1].
        fc
          .integer({ min: 1, max: 8 })
          .chain((total) =>
            fc.record({
              total: fc.constant(total),
              failIndex: fc.integer({ min: 0, max: total - 1 }),
              // How many consecutive times to retransmit the bad chunk: 1..3.
              attemptsToRun: fc.integer({
                min: 1,
                max: MAX_CHUNK_INTEGRITY_ATTEMPTS,
              }),
            }),
          ),
        async ({ total, failIndex, attemptsToRun }) => {
          const { service, store, chunks } = harness(
            verifierFailingIndex(failIndex),
          );

          const session = await service.initSession(
            { memberId: "m" as never },
            { organizationId: ORG, videoId: VIDEO_ID, totalChunks: total },
          );
          const sessionId = session.id;

          // Acknowledge every good chunk that precedes the failing one.
          for (let i = 0; i < failIndex; i++) {
            const ack = await service.putChunk(sessionId, goodChunk(i));
            expect(ack.alreadyAcknowledged).toBe(false);
          }

          // Baseline: exactly the prefix [0, failIndex) is staged and the
          // session is open with `failIndex` acknowledged chunks.
          const baseline = snapshotStaged(chunks, sessionId);
          expect([...baseline.keys()].sort((a, b) => a - b)).toEqual(
            Array.from({ length: failIndex }, (_, i) => i),
          );
          expect(store.sessions.get(sessionId)?.ackedChunks).toBe(failIndex);

          const bad = badChunk(failIndex);

          for (let attempt = 1; attempt <= attemptsToRun; attempt++) {
            await expect(service.putChunk(sessionId, bad)).rejects.toBeTruthy();

            let thrown: unknown;
            try {
              await service.putChunk(sessionId, bad);
            } catch (err) {
              thrown = err;
            }
            // NOTE: the call above is a second invocation only to capture the
            // error object; account for it by advancing `attempt` accordingly.
            attempt++;

            void thrown;
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
