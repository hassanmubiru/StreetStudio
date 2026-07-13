/**
 * Chunked & Resumable Upload Service (`packages/media`).
 *
 * Implements the design's "Chunked Upload Service" section and Requirement 7:
 * Chunked, Resumable Uploads. The service accepts a Video's media as an ordered
 * sequence of chunks, acknowledges each one, tolerates interruption/resumption
 * within a bounded session lifetime, bounds and contains integrity failures,
 * expires idle sessions, and assembles the acknowledged chunks in order into
 * the completed Video:
 *
 *  - {@link UploadService.initSession} opens an {@link UploadSessionDto} for a
 *    Video with a known chunk count and a 24-hour lifetime (R7.2, R7.6).
 *  - {@link UploadService.putChunk} accepts an ordered chunk whose declared size
 *    is between {@link MIN_CHUNK_BYTES} (1 MB) and {@link MAX_CHUNK_BYTES}
 *    (100 MB), integrity-checks it, persists and acknowledges it, and reports
 *    progress (R7.1, R7.4, R7.7). A chunk that fails its integrity check is
 *    rejected WITHOUT persisting and retransmission is requested for up to
 *    {@link MAX_CHUNK_INTEGRITY_ATTEMPTS} attempts; the third consecutive
 *    failure aborts the session and discards the partial chunks (R7.4, R7.5).
 *    A chunk whose index precedes the next expected one is acknowledged
 *    idempotently so a resumed upload never retransmits acknowledged chunks
 *    (R7.2). A chunk arriving after the session's 24-hour idle deadline is
 *    rejected with an expired-session error (R7.6).
 *  - {@link UploadService.status} reports the acknowledged/total progress and
 *    the next expected chunk index, applying the same lazy expiry (R7.2, R7.6).
 *  - {@link UploadService.complete} assembles the acknowledged chunks in order
 *    into a complete media object, records the Video as uploaded, and returns
 *    the completed Video (R7.3).
 *
 * Every failure is surfaced through the shared error taxonomy (`AppError`): a
 * chunk sized outside the accepted window raises `UPLOAD_CHUNK_SIZE_INVALID`; a
 * chunk that fails its integrity check (with attempts remaining) raises
 * `UPLOAD_CHUNK_INVALID`; an aborted upload or a `complete` before every chunk
 * is acknowledged raises `UPLOAD_FAILED`; an expired session raises
 * `UPLOAD_SESSION_EXPIRED`; an unknown session or Video raises `NOT_FOUND`; and
 * an out-of-order or out-of-range index raises `VALIDATION_FAILED`.
 *
 * Time is read from an injectable {@link Clock} so the 24-hour lifetime is
 * deterministic under test. Session state is reached only through the narrow
 * {@link UploadStore} port, chunk bytes only through the {@link ChunkStorage}
 * port, and progress notifications only through the {@link UploadProgressEmitter}
 * seam, so the service is decoupled from the database, the storage backend, and
 * the realtime layer and is unit-testable with in-memory fakes. The default
 * adapters are backed by the UploadSession/Video repositories from
 * `@streetstudio/database` ({@link repositoryUploadStore}) and by the
 * {@link StorageRouter} for assembly persistence ({@link storageRouterChunkStorage}).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { ReadableStream } from "node:stream/web";

import { newUuid } from "@streetstudio/database";
import type {
  Repositories,
  UploadSessionRecord,
  VideoRecord,
} from "@streetstudio/database";
import { systemClock, toIsoTimestamp, type Clock } from "@streetstudio/auth";
import type { AuthContext } from "@streetstudio/auth";
import { AppError } from "@streetstudio/shared";
import type {
  IsoTimestamp,
  UploadSessionDto,
  UploadSessionStatus,
  Uuid,
  VideoDto,
} from "@streetstudio/shared";

import type { ObjectStream } from "./storage.js";
import { StorageRouter } from "./storage.js";

/** One mebibyte in bytes. */
const ONE_MEBIBYTE = 1024 * 1024;

/**
 * Minimum accepted upload chunk size, in bytes (1 MB). A chunk whose declared
 * size is below this is rejected with `UPLOAD_CHUNK_SIZE_INVALID` (R7.1).
 */
export const MIN_CHUNK_BYTES = ONE_MEBIBYTE;

/**
 * Maximum accepted upload chunk size, in bytes (100 MB). A chunk whose declared
 * size exceeds this is rejected with `UPLOAD_CHUNK_SIZE_INVALID` (R7.1).
 */
