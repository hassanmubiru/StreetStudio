/**
 * Uploads use cases: orchestrate the {@link UploadSession} domain, its
 * repository, and a real object {@link Storage}. Parts are written as real
 * objects and, on completion, read back in order and assembled into the final
 * object — genuine chunked upload + assembly, no fakes. Authorization uses the
 * domain's `canEdit` rule.
 */
import { ForbiddenException, NotFoundException } from "streetjs";
import type { Storage, StorageObjectMetadata } from "@streetjs/storage";
import type { Uuid, IsoTimestamp } from "@streetstudio/shared";
import { UploadSession, type Actor } from "../domain/upload-session.js";
import { UploadSessionRepository } from "../persistence/upload-session-repository.js";

export interface Clock {
  now(): IsoTimestamp;
}
const systemClock: Clock = { now: () => new Date().toISOString() as IsoTimestamp };

export interface BeginUploadInput {
  readonly id: Uuid;
  readonly objectKey: string;
  readonly totalParts: number;
  readonly contentType?: string;
}

/** Storage key for an in-progress part. */
function partKey(sessionId: Uuid, partNumber: number): string {
  return `uploads/${sessionId}/parts/${partNumber}`;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export class UploadService {
  constructor(
    private readonly repo: UploadSessionRepository,
    private readonly storage: Storage,
    private readonly clock: Clock = systemClock,
  ) {}

  async begin(actor: Actor, input: BeginUploadInput): Promise<UploadSession> {
    const session = UploadSession.begin({
      id: input.id,
      owner: actor,
      objectKey: input.objectKey,
      totalParts: input.totalParts,
      createdAt: this.clock.now(),
    });
    await this.repo.insert(session);
    // Remember the desired content type on the final object via a sidecar? Kept
    // simple: content type is applied at completion time (passed through).
    this.contentTypes.set(session.id, input.contentType ?? "application/octet-stream");
    return session;
  }

  private readonly contentTypes = new Map<Uuid, string>();

  async get(actor: Actor, id: Uuid): Promise<UploadSession> {
    const session = await this.repo.findById(id);
    if (!session || !session.canEdit(actor)) {
      throw new NotFoundException("Upload session not found.");
    }
    return session;
  }

  /** Store one part (real bytes) and record its receipt. */
  async uploadPart(
    actor: Actor,
    id: Uuid,
    partNumber: number,
    bytes: Uint8Array,
  ): Promise<UploadSession> {
    const session = await this.get(actor, id);
    if (!session.canEdit(actor)) {
      throw new ForbiddenException("You cannot upload to this session.");
    }
    // Validate the transition first (throws on bad/late part), then persist bytes.
    const updated = session.receivePart(partNumber);
    await this.storage.put(partKey(id, partNumber), bytes);
    await this.repo.save(updated);
    return updated;
  }

  /** Assemble all parts into the final object and complete the session. */
  async complete(actor: Actor, id: Uuid): Promise<{ session: UploadSession; object: StorageObjectMetadata }> {
    const session = await this.get(actor, id);
    if (!session.canEdit(actor)) {
      throw new ForbiddenException("You cannot complete this session.");
    }
    const completed = session.complete(this.clock.now());

    const parts: Uint8Array[] = [];
    for (let n = 1; n <= session.totalParts; n++) {
      const result = await this.storage.get(partKey(id, n));
      if (!result.found || !result.bytes) {
        throw new NotFoundException(`Stored bytes for part ${n} are missing.`);
      }
      parts.push(result.bytes);
    }
    const object = await this.storage.put(session.objectKey, concat(parts), {
      contentType: this.contentTypes.get(id) ?? "application/octet-stream",
    });

    for (let n = 1; n <= session.totalParts; n++) {
      await this.storage.delete(partKey(id, n));
    }
    await this.repo.save(completed);
    this.contentTypes.delete(id);
    return { session: completed, object };
  }

  /** Abort a session and remove any stored parts. */
  async abort(actor: Actor, id: Uuid): Promise<UploadSession> {
    const session = await this.get(actor, id);
    if (!session.canEdit(actor)) {
      throw new ForbiddenException("You cannot abort this session.");
    }
    const aborted = session.abort(this.clock.now());
    for (const n of session.receivedParts) {
      if (await this.storage.exists(partKey(id, n))) {
        await this.storage.delete(partKey(id, n));
      }
    }
    await this.repo.save(aborted);
    this.contentTypes.delete(id);
    return aborted;
  }
}
