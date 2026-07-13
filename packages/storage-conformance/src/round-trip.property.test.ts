import { describe, it, expect, afterAll } from "vitest";
import fc from "fast-check";
import { StorageRouter } from "@streetstudio/media";
import {
  conformanceTargets,
  cleanupTempDirs,
  drain,
  streamFromBytes,
  type ProviderUnderTest,
} from "./index.js";

/**
 * Property 27: Storage round-trip preserves object bytes.
 *
 * Feature: streetstudio, Property 27: Storage round-trip preserves object bytes
 *
 * Validates: Requirements 9.1
 *
 * This is the shared provider conformance run of Property 27: for EVERY storage
 * provider plugin (Local, S3, R2, MinIO, Azure Blob, GCS), routing a write and
 * a subsequent read through the StorageProvider interface (via the
 * StorageRouter, R9.1) returns bytes identical to those written. The suite runs
 * against real backends where reachable (opt-in via env + a registered client)
 * and against the Local/in-memory-backed providers otherwise, so it is
 * deterministic here while remaining ready to target real backends in CI.
 */

const targets: ProviderUnderTest[] = conformanceTargets();

afterAll(async () => {
  await cleanupTempDirs();
});

describe("Feature: streetstudio, Property 27: Storage round-trip preserves object bytes", () => {
  it("enrolls every storage provider plugin in the conformance suite", () => {
    expect(targets.map((t) => t.name).sort()).toEqual(
      ["Azure Blob", "GCS", "Local", "MinIO", "R2", "S3"].sort(),
    );
  });

  for (const target of targets) {
    it(`${target.name} (${target.backend}): get after put returns exactly the bytes written`, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Safe, non-empty object key usable by every backend (incl. Local).
          fc
            .array(fc.stringMatching(/^[a-z0-9_-]{1,16}$/), {
              minLength: 1,
              maxLength: 4,
            })
            .map((segs) => segs.join("/")),
          // Arbitrary payload, including empty and larger buffers.
          fc.uint8Array({ minLength: 0, maxLength: 2048 }),
          // Source-stream chunking, to exercise single- and multi-chunk writes.
          fc.integer({ min: 1, max: 512 }),
          async (key, payload, chunkSize) => {
            const instance = await target.create();
            try {
              const router = new StorageRouter();
              await router.activate(instance.provider);

              const result = await router.put(
                key,
                streamFromBytes(payload, chunkSize),
              );
              expect(result.key).toBe(key);

              const recovered = await drain(await router.get(key));

              expect(recovered.length).toBe(payload.length);
              expect(Array.from(recovered)).toEqual(Array.from(payload));
            } finally {
              await instance.cleanup();
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  }
});
