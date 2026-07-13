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
 * Property 22: Upload sessions expire after 24 hours of inactivity.
 *
 * Feature: streetstudio, Property 22: Upload sessions expire after 24 hours of inactivity
 *
 * Validates: Requirements 7.6
 *
 * For any upload session idle for at least UPLOAD_SESSION_LIFETIME_MS (24h)
 * since its last acknowledged activity (session creation before any ack, or the
 * last acknowledged chunk thereafter), the session is expired: a subsequent
 * putChunk is rejected with UPLOAD_SESSION_EXPIRED, the partial chunks are
 * discarded, and status reports "expired". A session idle for strictly less than
 * the lifetime since that last activity stays open and accepts the next chunk.
 *
 * The mutable clock drives arbitrary idle durations spanning both sides of the
 * 24h boundary so the at-or-past-deadline expiry rule (`now >= expiresAt`) is
 * exercised in both directions.
 */

/* -------------------------------------------------------------------------
 * Test doubles (mirror packages/media/src/upload.test.ts and
 * upload-resume.property.test.ts: an in-memory store/chunk-storage/emitter with
 * a mutable clock so the 24h lifetime is deterministic).
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

/** A declared chunk size somewhere inside the accepted [1 MB, 100 MB] window. */
const validSize = fc.integer({ min: MIN_CHUNK_BYTES, max: MAX_CHUNK_BYTES });

/**
 * An idle duration straddling the 24h boundary: sampled around
 * UPLOAD_SESSION_LIFETIME_MS so runs land both strictly inside the window
 * (still open) and at-or-past the deadline (expired). One day plus/minus a few
 * hours covers both sides while keeping the boundary itself (== lifetime) in
 * range.
 */
const idleMs = fc.integer({
  min: UPLOAD_SESSION_LIFETIME_MS - 3 * 60 * 60 * 1000,
  max: UPLOAD_SESSION_LIFETIME_MS + 3 * 60 * 60 * 1000,
});

describe("Feature: streetstudio, Property 22: Upload sessions expire after 24 hours of inactivity", () => {
  // Sub-property A: idle measured from session CREATION (before any ack). An
  // idle >= the 24h lifetime expires the session on the next putChunk (rejected
  // with UPLOAD_SESSION_EXPIRED, partial chunks discarded, status "expired"); an
  // idle strictly below the lifetime keeps it open and accepts the chunk.
  it("expires from creation at/after 24h idle and stays open below it (R7.6)", async () => {
    await fc.assert(
      fc.asyncProperty(idleMs, validSize, async (idle, size) => {
        const { service, chunks, clock } = harness();
        const session = await service.initSession(ACTOR, {
          organizationId: ORG,
          videoId: VIDEO_ID,
          totalChunks: 3,
        });

        // Idle for an arbitrary duration straddling the 24h boundary.
        clock.set(new Date(START_MS + idle).toISOString());

        if (idle >= UPLOAD_SESSION_LIFETIME_MS) {
          await expect(
            service.putChunk(session.id, chunk(0, size)),
          ).rejects.toBeInstanceOf(AppError);
          await expect(
            service.putChunk(session.id, chunk(0, size)),
          ).rejects.toMatchObject({ code: "UPLOAD_SESSION_EXPIRED" });

          // Partial chunks discarded, and status reports "expired" (R7.6).
          expect(chunks.discarded.has(session.id)).toBe(true);
          const st = await service.status(session.id);
          expect(st.status).toBe("expired");
        } else {
          // Still within the window: the session stays open and accepts a chunk.
          const ack = await service.putChunk(session.id, chunk(0, size));
          expect(ack.acknowledged).toBe(1);
          expect(ack.alreadyAcknowledged).toBe(false);
          const st = await service.status(session.id);
          expect(st.status).toBe("open");
        }
      }),
      { numRuns: 200 },
    );
  });

  // Sub-property B: idle measured from the LAST ACKNOWLEDGED chunk. After
  // acknowledging a prefix (each ack resets the deadline to now + 24h), an idle
  // >= the lifetime since the last ack expires the session and discards the
  // acknowledged partial chunks; an idle strictly below keeps it open and
  // accepts the following chunk.
  it("measures the 24h idle from the last acknowledged chunk (R7.6)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }), // total chunks (>= 2 leaves a next chunk)
        fc.integer({ min: 1, max: 4 }), // prefix acked before going idle
        idleMs, // idle since the last ack, straddling 24h
        validSize,
        async (total, prefixRequest, idle, size) => {
          const { service, chunks, clock } = harness();
          // Ack at least one but strictly fewer than total, so an unacked
          // "next" chunk (index === prefix) always exists to attempt after idle.
          const prefix = Math.min(prefixRequest, total - 1);

          const session = await service.initSession(ACTOR, {
            organizationId: ORG,
            videoId: VIDEO_ID,
            totalChunks: total,
          });

          // Acknowledge the prefix at t0 — this sets the last activity instant.
          for (let i = 0; i < prefix; i++) {
            const ack = await service.putChunk(session.id, chunk(i, size));
            expect(ack.acknowledged).toBe(i + 1);
          }

          // Idle since the last ack (all acks happened at START).
          clock.set(new Date(START_MS + idle).toISOString());

          if (idle >= UPLOAD_SESSION_LIFETIME_MS) {
            await expect(
              service.putChunk(session.id, chunk(prefix, size)),
            ).rejects.toMatchObject({ code: "UPLOAD_SESSION_EXPIRED" });

            // The acknowledged partial chunks are discarded (R7.6).
            expect(chunks.discarded.has(session.id)).toBe(true);
            const st = await service.status(session.id);
            expect(st.status).toBe("expired");
          } else {
            // Within the window since the last ack: the next chunk is accepted.
            const ack = await service.putChunk(session.id, chunk(prefix, size));
            expect(ack.acknowledged).toBe(prefix + 1);
            expect(ack.alreadyAcknowledged).toBe(false);
            const st = await service.status(session.id);
            expect(st.status).toBe("open");
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
