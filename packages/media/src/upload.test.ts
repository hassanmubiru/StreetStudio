import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { AppError } from "@streetstudio/shared";
import type { Clock } from "@streetstudio/auth";
import type {
  UploadSessionRecord,
  VideoRecord,
} from "@streetstudio/database";

import {
  UploadService,
  sha256ChunkVerifier,
  MIN_CHUNK_BYTES,
  MAX_CHUNK_BYTES,
  UPLOAD_SESSION_LIFETIME_MS,
  MAX_CHUNK_INTEGRITY_ATTEMPTS,
  type AssembledObject,
  type ChunkStorage,
  type ChunkVerifier,
  type UploadChunk,
  type UploadProgressEmitter,
  type UploadProgressEvent,
  type UploadStore,
} from "./upload.js";

/* -------------------------------------------------------------------------
 * Test doubles
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

/** Build a chunk whose checksum matches its bytes under the default verifier. */
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

function harness(overrides: { verifier?: ChunkVerifier } = {}): Harness {
  const store = memoryStore(makeVideo());
  const chunks = memoryChunkStorage();
  const emitter = collectingEmitter();
  const clock = mutableClock(START);
  let idCounter = 0;
  const service = new UploadService({
    store,
    chunkStorage: chunks,
    progressEmitter: emitter,
    ...(overrides.verifier ? { verifier: overrides.verifier } : {}),
    clock,
    newId: () => `session-${++idCounter}` as never,
  });
  return { service, store, chunks, emitter, clock };
}

/* -------------------------------------------------------------------------
 * Constants
 * ---------------------------------------------------------------------- */

