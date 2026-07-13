import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { ReadableStream } from "node:stream/web";
import {
  StorageRouter,
  type ObjectStream,
  type PutResult,
  type SignedTarget,
  type StorageProvider,
} from "./storage.js";

/**
 * Property 27: Storage round-trip preserves object bytes.
 *
 * Feature: streetstudio, Property 27: Storage round-trip preserves object bytes
 *
 * Validates: Requirements 9.1
 *
 * For any media object written through the Storage_Provider interface (via the
 * StorageRouter), retrieving it returns bytes identical to those written. The
 * router routes put/get exclusively through the active provider, so exercising
 * put(key, bytes) followed by get(key) and comparing the recovered bytes to the
 * original payload verifies end-to-end byte preservation across the abstraction.
 */

/* -------------------------------------------------------------------------
 * Stream helpers — treat ObjectStream as the real ReadableStream<Uint8Array>.
 * ---------------------------------------------------------------------- */

/**
 * Build an {@link ObjectStream} from `bytes`, optionally emitting the payload in
 * several chunks so the round-trip is exercised against multi-chunk streams too.
 */
function streamFromBytes(bytes: Uint8Array, chunkSize: number): ObjectStream {
  const size = Math.max(1, chunkSize);
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + size, bytes.length);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  }) as ObjectStream;
}

/** Fully drain an {@link ObjectStream} into a single contiguous byte array. */
async function drain(stream: ObjectStream): Promise<Uint8Array> {
  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value !== undefined) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

/* -------------------------------------------------------------------------
 * In-memory StorageProvider test double.
 *
 * On put it consumes the incoming stream to bytes (as a real backend would) and
 * stores those bytes; on get it produces a fresh stream from the stored bytes.
 * This makes the double a faithful persistence backend for the round-trip.
 * ---------------------------------------------------------------------- */

class InMemoryStorageProvider implements StorageProvider {
  readonly id = "in-memory";
  private readonly objects = new Map<string, Uint8Array>();

  async put(key: string, data: ObjectStream): Promise<PutResult> {
    const bytes = await drain(data);
    // Copy so later external mutation of the source buffer cannot affect storage.
    this.objects.set(key, bytes.slice());
    return { key, sizeBytes: bytes.length };
  }

  async get(key: string): Promise<ObjectStream> {
    const found = this.objects.get(key);
    if (found === undefined) {
      throw new Error(`no object for ${key}`);
    }
    return streamFromBytes(found, found.length || 1);
  }

  async signUploadTarget(key: string, ttlSeconds: number): Promise<SignedTarget> {
    const issued = new Date(0);
    return {
      key,
      providerId: this.id,
      url: `memory://${key}`,
      issuedAt: issued.toISOString(),
      expiresAt: new Date(issued.getTime() + ttlSeconds * 1000).toISOString(),
      ttlSeconds,
    };
  }

  async healthCheck(): Promise<void> {
    /* always healthy */
  }
}

describe("Feature: streetstudio, Property 27: Storage round-trip preserves object bytes", () => {
  it("get after put returns exactly the bytes written, for arbitrary keys and payloads", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Arbitrary object key (non-empty, no assumptions on structure).
        fc.string({ minLength: 1, maxLength: 128 }),
        // Arbitrary byte payload, including empty and large-ish buffers.
        fc.uint8Array({ minLength: 0, maxLength: 2048 }),
        // Chunking of the source stream, to exercise single- and multi-chunk writes.
        fc.integer({ min: 1, max: 512 }),
        async (key, payload, chunkSize) => {
          const router = new StorageRouter();
          await router.activate(new InMemoryStorageProvider());

          const result = await router.put(key, streamFromBytes(payload, chunkSize));
          expect(result.key).toBe(key);

          const recovered = await drain(await router.get(key));

          // Byte-for-byte identical: same length and same bytes in order.
          expect(recovered.length).toBe(payload.length);
          expect(Array.from(recovered)).toEqual(Array.from(payload));
        },
      ),
      { numRuns: 100 },
    );
  });
});
