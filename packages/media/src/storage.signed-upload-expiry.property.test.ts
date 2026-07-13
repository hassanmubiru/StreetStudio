import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { Clock } from "@streetstudio/auth";
import {
  StorageRouter,
  SIGNED_UPLOAD_MIN_TTL_SECONDS,
  SIGNED_UPLOAD_MAX_TTL_SECONDS,
  SIGNED_UPLOAD_DEFAULT_TTL_SECONDS,
  DIRECT_UPLOAD_MAX_TTL_SECONDS,
  type ObjectStream,
  type PutResult,
  type SignedTarget,
  type StorageProvider,
} from "./storage.js";

/**
 * Property 29: Signed upload credentials have bounded, secure expiry.
 *
 * Feature: streetstudio, Property 29: Signed upload credentials have bounded, secure expiry
 *
 * Validates: Requirements 9.6, 9.7, 29.3
 *
 * For any signed upload target the StorageRouter issues:
 *  - The requested ttl must fall within [60, 3600] seconds (defaulting to 900);
 *    a ttl outside that range (or non-integer) is rejected with
 *    STORAGE_CONFIG_INVALID and no target is produced (R9.6).
 *  - The issued validity window is capped so that direct-to-storage credentials
 *    expire within 15 minutes (900s) of issuance: the effective validity is
 *    min(ttl, 900) and always lies within [60, 900] (R9.6, R29.3).
 *  - A target presented at or after its expiry instant is rejected with
 *    SIGNED_TARGET_EXPIRED, while one presented before its expiry is accepted;
 *    this holds for arbitrary presentation instants read from the injected
 *    clock (R9.7).
 */

/* -------------------------------------------------------------------------
 * Test doubles
 * ---------------------------------------------------------------------- */

/** A fixed clock so signed-target expiry decisions are deterministic. */
function fixedClock(atMs: number): Clock {
  return { now: () => new Date(atMs) };
}

/**
 * An in-memory {@link StorageProvider} that stamps signed targets from a base
 * issuance instant and the effective ttl the router passes in. It records the
 * last ttl it was asked to sign so the router's bounding can be observed.
 */
class FakeProvider implements StorageProvider {
  readonly id = "fake-provider";
  private readonly issuedAtMs: number;
  lastSignTtl: number | null = null;

  constructor(issuedAtMs: number) {
    this.issuedAtMs = issuedAtMs;
  }

  async put(key: string, _data: ObjectStream): Promise<PutResult> {
    return { key };
  }

  async get(_key: string): Promise<ObjectStream> {
    throw new Error("not used");
  }

  async signUploadTarget(key: string, ttlSeconds: number): Promise<SignedTarget> {
    this.lastSignTtl = ttlSeconds;
    const issued = new Date(this.issuedAtMs);
    const expires = new Date(this.issuedAtMs + ttlSeconds * 1000);
    return {
      key,
      providerId: this.id,
      url: `https://storage.example/${this.id}/${key}`,
      method: "PUT",
      issuedAt: issued.toISOString(),
      expiresAt: expires.toISOString(),
      ttlSeconds,
    };
  }

  async healthCheck(): Promise<void> {
    /* always healthy */
  }
}

/** Whole-second validity window of a signed target. */
function validitySeconds(target: SignedTarget): number {
  const issued = new Date(target.issuedAt).getTime();
  const expires = new Date(target.expiresAt).getTime();
  return Math.round((expires - issued) / 1000);
}

/** Arbitrary issuance instant across a broad epoch-millisecond range. */
const issuedAtMsArb = fc.integer({
  min: Date.UTC(1971, 0, 1),
  max: Date.UTC(2100, 0, 1),
});

