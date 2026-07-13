import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import {
  StorageRouter,
  type ObjectStream,
  type PutResult,
  type SignedTarget,
  type StorageProvider,
} from "./storage.js";

/**
 * Property 28: Storage provider activation validates configuration.
 *
 * Feature: streetstudio, Property 28: Storage provider activation validates configuration
 *
 * Validates: Requirements 9.4
 *
 * For any Storage_Provider activation, the router validates the provider's
 * configuration and connectivity through healthCheck() before making it active:
 *  - Activating a provider whose healthCheck() succeeds makes it the active
 *    provider.
 *  - Activating a provider whose healthCheck() fails is rejected with
 *    STORAGE_CONFIG_INVALID and RETAINS the previously active provider (or none
 *    when nothing was active).
 *
 * Consequently, across any arbitrary sequence of activation attempts mixing
 * healthy and unhealthy providers, the active provider is always the last
 * provider whose activation succeeded (or none, if none has yet succeeded).
 */

/**
 * A minimal in-memory {@link StorageProvider} whose activation outcome is driven
 * solely by the `healthy` flag. The read/write surface is unused here — only
 * activation (healthCheck) behaviour is under test.
 */
class FakeProvider implements StorageProvider {
  readonly id: string;
  private readonly healthy: boolean;

  constructor(id: string, healthy: boolean) {
    this.id = id;
    this.healthy = healthy;
  }

  async put(key: string, _data: ObjectStream): Promise<PutResult> {
    return { key };
  }

  async get(_key: string): Promise<ObjectStream> {
    throw new Error("not used");
  }

  async signUploadTarget(_key: string, _ttlSeconds: number): Promise<SignedTarget> {
    throw new Error("not used");
  }

  async healthCheck(): Promise<void> {
    if (!this.healthy) {
      throw new Error("connectivity check failed");
    }
  }
}

/** A single activation attempt in a generated sequence. */
interface Attempt {
  readonly id: string;
  readonly healthy: boolean;
}

describe("Feature: streetstudio, Property 28: Storage provider activation validates configuration", () => {
  it("keeps the last successfully-activated provider active across arbitrary healthy/unhealthy activation sequences", async () => {
    const attempt = fc.record({
      // A small pool of ids so successful re-activations of the same id occur.
      id: fc.constantFrom("s3", "r2", "azure", "gcs", "local", "minio"),
      healthy: fc.boolean(),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(attempt, { minLength: 1, maxLength: 30 }),
        async (attempts: Attempt[]) => {
          const router = new StorageRouter();

          // The oracle: the id of the last attempt whose healthCheck succeeded,
          // or null while none has succeeded yet.
          let expectedActive: string | null = null;

          for (const a of attempts) {
            const priorActive = router.activeProviderId;

            if (a.healthy) {
              // A healthy provider activates cleanly and becomes active.
              await router.activate(new FakeProvider(a.id, true));
              expectedActive = a.id;
              expect(router.activeProviderId).toBe(a.id);
            } else {
              // An unhealthy provider is rejected with STORAGE_CONFIG_INVALID
              // and the previously active provider is retained unchanged.
              let raised: unknown;
              try {
                await router.activate(new FakeProvider(a.id, false));
              } catch (err) {
                raised = err;
              }
              expect(raised).toBeInstanceOf(AppError);
              expect((raised as AppError).code).toBe("STORAGE_CONFIG_INVALID");
              // R9.4: activation rejected -> prior active provider retained.
              expect(router.activeProviderId).toBe(priorActive);
            }

            // Invariant after every attempt: the active provider is exactly the
            // last successfully-activated one (or none).
            expect(router.activeProviderId).toBe(expectedActive);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