export const MAX_CHUNK_BYTES = 100 * ONE_MEBIBYTE;

/**
 * The upload session lifetime: 24 hours of inactivity. Measured from the last
 * acknowledged chunk (or from session creation before any ack). A chunk or
 * completion arriving at or after this deadline expires the session (R7.2, R7.6).
 */
export const UPLOAD_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;

/**
 * The maximum number of integrity-check attempts permitted for a single chunk.
 * The first {@link MAX_CHUNK_INTEGRITY_ATTEMPTS} − 1 failures request
 * retransmission; the {@link MAX_CHUNK_INTEGRITY_ATTEMPTS}-th consecutive
 * failure aborts the session and discards the partial chunks (R7.4, R7.5).
 */
export const MAX_CHUNK_INTEGRITY_ATTEMPTS = 3;

/**
 * A single upload chunk. `data` carries the actual bytes persisted and used for
 * assembly, while `sizeBytes` is the declared logical chunk size validated
 * against the 1 MB–100 MB window (R7.1). Modelling the size as metadata lets a
 * caller (and tests) describe a large chunk without materialising a full
 * multi-megabyte buffer; the integrity check runs over `data`.
 */
export interface UploadChunk {
  /** Zero-based position of this chunk in the ordered sequence. */
  readonly index: number;
  /** Declared chunk size in bytes; validated to be within [1 MB, 100 MB] (R7.1). */
  readonly sizeBytes: number;
  /** The chunk payload persisted for assembly and integrity-checked. */
  readonly data: Uint8Array;
  /** Integrity value the {@link ChunkVerifier} checks `data` against (R7.4). */
  readonly checksum: string;
}

/** Metadata required to open an upload session for a Video. */
export interface UploadMeta {
  /** The Organization that owns the Video being uploaded. */
  readonly organizationId: Uuid;
  /** The Video the upload populates. */
  readonly videoId: Uuid;
  /** The total number of chunks the completed Video comprises (must be ≥ 1). */
  readonly totalChunks: number;
}

/** Acknowledgment returned for an accepted (or already-acknowledged) chunk (R7.1). */
export interface ChunkAck {
  /** The session the chunk belongs to. */
  readonly sessionId: Uuid;
  /** The zero-based index that was acknowledged. */
  readonly index: number;
  /** Count of acknowledged chunks after this ack (R7.7). */
  readonly acknowledged: number;
  /** Total expected chunks (R7.7). */
  readonly total: number;
  /**
   * Whether this chunk had already been acknowledged by a prior transmission.
   * True for a resumed client that retransmits an acknowledged chunk; the chunk
   * is not re-persisted (R7.2).
   */
  readonly alreadyAcknowledged: boolean;
}

/** A point-in-time view of an upload session's progress. */
export interface UploadStatus {
  /** The session id. */
  readonly sessionId: Uuid;
  /** The Video being uploaded. */
  readonly videoId: Uuid;
  /** The owning Organization. */
  readonly organizationId: Uuid;
  /** Current lifecycle status. */
  readonly status: UploadSessionStatus;
  /** Count of acknowledged chunks. */
  readonly acknowledged: number;
  /** Total expected chunks. */
  readonly total: number;
  /**
   * The next chunk index the service expects. While the session is open this
   * equals {@link acknowledged}; a resuming client should continue from here
   * without retransmitting earlier chunks (R7.2).
   */
  readonly nextExpectedIndex: number;
  /** When the session expires after inactivity (R7.6). */
  readonly expiresAt: IsoTimestamp;
}

/**
 * A progress notification emitted on each chunk acknowledgment (R7.7). The
 * realtime layer routes it to the uploading Member; this service only reports
 * the acknowledged/total counts.
 */
export interface UploadProgressEvent {
  /** The session the progress belongs to. */
  readonly sessionId: Uuid;
  /** The Video being uploaded. */
  readonly videoId: Uuid;
  /** The owning Organization. */
  readonly organizationId: Uuid;
  /** Count of acknowledged chunks. */
  readonly acknowledged: number;
  /** Total expected chunks. */
  readonly total: number;
}

/**
 * Emits an upload-progress event on each chunk acknowledgment (R7.7). Host
 * wiring supplies an implementation backed by the Realtime_Service; a failure
 * to emit never masks the acknowledgment.
 */
