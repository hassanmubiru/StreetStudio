import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import {
  AiProviderRegistry,
  StreetAiRouter,
  AI_CAPABILITIES,
  type AiCapability,
  type AiProviderHandler,
  type AiRequest,
  type AiResult,
} from "./ai-router.js";

/**
 * Property 68: AI requests route to the enabled provider or fail cleanly.
 *
 * Feature: streetstudio, Property 68: AI requests route to the enabled provider or fail cleanly
 *
 * Validates: Requirements 22.2, 22.3
 *
 * For arbitrary capabilities and arbitrary enabled/disabled provider
 * configurations, {@link StreetAiRouter.route} dispatches to the provider
 * enabled for the requested capability and returns its result (R22.2), OR —
 * when no provider is enabled for that capability — rejects cleanly with
 * `AI_UNAVAILABLE` without side effects (R22.3). Providers enabled for *other*
 * capabilities are never invoked (routing is precise), which stands in for the
 * "non-AI features unaffected" guarantee at the router seam.
 */

// --- Generators -----------------------------------------------------------

/** Any single routable capability. */
const capabilityArb: fc.Arbitrary<AiCapability> = fc.constantFrom(...AI_CAPABILITIES);

/** An opaque, arbitrary request payload. */
const payloadArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.object()
);

/**
 * A configuration is the set of capabilities that currently have an enabled
 * provider. Using a subset of the fixed capability list keeps the input space
 * meaningful (a capability is either enabled or not).
 */
const enabledSetArb: fc.Arbitrary<AiCapability[]> = fc
  .subarray([...AI_CAPABILITIES])
  .map((caps) => [...caps]);

// --- Helpers --------------------------------------------------------------

/**
 * Build a registry whose enabled capabilities are exactly `enabled`. Each
 * enabled provider records that it was invoked and echoes a distinctive,
 * capability-tagged output so we can assert the router returned the *right*
 * provider's result.
 */
function buildRegistry(enabled: readonly AiCapability[]): {
  registry: AiProviderRegistry;
  invoked: Map<AiCapability, number>;
} {
  const registry = new AiProviderRegistry();
  const invoked = new Map<AiCapability, number>();
  for (const cap of enabled) {
    const handler: AiProviderHandler = {
      pluginId: `provider-${cap}`,
      handle: async (req: AiRequest): Promise<AiResult> => {
        invoked.set(cap, (invoked.get(cap) ?? 0) + 1);
        return { capability: cap, output: { tag: `out-${cap}`, echoed: req.payload } };
      },
    };
    registry.register(cap, handler);
  }
  return { registry, invoked };
}

describe("Feature: streetstudio, Property 68: AI requests route to the enabled provider or fail cleanly", () => {
  it("routes to the enabled provider for the capability, else rejects with AI_UNAVAILABLE", async () => {
    await fc.assert(
      fc.asyncProperty(
        enabledSetArb,
        capabilityArb,
        payloadArb,
        async (enabled, capability, payload) => {
          const { registry, invoked } = buildRegistry(enabled);
          const router = new StreetAiRouter({ resolver: registry });
          const req: AiRequest = { capability, payload };
          const isEnabled = enabled.includes(capability);

          if (isEnabled) {
            // R22.2: dispatched to the enabled provider for THIS capability and
            // returns exactly that provider's result.
            const result = await router.route(capability, req);
            expect(result).toEqual({
              capability,
              output: { tag: `out-${capability}`, echoed: payload },
            });
            // The correct provider ran exactly once...
            expect(invoked.get(capability)).toBe(1);
            // ...and no provider enabled for a different capability was invoked.
            for (const other of enabled) {
              if (other !== capability) {
                expect(invoked.get(other) ?? 0).toBe(0);
              }
            }
          } else {
            // R22.3: no provider enabled for this capability -> reject cleanly
            // with AI_UNAVAILABLE and no side effects (no provider invoked).
            await expect(router.route(capability, req)).rejects.toMatchObject({
              code: "AI_UNAVAILABLE",
            });
            for (const cap of AI_CAPABILITIES) {
              expect(invoked.get(cap) ?? 0).toBe(0);
            }
          }

          return true;
        }
      ),
      { numRuns: 200 }
    );
  });

  it("rejection when unavailable is an AppError and leaves providers for other capabilities usable", async () => {
    await fc.assert(
      fc.asyncProperty(enabledSetArb, capabilityArb, async (enabled, capability) => {
        // Force the "unavailable" branch: disable exactly the requested capability.
        const withoutTarget = enabled.filter((c) => c !== capability);
        const { registry, invoked } = buildRegistry(withoutTarget);
        const router = new StreetAiRouter({ resolver: registry });

        // The unavailable request fails cleanly with the uniform error code.
        const err = await router
          .route(capability, { capability, payload: {} })
          .then(
            () => null,
            (e: unknown) => e
          );
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe("AI_UNAVAILABLE");
        expect(invoked.get(capability) ?? 0).toBe(0);

        // Non-AI-target features are unaffected: any still-enabled capability
        // continues to route and return its provider's result.
        for (const other of withoutTarget) {
          const result = await router.route(other, { capability: other, payload: {} });
          expect(result.capability).toBe(other);
          expect(invoked.get(other)).toBe(1);
        }

        return true;
      }),
      { numRuns: 200 }
    );
  });
});
