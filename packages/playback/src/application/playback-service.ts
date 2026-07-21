/**
 * Playback use case: authorized retrieval of a completed upload's assembled
 * object for streaming. Composes `@streetjs/storage` (real bytes) and the
 * uploads repository (authorization: the object must belong to a completed
 * upload in the actor's organization). Includes a pure HTTP `Range` parser.
 */
import type { Storage } from "@streetjs/storage";
import { UploadSessionRepository, type Actor } from "@streetstudio/uploads";

/** A resolved, authorized playback object. */
export interface PlaybackObject {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly size: number;
}

/** An inclusive byte range `[start, end]`. */
export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

/**
 * Parse an HTTP `Range` header for a resource of `size` bytes. Returns:
 * - `null` when there is no (or an unparseable/multi-range) header → serve full;
 * - `"unsatisfiable"` when the range lies outside the resource → 416;
 * - a single inclusive {@link ByteRange} otherwise. Pure and deterministic.
 */
export function parseRange(
  header: string | undefined,
  size: number,
): ByteRange | null | "unsatisfiable" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const rawStart = match[1] ?? "";
  const rawEnd = match[2] ?? "";
  if (rawStart === "" && rawEnd === "") return null;

  let start: number;
  let end: number;
  if (rawStart === "") {
    // Suffix range: the last `rawEnd` bytes.
    const suffix = Number(rawEnd);
    if (suffix <= 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return "unsatisfiable";
  }
  return { start, end };
}

export class PlaybackService {
  constructor(
    private readonly storage: Storage,
    private readonly uploads: UploadSessionRepository,
  ) {}

  /**
   * Resolve an object for playback if the actor's organization owns a completed
   * upload with that key. Returns `null` (→ 404) when unauthorized or absent —
   * existence is not disclosed across organizations.
   */
  async resolve(actor: Actor, objectKey: string): Promise<PlaybackObject | null> {
    const session = await this.uploads.findCompletedByObjectKey(actor.organizationId, objectKey);
    if (!session) return null;
    const got = await this.storage.get(objectKey);
    if (!got.found || !got.bytes) return null;
    return {
      bytes: got.bytes,
      contentType: got.metadata?.contentType ?? "application/octet-stream",
      size: got.bytes.length,
    };
  }
}