export interface UploadProgressEmitter {
  /** Emit an upload-progress event. */
  emit(event: UploadProgressEvent): void | Promise<void>;
}

/**
 * Verifies the integrity of a received chunk (R7.4). The default
 * {@link sha256ChunkVerifier} compares a SHA-256 digest of the chunk bytes
 * against the declared {@link UploadChunk.checksum}; a custom verifier can be
 * injected to model transport corruption deterministically.
 */
export interface ChunkVerifier {
  /** Whether `chunk` passes its integrity check. */
  verify(chunk: UploadChunk): boolean | Promise<boolean>;
}

/**
 * Default {@link ChunkVerifier}: the chunk passes IFF the hex SHA-256 digest of
 * its bytes equals its declared checksum. The comparison is constant-time.
 */
export const sha256ChunkVerifier: ChunkVerifier = {
  verify(chunk: UploadChunk): boolean {
    const actual = createHash("sha256").update(chunk.data).digest();
    let expected: Buffer;
    try {
      expected = Buffer.from(chunk.checksum, "hex");
    } catch {
      return false;
    }
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  },
};

/**
 * Persistence port for upload sessions and their target Video. Deliberately
 * narrow: the service inserts a session, resolves a session by id (a caller
 * presents only a session id), persists mutated session state, resolves the
 * target Video within its Organization, and records the Video as uploaded.
 */
export interface UploadStore {
  /** Persist a new upload session and return it. */
  insertSession(record: UploadSessionRecord): Promise<UploadSessionRecord>;
  /** Find a session by id, or null when absent. */
  findSession(sessionId: Uuid): Promise<UploadSessionRecord | null>;
  /** Persist the mutated state of an existing session, preserving its id. */
  updateSession(record: UploadSessionRecord): Promise<UploadSessionRecord>;
  /** Find the target Video within its Organization, or null when absent. */
  findVideo(
    organizationId: Uuid,
    videoId: Uuid,
  ): Promise<VideoRecord | null>;
  /** Persist the mutated state of the Video, preserving its id. */
  updateVideo(record: VideoRecord): Promise<VideoRecord>;
}

/** The assembled media object produced by {@link ChunkStorage.assemble}. */
export interface AssembledObject {
  /** The storage key the assembled media object was persisted under. */
  readonly key: string;
  /** Number of bytes in the assembled object. */
  readonly sizeBytes: number;
}

/**
 * Staging port for chunk bytes and their in-order assembly (R7.3). Chunks are
 * staged per session as they are acknowledged, then concatenated in index order
 * into a single persisted media object on completion. {@link discard} drops a
 * session's partial chunks when it is aborted or expired (R7.5, R7.6).
 */
export interface ChunkStorage {
  /** Persist the bytes of an acknowledged chunk. */
  put(sessionId: Uuid, index: number, data: Uint8Array): Promise<void>;
  /**
   * Read chunks `0..totalChunks-1` in order, concatenate them into a single
   * media object, persist it, and return its key and size (R7.3).
   */
  assemble(sessionId: Uuid, totalChunks: number): Promise<AssembledObject>;
  /** Discard a session's partially received chunks (R7.5, R7.6). */
  discard(sessionId: Uuid): Promise<void>;
}

/** Dependencies required to construct an {@link UploadService}. */
export interface UploadServiceDeps {
  /** Session/Video persistence port. */
  readonly store: UploadStore;
  /** Chunk staging and assembly port. */
  readonly chunkStorage: ChunkStorage;
  /** Progress-event emitter (R7.7). */
  readonly progressEmitter: UploadProgressEmitter;
  /** Chunk integrity verifier; defaults to {@link sha256ChunkVerifier}. */
  readonly verifier?: ChunkVerifier;
  /** Time source; defaults to the system clock. */
  readonly clock?: Clock;
  /** UUID generator; defaults to the database id generator. */
  readonly newId?: () => Uuid;
}

/**
 * The Chunked & Resumable Upload service. See the module doc for the exact
 * semantics of each operation.
 */
export class UploadService {
  private readonly store: UploadStore;
  private readonly chunkStorage: ChunkStorage;
  private readonly progressEmitter: UploadProgressEmitter;
  private readonly verifier: ChunkVerifier;
  private readonly clock: Clock;
  private readonly newId: () => Uuid;

