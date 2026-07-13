import { describe, it, expect, afterAll } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import {
  StorageRouter,
  SIGNED_UPLOAD_MIN_TTL_SECONDS,
  SIGNED_UPLOAD_MAX_TTL_SECONDS,
  SIGNED_UPLOAD_DEFAULT_TTL_SECONDS,
  DIRECT_UPLOAD_MAX_TTL_SECONDS,
  type SignedTarget,
} from "@streetstudio/media";
import {
  conformanceTargets,
  cleanupTempDirs,
  type ConformanceClock,
  type ProviderUnderTest,
} from "./index.js";

/**
 * Property 29: Signed upload credentials have bounded, secure expiry.
 *
 * Feature: streetstudio, Property 29: Signed upload credentials have bounded, secure expiry
 *
 * Validates: Requirements 9.6, 9.7, 29.3
 *
 * The shared provider conformance run of Property 29: for EVERY storage provider
 * plugin, the signed upload target the provider issues through the StorageRouter
 *  - is capped to a validity within [60, 900]s (default 900), so direct-to-
 *    storage credentials always expire within 15 minutes of issuance (R9.6,
 *    R29.3);
 *  - is refused with STORAGE_CONFIG_INVALID (and no target produced) for any ttl
 *    outside [60, 3600]s or non-integer (R9.6);
 *  - is accepted before its expiry instant and rejected with
 *    SIGNED_TARGET_EXPIRED at/after it, for arbitrary presentation instants
 *    (R9.7).
 * The suite runs against real backends where reachable and Local/in-memory
 * otherwise, so it is deterministic here.
 */

/** A fixed clock so signed-target issuance/expiry decisions are deterministic. */
function fixedClock(atMs: number): ConformanceClock {
  return { now: () => new Date(atMs) };
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

/**
 * A safe object key accepted by every provider, including the Local filesystem
 * provider (no leading separator, no `..` segments, no NUL). Property 29 is
 * about expiry bounds, so keys are constrained to the shared valid key space.
 */
const safeKeyArb = fc
  .array(fc.stringMatching(/^[a-z0-9_-]{1,16}$/), { minLength: 1, maxLength: 4 })
  .map((segs) => segs.join("/"));

const targets: ProviderUnderTest[] = conformanceTargets();

afterAll(async () => {
  await cleanupTempDirs();
});

describe("Feature: streetstudio, Property 29: Signed upload credentials have bounded, secure expiry", () => {
  for (const target of targets) {
    describe(`${target.name} (${target.backend})`, () => {
      it("issues targets with validity capped to [60, 900]s (default 900) for any in-range ttl", async () => {
        await fc.assert(
          fc.asyncProperty(
            safeKeyArb,
            issuedAtMsArb,
            fc.oneof(
              fc.integer({
                min: SIGNED_UPLOAD_MIN_TTL_SECONDS,
                max: SIGNED_UPLOAD_MAX_TTL_SECONDS,
              }),
              fc.constant<null>(null),
            ),
            async (key, issuedAtMs, ttl) => {
              const clock = fixedClock(issuedAtMs);
              const instance = await target.create(clock);
              try {
                const router = new StorageRouter({ clock });
                await router.activate(instance.provider);

                const requestedTtl = ttl ?? SIGNED_UPLOAD_DEFAULT_TTL_SECONDS;
                const expectedEffective = Math.min(
                  requestedTtl,
                  DIRECT_UPLOAD_MAX_TTL_SECONDS,
                );

                const signed =
                  ttl === null
                    ? await router.signUploadTarget(key)
                    : await router.signUploadTarget(key, ttl);

                expect(signed.ttlSeconds).toBe(expectedEffective);
                expect(signed.providerId).toBe(instance.provider.id);

                const validity = validitySeconds(signed);
                expect(validity).toBe(expectedEffective);
                expect(validity).toBeGreaterThanOrEqual(
                  SIGNED_UPLOAD_MIN_TTL_SECONDS,
                );
                expect(validity).toBeLessThanOrEqual(
                  DIRECT_UPLOAD_MAX_TTL_SECONDS,
                );

                const spanMs =
                  new Date(signed.expiresAt).getTime() -
                  new Date(signed.issuedAt).getTime();
                expect(spanMs).toBeLessThanOrEqual(
                  DIRECT_UPLOAD_MAX_TTL_SECONDS * 1000,
                );
              } finally {
                await instance.cleanup();
              }
            },
          ),
          { numRuns: 100 },
        );
      });

      it("rejects any ttl outside [60, 3600] (or non-integer) with STORAGE_CONFIG_INVALID", async () => {
        await fc.assert(
          fc.asyncProperty(
            safeKeyArb,
            issuedAtMsArb,
            fc.oneof(
              fc.integer({
                min: -10_000,
                max: SIGNED_UPLOAD_MIN_TTL_SECONDS - 1,
              }),
              fc.integer({
                min: SIGNED_UPLOAD_MAX_TTL_SECONDS + 1,
                max: 1_000_000,
              }),
              fc
                .double({ min: 60.0001, max: 3599.9999, noNaN: true })
                .filter((n) => !Number.isInteger(n)),
            ),
            async (key, issuedAtMs, badTtl) => {
              const clock = fixedClock(issuedAtMs);
              const instance = await target.create(clock);
              try {
                const router = new StorageRouter({ clock });
                await router.activate(instance.provider);

                let raised: unknown;
                try {
                  await router.signUploadTarget(key, badTtl);
                } catch (err) {
                  raised = err;
                }

                expect(raised).toBeInstanceOf(AppError);
                expect((raised as AppError).code).toBe("STORAGE_CONFIG_INVALID");
              } finally {
                await instance.cleanup();
              }
            },
          ),
          { numRuns: 100 },
        );
      });

      it("accepts a target before its expiry and rejects it at/after expiry for arbitrary presentation instants", async () => {
        await fc.assert(
          fc.asyncProperty(
            safeKeyArb,
            issuedAtMsArb,
            fc.integer({
              min: SIGNED_UPLOAD_MIN_TTL_SECONDS,
              max: SIGNED_UPLOAD_MAX_TTL_SECONDS,
            }),
            fc.integer({ min: -60_000, max: 20 * 60 * 1000 }),
            async (key, issuedAtMs, ttl, presentOffsetMs) => {
              const issuingClock = fixedClock(issuedAtMs);
              const instance = await target.create(issuingClock);
              try {
                const issuingRouter = new StorageRouter({ clock: issuingClock });
                await issuingRouter.activate(instance.provider);
                const signed = await issuingRouter.signUploadTarget(key, ttl);

                const expiresAtMs = new Date(signed.expiresAt).getTime();
                const presentAtMs = issuedAtMs + presentOffsetMs;
                const shouldBeExpired = presentAtMs >= expiresAtMs;

                const presentingRouter = new StorageRouter({
                  clock: fixedClock(presentAtMs),
                });
                await presentingRouter.activate(instance.provider);

                expect(presentingRouter.isUploadTargetExpired(signed)).toBe(
                  shouldBeExpired,
                );

                if (shouldBeExpired) {
                  let raised: unknown;
                  try {
                    presentingRouter.assertUploadTargetValid(signed);
                  } catch (err) {
                    raised = err;
                  }
                  expect(raised).toBeInstanceOf(AppError);
                  expect((raised as AppError).code).toBe(
                    "SIGNED_TARGET_EXPIRED",
                  );
                } else {
                  expect(() =>
                    presentingRouter.assertUploadTargetValid(signed),
                  ).not.toThrow();
                }
              } finally {
                await instance.cleanup();
              }
            },
          ),
          { numRuns: 100 },
        );
      });
    });
  }
});