describe("upload constants", () => {
  it("bounds chunk size to the 1 MB..100 MB window (R7.1)", () => {
    expect(MIN_CHUNK_BYTES).toBe(1024 * 1024);
    expect(MAX_CHUNK_BYTES).toBe(100 * 1024 * 1024);
  });

  it("sets the session lifetime to 24 hours (R7.6)", () => {
    expect(UPLOAD_SESSION_LIFETIME_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("bounds integrity retries to 3 (R7.4, R7.5)", () => {
    expect(MAX_CHUNK_INTEGRITY_ATTEMPTS).toBe(3);
  });
});

/* -------------------------------------------------------------------------
 * initSession + putChunk acknowledgment (R7.1, R7.7)
 * ---------------------------------------------------------------------- */

describe("UploadService.initSession / putChunk", () => {
  it("opens a session and acknowledges ordered chunks, emitting progress", async () => {
    const { service, emitter } = harness();
    const session = await service.initSession(
      { memberId: "m" as never },
      { organizationId: ORG, videoId: VIDEO_ID, totalChunks: 2 },
    );
    expect(session.status).toBe("open");
    expect(session.totalChunks).toBe(2);

    const ack0 = await service.putChunk(session.id, chunk(0, MIN_CHUNK_BYTES, "a"));
    expect(ack0).toMatchObject({ index: 0, acknowledged: 1, total: 2, alreadyAcknowledged: false });

    const ack1 = await service.putChunk(session.id, chunk(1, MAX_CHUNK_BYTES, "b"));
    expect(ack1.acknowledged).toBe(2);

    // R7.7 — one progress event per ack reporting acknowledged/total.
    expect(emitter.events.map((e) => e.acknowledged)).toEqual([1, 2]);
    expect(emitter.events.every((e) => e.total === 2)).toBe(true);
  });

  it("rejects a chunk sized outside the window without persisting (R7.1)", async () => {
    const { service, chunks } = harness();
    const session = await service.initSession(
      { memberId: "m" as never },
      { organizationId: ORG, videoId: VIDEO_ID, totalChunks: 1 },
    );
    await expect(
      service.putChunk(session.id, chunk(0, MIN_CHUNK_BYTES - 1, "a")),
    ).rejects.toMatchObject({ code: "UPLOAD_CHUNK_SIZE_INVALID" });
    expect(chunks.staged.get(session.id)).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------
 * Resume without retransmission (R7.2)
 * ---------------------------------------------------------------------- */

describe("UploadService resume", () => {
  it("idempotently re-acknowledges an already-acked chunk without re-persisting (R7.2)", async () => {
    const { service, chunks } = harness();
    const session = await service.initSession(
      { memberId: "m" as never },
      { organizationId: ORG, videoId: VIDEO_ID, totalChunks: 3 },
    );
    await service.putChunk(session.id, chunk(0, MIN_CHUNK_BYTES, "a"));

    // Status tells a resuming client where to continue.
    const st = await service.status(session.id);
    expect(st.nextExpectedIndex).toBe(1);

    // Retransmitting chunk 0 is acknowledged idempotently.
    const replay = await service.putChunk(session.id, chunk(0, MIN_CHUNK_BYTES, "a"));
    expect(replay.alreadyAcknowledged).toBe(true);
    expect(replay.acknowledged).toBe(1);
    // Only chunk 0 was ever staged.
    expect([...(chunks.staged.get(session.id)?.keys() ?? [])]).toEqual([0]);
  });

  it("rejects an out-of-order gap (R7.2)", async () => {
    const { service } = harness();
    const session = await service.initSession(
      { memberId: "m" as never },
      { organizationId: ORG, videoId: VIDEO_ID, totalChunks: 3 },
    );
    await expect(
      service.putChunk(session.id, chunk(1, MIN_CHUNK_BYTES, "b")),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});

/* -------------------------------------------------------------------------
 * Bounded, non-destructive integrity failures (R7.4, R7.5)
 * ---------------------------------------------------------------------- */

describe("UploadService integrity failures", () => {
  it("rejects a bad chunk without persisting and retains prior acks (R7.4)", async () => {
    const { service, chunks } = harness();
    const session = await service.initSession(
      { memberId: "m" as never },
      { organizationId: ORG, videoId: VIDEO_ID, totalChunks: 3 },
    );
    await service.putChunk(session.id, chunk(0, MIN_CHUNK_BYTES, "a"));

    const bad: UploadChunk = { index: 1, sizeBytes: MIN_CHUNK_BYTES, data: new TextEncoder().encode("b"), checksum: "deadbeef" };
    await expect(service.putChunk(session.id, bad)).rejects.toMatchObject({ code: "UPLOAD_CHUNK_INVALID" });

    // Chunk 0 is retained; chunk 1 was not persisted.
    expect([...(chunks.staged.get(session.id)?.keys() ?? [])]).toEqual([0]);
    const st = await service.status(session.id);
    expect(st.acknowledged).toBe(1);
    expect(st.status).toBe("open");
  });

  it("aborts and discards after 3 consecutive integrity failures, naming the chunk (R7.5)", async () => {
    const { service, chunks, store } = harness();
    const session = await service.initSession(
      { memberId: "m" as never },
      { organizationId: ORG, videoId: VIDEO_ID, totalChunks: 2 },
    );
    const bad: UploadChunk = { index: 0, sizeBytes: MIN_CHUNK_BYTES, data: new TextEncoder().encode("x"), checksum: "00" };

    await expect(service.putChunk(session.id, bad)).rejects.toMatchObject({ code: "UPLOAD_CHUNK_INVALID" });
    await expect(service.putChunk(session.id, bad)).rejects.toMatchObject({ code: "UPLOAD_CHUNK_INVALID" });
    await expect(service.putChunk(session.id, bad)).rejects.toMatchObject({
      code: "UPLOAD_FAILED",
      details: { chunkIndex: 0 },
    });

    expect(store.sessions.get(session.id)?.status).toBe("aborted");
    expect(chunks.discarded.has(session.id)).toBe(true);

    // Subsequent chunks on an aborted session fail.
    await expect(
      service.putChunk(session.id, chunk(0, MIN_CHUNK_BYTES, "a")),
    ).rejects.toMatchObject({ code: "UPLOAD_FAILED" });
  });
});

/* -------------------------------------------------------------------------
 * Session expiry (R7.6)
 * ---------------------------------------------------------------------- */

describe("UploadService expiry", () => {
  it("expires an idle session past 24h and rejects further chunks (R7.6)", async () => {
    const { service, chunks, clock } = harness();
    const session = await service.initSession(
      { memberId: "m" as never },
      { organizationId: ORG, videoId: VIDEO_ID, totalChunks: 2 },
    );
    await service.putChunk(session.id, chunk(0, MIN_CHUNK_BYTES, "a"));

    // Advance past the 24h idle deadline.
    clock.set("2024-01-02T00:00:01.000Z");

    await expect(
      service.putChunk(session.id, chunk(1, MIN_CHUNK_BYTES, "b")),
    ).rejects.toMatchObject({ code: "UPLOAD_SESSION_EXPIRED" });
    expect(chunks.discarded.has(session.id)).toBe(true);

    const st = await service.status(session.id);
    expect(st.status).toBe("expired");
  });

  it("keeps the session alive when the clock stays within the window (R7.2)", async () => {
    const { service, clock } = harness();
    const session = await service.initSession(
      { memberId: "m" as never },
      { organizationId: ORG, videoId: VIDEO_ID, totalChunks: 2 },
    );
    await service.putChunk(session.id, chunk(0, MIN_CHUNK_BYTES, "a"));
    // 23h later — still within the lifetime measured from the last ack.
    clock.set("2024-01-01T23:00:00.000Z");
    const ack = await service.putChunk(session.id, chunk(1, MIN_CHUNK_BYTES, "b"));
    expect(ack.acknowledged).toBe(2);
  });
});

/* -------------------------------------------------------------------------
 * Completion assembles in order and records the Video (R7.3)
 * ---------------------------------------------------------------------- */

describe("UploadService.complete", () => {
  it("assembles all chunks and records the Video as uploaded (R7.3)", async () => {
    const { service, store } = harness();
    const session = await service.initSession(
      { memberId: "m" as never },
      { organizationId: ORG, videoId: VIDEO_ID, totalChunks: 2 },
    );
    await service.putChunk(session.id, chunk(0, MIN_CHUNK_BYTES, "hello "));
    await service.putChunk(session.id, chunk(1, MIN_CHUNK_BYTES, "world"));

    const video = await service.complete(session.id);
    expect(video.id).toBe(VIDEO_ID);
    expect(video.status).toBe("queued");

    const stored = store.videos.get(VIDEO_ID);
    expect(stored?.sourceObjectKey).toBe(`uploads/${session.id}/source`);
    expect(store.sessions.get(session.id)?.status).toBe("completed");
  });

  it("refuses to complete before every chunk is acknowledged (R7.3)", async () => {
    const { service } = harness();
    const session = await service.initSession(
      { memberId: "m" as never },
      { organizationId: ORG, videoId: VIDEO_ID, totalChunks: 2 },
    );
    await service.putChunk(session.id, chunk(0, MIN_CHUNK_BYTES, "a"));
    await expect(service.complete(session.id)).rejects.toMatchObject({
      code: "UPLOAD_FAILED",
      details: { reason: "incomplete" },
    });
  });
});

/* -------------------------------------------------------------------------
 * Default verifier
 * ---------------------------------------------------------------------- */

describe("sha256ChunkVerifier", () => {
  it("passes a matching checksum and fails a mismatched one", async () => {
    const good = chunk(0, MIN_CHUNK_BYTES, "payload");
    expect(await sha256ChunkVerifier.verify(good)).toBe(true);
    expect(
      await sha256ChunkVerifier.verify({ ...good, checksum: "abcd" }),
    ).toBe(false);
  });
});