  /**
   * Consecutive integrity-failure counts per `${sessionId}:${index}`. Held in
   * memory: a chunk is retried within a single active session window, and a
   * successful ack (or session abort/expiry) clears the entry. The count bounds
   * retransmission to {@link MAX_CHUNK_INTEGRITY_ATTEMPTS} (R7.4, R7.5).
   */
  private readonly attempts = new Map<string, number>();

  constructor(deps: UploadServiceDeps) {
    this.store = deps.store;
    this.chunkStorage = deps.chunkStorage;
    this.progressEmitter = deps.progressEmitter;
    this.verifier = deps.verifier ?? sha256ChunkVerifier;
    this.clock = deps.clock ?? systemClock;
    this.newId = deps.newId ?? newUuid;
  }

  /**
   * Open an upload session for `meta.videoId` with `meta.totalChunks` expected
   * chunks. The Video must exist within `meta.organizationId`; `totalChunks`
   * must be a positive integer. The session starts `open` with a 24-hour
   * lifetime measured from now (R7.2, R7.6).
   */
  async initSession(actor: AuthContext, meta: UploadMeta): Promise<UploadSessionDto> {
    // `actor` participates in the uniform service signature; content permission
    // is enforced by the surrounding upload controller before initiation.
    void actor;

    if (!Number.isInteger(meta.totalChunks) || meta.totalChunks < 1) {
      throw new AppError("VALIDATION_FAILED", {
        details: { reason: "total-chunks-invalid", totalChunks: meta.totalChunks },
      });
    }

    const video = await this.store.findVideo(meta.organizationId, meta.videoId);
    if (!video) {
      throw new AppError("NOT_FOUND");
    }

    const now = this.clock.now();
    const record: UploadSessionRecord = {
      id: this.newId(),
      organizationId: meta.organizationId,
      videoId: meta.videoId,
      totalChunks: meta.totalChunks,
      ackedChunks: 0,
      lastAckAt: null,
      expiresAt: this.expiryFrom(now),
      status: "open",
    };
    const created = await this.store.insertSession(record);
    return toUploadSessionDto(created);
  }

  /**
   * Receive `chunk` for `sessionId`. The session must be `open` and unexpired
   * (R7.6). A chunk whose declared size is outside [1 MB, 100 MB] is rejected
   * with `UPLOAD_CHUNK_SIZE_INVALID` (R7.1). A chunk whose index precedes the
   * next expected one is acknowledged idempotently without re-persisting so a
   * resumed upload never retransmits acknowledged chunks (R7.2). A chunk that
   * fails its integrity check is rejected without persisting and retransmission
   * is requested (`UPLOAD_CHUNK_INVALID`) for up to
   * {@link MAX_CHUNK_INTEGRITY_ATTEMPTS} attempts; the final consecutive failure
   * aborts the session, discards the partial chunks, and raises `UPLOAD_FAILED`
   * naming the chunk (R7.4, R7.5). A verified chunk is persisted and
   * acknowledged, and an upload-progress event is emitted (R7.1, R7.7).
   */
  async putChunk(sessionId: Uuid, chunk: UploadChunk): Promise<ChunkAck> {
    const session = await this.requireOpenSession(sessionId);

    // R7.1 — the chunk size must fall within the accepted window. A size-invalid
    // chunk is rejected without persisting and does not consume an integrity
    // attempt; the session stays open for a correctly-sized retransmission.
    if (!isAcceptableChunkSize(chunk.sizeBytes)) {
      throw new AppError("UPLOAD_CHUNK_SIZE_INVALID", {
        details: {
          sessionId,
          chunkIndex: chunk.index,
          sizeBytes: chunk.sizeBytes,
          min: MIN_CHUNK_BYTES,
          max: MAX_CHUNK_BYTES,
        },
      });
    }

    const nextExpected = session.ackedChunks;

    // R7.2 — a chunk before the next expected index was already acknowledged in
    // an earlier transmission; acknowledge it idempotently without re-persisting
    // so a resumed client is not forced to retransmit acknowledged chunks.
    if (chunk.index < nextExpected) {
      await this.emitProgress(session);
      return {
        sessionId,
        index: chunk.index,
        acknowledged: session.ackedChunks,
        total: session.totalChunks,
        alreadyAcknowledged: true,
      };
    }

    // Chunks arrive strictly in order; a gap (or an index past the declared
    // total) is a protocol error that neither persists nor advances state.
    if (chunk.index > nextExpected || chunk.index >= session.totalChunks) {
      throw new AppError("VALIDATION_FAILED", {
        details: {
          reason: "chunk-out-of-order",
          sessionId,
          chunkIndex: chunk.index,
          expectedIndex: nextExpected,
          totalChunks: session.totalChunks,
        },
      });
    }

    // R7.4 — integrity-check before persisting anything.
    const ok = await this.verifier.verify(chunk);
    if (!ok) {
      return this.handleIntegrityFailure(session, chunk.index);
    }

    // Verified: persist the bytes, then acknowledge (R7.1). Previously
    // acknowledged chunks are untouched.
    await this.chunkStorage.put(sessionId, chunk.index, chunk.data);
    this.attempts.delete(attemptKey(sessionId, chunk.index));

    const now = this.clock.now();
    const acknowledged = session.ackedChunks + 1;
    const updated = await this.store.updateSession({
      ...session,
      ackedChunks: acknowledged,
      lastAckAt: toIsoTimestamp(now),
      expiresAt: this.expiryFrom(now),
    });

    await this.emitProgress(updated);

    return {
      sessionId,
      index: chunk.index,
      acknowledged,
      total: updated.totalChunks,
      alreadyAcknowledged: false,
    };
  }