describe("Feature: streetstudio, Property 29: Signed upload credentials have bounded, secure expiry", () => {
  it("issues targets with validity capped to [60, 900]s (default 900) for any in-range ttl", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }),
        issuedAtMsArb,
        // An in-range ttl, plus the sentinel to exercise the default path.
        fc.oneof(
          fc.integer({
            min: SIGNED_UPLOAD_MIN_TTL_SECONDS,
            max: SIGNED_UPLOAD_MAX_TTL_SECONDS,
          }),
          fc.constant<null>(null),
        ),
        async (key, issuedAtMs, ttl) => {
          const provider = new FakeProvider(issuedAtMs);
          const router = new StorageRouter({ clock: fixedClock(issuedAtMs) });
          await router.activate(provider);

          const requestedTtl = ttl ?? SIGNED_UPLOAD_DEFAULT_TTL_SECONDS;
          const expectedEffective = Math.min(
            requestedTtl,
            DIRECT_UPLOAD_MAX_TTL_SECONDS,
          );

          const target =
            ttl === null
              ? await router.signUploadTarget(key)
              : await router.signUploadTarget(key, ttl);

          // The provider was asked to sign with the capped ttl (R9.6, R29.3).
          expect(provider.lastSignTtl).toBe(expectedEffective);
          expect(target.ttlSeconds).toBe(expectedEffective);

          // The actual issued validity window is capped to 15 minutes and never
          // shorter than the configured minimum.
          const validity = validitySeconds(target);
          expect(validity).toBe(expectedEffective);
          expect(validity).toBeGreaterThanOrEqual(SIGNED_UPLOAD_MIN_TTL_SECONDS);
          expect(validity).toBeLessThanOrEqual(DIRECT_UPLOAD_MAX_TTL_SECONDS);

          // Expiry is at most 15 minutes after issuance (R29.3).
          const spanMs =
            new Date(target.expiresAt).getTime() -
            new Date(target.issuedAt).getTime();
          expect(spanMs).toBeLessThanOrEqual(
            DIRECT_UPLOAD_MAX_TTL_SECONDS * 1000,
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it("rejects any ttl outside [60, 3600] (or non-integer) with STORAGE_CONFIG_INVALID", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }),
        issuedAtMsArb,
        fc.oneof(
          // Too small (including zero and negatives).
          fc.integer({ min: -10_000, max: SIGNED_UPLOAD_MIN_TTL_SECONDS - 1 }),
          // Too large.
          fc.integer({ min: SIGNED_UPLOAD_MAX_TTL_SECONDS + 1, max: 1_000_000 }),
          // Non-integer within the numeric range.
          fc
            .double({ min: 60.0001, max: 3599.9999, noNaN: true })
            .filter((n) => !Number.isInteger(n)),
        ),
        async (key, issuedAtMs, badTtl) => {
          const provider = new FakeProvider(issuedAtMs);
          const router = new StorageRouter({ clock: fixedClock(issuedAtMs) });
          await router.activate(provider);

          let raised: unknown;
          try {
            await router.signUploadTarget(key, badTtl);
          } catch (err) {
            raised = err;
          }

          expect(raised).toBeInstanceOf(AppError);
          expect((raised as AppError).code).toBe("STORAGE_CONFIG_INVALID");
          // No target was signed for an out-of-range request.
          expect(provider.lastSignTtl).toBeNull();
        },
      ),
      { numRuns: 200 },
    );
  });

  it("accepts a target before its expiry and rejects it at/after expiry for arbitrary presentation instants", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }),
        issuedAtMsArb,
        fc.integer({
          min: SIGNED_UPLOAD_MIN_TTL_SECONDS,
          max: SIGNED_UPLOAD_MAX_TTL_SECONDS,
        }),
        // Offset (ms) of the presentation instant relative to issuance, spanning
        // well before and well after the (capped) expiry.
        fc.integer({ min: -60_000, max: 20 * 60 * 1000 }),
        async (key, issuedAtMs, ttl, presentOffsetMs) => {
          const provider = new FakeProvider(issuedAtMs);

          // Sign the target at issuance time.
          const issuingRouter = new StorageRouter({
            clock: fixedClock(issuedAtMs),
          });
          await issuingRouter.activate(provider);
          const target = await issuingRouter.signUploadTarget(key, ttl);

          const expiresAtMs = new Date(target.expiresAt).getTime();
          const presentAtMs = issuedAtMs + presentOffsetMs;
          const shouldBeExpired = presentAtMs >= expiresAtMs;

          // A router whose clock reads the presentation instant.
          const presentingRouter = new StorageRouter({
            clock: fixedClock(presentAtMs),
          });
          await presentingRouter.activate(provider);

          expect(presentingRouter.isUploadTargetExpired(target)).toBe(
            shouldBeExpired,
          );

          if (shouldBeExpired) {
            let raised: unknown;
            try {
              presentingRouter.assertUploadTargetValid(target);
            } catch (err) {
              raised = err;
            }
            expect(raised).toBeInstanceOf(AppError);
            expect((raised as AppError).code).toBe("SIGNED_TARGET_EXPIRED");
          } else {
            expect(() =>
              presentingRouter.assertUploadTargetValid(target),
            ).not.toThrow();
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