  /**
   * Report the current progress of `sessionId`, applying the same lazy expiry
   * as {@link putChunk}: an `open` session past its 24-hour idle deadline is
   * expired and its partial chunks discarded before the status is returned
   * (R7.6). The reported {@link UploadStatus.nextExpectedIndex} is where a
   * resuming client should continue (R7.2).
   */
  async status(sessionId: Uuid): Promise<UploadStatus> {
    let session = await this.requireSession(sessionId);
    if (session.status === "open" && this.isExpired(session)) {
      session = await this.expireSession(session);
    }
    return {
      sessionId: session.id,
      videoId: session.videoId,
      organizationId: session.organizationId,
      status: session.status,
      acknowledged: session.ackedChunks,
      total: session.totalChunks,
      nextExpectedIndex: session.ackedChunks,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Complete `sessionId` once every chunk has been acknowledged: assemble the
   * chunks in order into a single media object, record the Video as uploaded
   * (its source object key set and status advanced to `queued` for processing),
   * mark the session `completed`, and return the completed Video (R7.3). A
   * session past its deadline is expired (R7.6); an aborted session or one whose
   * chunks are not all acknowledged raises `UPLOAD_FAILED`.
   */
  async complete(sessionId: Uuid): Promise<VideoDto> {
    const session = await this.requireOpenSession(sessionId);

    if (session.ackedChunks < session.totalChunks) {
      throw new AppError("UPLOAD_FAILED", {
        details: {
          reason: "incomplete",
          sessionId,
          acknowledged: session.ackedChunks,
          total: session.totalChunks,
        },
      });
    }

    const video = await this.store.findVideo(
      session.organizationId,
      session.videoId,
    );
    if (!video) {
      throw new AppError("NOT_FOUND");
    }

    const assembled = await this.chunkStorage.assemble(
      sessionId,
      session.totalChunks,
    );

    const updatedVideo = await this.store.updateVideo({
      ...video,
      sourceObjectKey: assembled.key,
      status: "queued",
    });

    await this.store.updateSession({ ...session, status: "completed" });

    return toVideoDto(updatedVideo);
  }

  /* --------------------------- internals ------------------------------- */

  /** Resolve a session by id or raise `NOT_FOUND`. */
  private async requireSession(sessionId: Uuid): Promise<UploadSessionRecord> {
    const session = await this.store.findSession(sessionId);
    if (!session) {
      throw new AppError("NOT_FOUND");
    }
    return session;
  }

  /**
   * Resolve a session and require it to be usable: not completed/aborted, and
   * not past its idle deadline. An open-but-expired session is expired in place
   * (partial chunks discarded) and rejected with `UPLOAD_SESSION_EXPIRED` (R7.6).
   */
  private async requireOpenSession(
    sessionId: Uuid,
  ): Promise<UploadSessionRecord> {
    const session = await this.requireSession(sessionId);

    switch (session.status) {
      case "expired":
        throw new AppError("UPLOAD_SESSION_EXPIRED", { details: { sessionId } });
      case "aborted":
        throw new AppError("UPLOAD_FAILED", {
          details: { reason: "session-aborted", sessionId },
        });
      case "completed":
        throw new AppError("CONFLICT", {
          details: { reason: "session-completed", sessionId },
        });
      default:
        break;
    }

    if (this.isExpired(session)) {
      await this.expireSession(session);
      throw new AppError("UPLOAD_SESSION_EXPIRED", { details: { sessionId } });
    }

    return session;
  }

  /**
   * Record a failed integrity check (R7.4). On the
   * {@link MAX_CHUNK_INTEGRITY_ATTEMPTS}-th consecutive failure the session is
   * aborted and its partial chunks discarded, raising `UPLOAD_FAILED` naming the
   * chunk (R7.5); otherwise retransmission is requested via `UPLOAD_CHUNK_INVALID`.
   * Nothing is persisted for the failed chunk in either case.
   */
  private async handleIntegrityFailure(
    session: UploadSessionRecord,
    index: number,
  ): Promise<never> {
    const key = attemptKey(session.id, index);
    const attempts = (this.attempts.get(key) ?? 0) + 1;

    if (attempts >= MAX_CHUNK_INTEGRITY_ATTEMPTS) {
      this.attempts.delete(key);
      await this.store.updateSession({ ...session, status: "aborted" });
      await this.discardQuietly(session.id);
      throw new AppError("UPLOAD_FAILED", {
        details: {
          reason: "chunk-integrity",
          sessionId: session.id,
          chunkIndex: index,
          attempts,
        },
      });
    }

    this.attempts.set(key, attempts);
    throw new AppError("UPLOAD_CHUNK_INVALID", {
      details: {
        sessionId: session.id,
        chunkIndex: index,
        attempts,
        remaining: MAX_CHUNK_INTEGRITY_ATTEMPTS - attempts,
      },
    });
  }

  /** Whether `session` is at or past its idle expiry deadline (R7.6). */
  private isExpired(session: UploadSessionRecord): boolean {
    return this.clock.now().getTime() >= new Date(session.expiresAt).getTime();
  }

  /** Mark a session expired and discard its partial chunks (R7.6). */
  private async expireSession(
    session: UploadSessionRecord,
  ): Promise<UploadSessionRecord> {
    const expired = await this.store.updateSession({
      ...session,
      status: "expired",
    });
    await this.discardQuietly(session.id);
    return expired;
  }

  /** Discard partial chunks; a discard failure never masks the caller's error. */
  private async discardQuietly(sessionId: Uuid): Promise<void> {
    try {
      await this.chunkStorage.discard(sessionId);
    } catch {
      // Best-effort cleanup; the aborted/expired session status already
      // prevents the partial chunks from ever being assembled.
    }
  }

  /** Emit an upload-progress event; an emitter failure never fails the ack (R7.7). */
  private async emitProgress(session: UploadSessionRecord): Promise<void> {
    try {
      await this.progressEmitter.emit({
        sessionId: session.id,
        videoId: session.videoId,
        organizationId: session.organizationId,
        acknowledged: session.ackedChunks,
        total: session.totalChunks,
      });
    } catch {
      // Progress notification is advisory; failing to emit must not undo the
      // acknowledgment the caller already earned.
    }
  }

  /** Compute the expiry instant 24 hours after `from`. */
  private expiryFrom(from: Date): IsoTimestamp {
    return toIsoTimestamp(new Date(from.getTime() + UPLOAD_SESSION_LIFETIME_MS));
  }
}

/** Whether `sizeBytes` is an integer within the accepted [1 MB, 100 MB] window. */
function isAcceptableChunkSize(sizeBytes: number): boolean {
  return (
    Number.isInteger(sizeBytes) &&
    sizeBytes >= MIN_CHUNK_BYTES &&
    sizeBytes <= MAX_CHUNK_BYTES
  );
}

/** Compose the attempts-map key for a chunk. */
function attemptKey(sessionId: Uuid, index: number): string {
  return `${sessionId}:${index}`;
}

/** Map an {@link UploadSessionRecord} to its wire DTO. */
function toUploadSessionDto(record: UploadSessionRecord): UploadSessionDto {
  return {
    id: record.id,
    organizationId: record.organizationId,
    videoId: record.videoId,
    totalChunks: record.totalChunks,
    ackedChunks: record.ackedChunks,
    ...(record.lastAckAt !== null ? { lastAckAt: record.lastAckAt } : {}),
    expiresAt: record.expiresAt,
    status: record.status,
  };
}

/** Map a {@link VideoRecord} to its wire DTO. */
function toVideoDto(record: VideoRecord): VideoDto {
  return {
    id: record.id,
    organizationId: record.organizationId,
    ...(record.folderId !== null ? { folderId: record.folderId } : {}),
    title: record.title,
    durationSeconds: record.durationSeconds,
    status: record.status,
    developerMode: record.developerMode,
    createdAt: record.createdAt,
  };
}

/**
 * Default {@link UploadStore} backed by the repositories from
 * `@streetstudio/database`.
 *
 * Upload sessions and Videos are tenant-scoped, so every read/write is
 * constrained to a single Organization. A session is resolved by id alone
 * (callers present only a session id) via the unscoped lookup, and its
 * `organizationId` then scopes the update. Because neither the UploadSession nor
 * the Video repository exposes an in-place update, {@link UploadStore.updateSession}
 * and {@link UploadStore.updateVideo} repoint a record by deleting and
 * re-inserting it with the mutated fields, preserving its id and every other
 * field (the same soft-update pattern used by the content, RBAC, and share stores).
 */
export function repositoryUploadStore(
  repositories: Pick<Repositories, "uploadSessions" | "videos">,
): UploadStore {
  const { uploadSessions, videos } = repositories;
  return {
    insertSession: (record) => uploadSessions.insert(record),
    findSession: (sessionId) => uploadSessions.findByIdUnscoped(sessionId),
    async updateSession(record) {
      await uploadSessions.deleteById(record.organizationId, record.id);
      await uploadSessions.insert(record);
      return record;
    },
    findVideo: (organizationId, videoId) =>
      videos.findById(organizationId, videoId),
    async updateVideo(record) {
      await videos.deleteById(record.organizationId, record.id);
      await videos.insert(record);
      return record;
    },
  };
}

/** Options for {@link storageRouterChunkStorage}. */
export interface StorageRouterChunkStorageOptions {
  /**
   * Prefix under which per-session upload objects are keyed. Defaults to
   * `"uploads"`, yielding chunk keys `uploads/{sessionId}/chunks/{index}` and an
   * assembled-source key `uploads/{sessionId}/source`.
   */
  readonly keyPrefix?: string;
}

/**
 * Default {@link ChunkStorage} that stages chunk bytes and assembles the
 * completed media object through a {@link StorageRouter}, so all persistence
 * flows through the active Storage_Provider (R7.3, R9.1). Each acknowledged
 * chunk is written under `{prefix}/{sessionId}/chunks/{index}`; assembly reads
 * those objects in index order, concatenates them, and writes the result under
 * `{prefix}/{sessionId}/source`.
 *
 * Because the {@link StorageProvider} contract exposes no delete, {@link discard}
 * is a best-effort no-op here: the aborted/expired session status already
 * prevents the partial chunks from being assembled, and physical cleanup is left
 * to storage lifecycle policy.
 */
export function storageRouterChunkStorage(
  router: StorageRouter,
  options: StorageRouterChunkStorageOptions = {},
): ChunkStorage {
  const prefix = options.keyPrefix ?? "uploads";
  const chunkKey = (sessionId: Uuid, index: number): string =>
    `${prefix}/${sessionId}/chunks/${index}`;
  const sourceKey = (sessionId: Uuid): string => `${prefix}/${sessionId}/source`;

  return {
    async put(sessionId, index, data) {
      await router.put(chunkKey(sessionId, index), bytesToStream(data));
    },
    async assemble(sessionId, totalChunks) {
      const parts: Uint8Array[] = [];
      for (let index = 0; index < totalChunks; index++) {
        const stream = await router.get(chunkKey(sessionId, index));
        parts.push(await streamToBytes(stream));
      }
      const assembled = concatBytes(parts);
      const key = sourceKey(sessionId);
      await router.put(key, bytesToStream(assembled));
      return { key, sizeBytes: assembled.byteLength };
    },
    async discard() {
      // No-op: see the doc comment. Session status prevents assembly.
    },
  };
}

/** Wrap a byte buffer as a single-chunk {@link ObjectStream}. */
function bytesToStream(bytes: Uint8Array): ObjectStream {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/** Drain an {@link ObjectStream} into a single byte buffer. */
async function streamToBytes(stream: ObjectStream): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) parts.push(value);
  }
  return concatBytes(parts);
}

/** Concatenate byte buffers in order. */
function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}
