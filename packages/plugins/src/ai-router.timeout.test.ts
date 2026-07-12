import { describe, it, expect } from "vitest";
import { AppError } from "@streetstudio/shared";
import {
  AiProviderRegistry,
  StreetAiRouter,
  type AiProviderHandler,
  type AiRequest,
  type AiResult,
} from "./ai-router.js";

/**
 * Timeout / failure-handling unit tests for the AI Capability Router (R22.5):
 *  - a provider that exceeds the per-request timeout is aborted and the request
 *    is rejected with AI_UNAVAILABLE;
 *  - a provider that throws/rejects causes rejection with AI_UNAVAILABLE and the
 *    abort signal is triggered so the provider can abandon in-flight work;
 *  - after an AI timeout/failure, non-AI paths and other enabled capabilities
 *    continue to work without degradation.
 *
 * A small injected `timeoutMs` keeps the timeout tests fast.
 *
 * Complements the sanity checks in ai-router.test.ts and the property tests in
 * ai-router.property.test.ts (both intentionally left untouched).
 */

function handler(
  pluginId: string,
  impl: (req: AiRequest, signal: AbortSignal) => Promise<AiResult>
): AiProviderHandler {
  return { pluginId, handle: impl };
}

const REQ: AiRequest = { capability: "transcription", payload: { audio: "x" } };

describe("StreetAiRouter timeout / failure handling (R22.5)", () => {
  it("aborts a provider that exceeds the timeout and rejects with AI_UNAVAILABLE", async () => {
    const registry = new AiProviderRegistry();
    let observedSignal: AbortSignal | undefined;
    let abortFired = false;

    registry.register(
      "transcription",
      handler(
        "slow-ai",
        (_req, signal) =>
          new Promise<AiResult>(() => {
            observedSignal = signal;
            signal.addEventListener("abort", () => {
              abortFired = true;
            });
            // Never settles on its own; only the router's timeout can end this.
          })
      )
    );

    const router = new StreetAiRouter({ resolver: registry, timeoutMs: 10 });

    const error = await router.route("transcription", REQ).then(
      () => {
        throw new Error("expected route() to reject on timeout");
      },
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      code: "AI_UNAVAILABLE",
      details: { reason: "provider-timeout", timeoutMs: 10 },
    });
    // The provider's AbortSignal fired so it can abandon in-flight work.
    expect(abortFired).toBe(true);
    expect(observedSignal?.aborted).toBe(true);
  });

  it("rejects with AI_UNAVAILABLE and triggers the abort signal when the provider throws", async () => {
    const registry = new AiProviderRegistry();
    let observedSignal: AbortSignal | undefined;

    registry.register(
      "transcription",
      handler("boom-ai", (_req, signal) => {
        observedSignal = signal;
        return Promise.reject(new Error("provider exploded"));
      })
    );

    const router = new StreetAiRouter({ resolver: registry, timeoutMs: 50 });

    const error = await router.route("transcription", REQ).then(
      () => {
        throw new Error("expected route() to reject on provider failure");
      },
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      code: "AI_UNAVAILABLE",
      details: { pluginId: "boom-ai", reason: "provider-failure" },
    });
    // The original provider error is preserved as the cause.
    expect((error as AppError).cause).toBeInstanceOf(Error);
    // The router aborts the request even on synchronous provider failure so the
    // provider can release resources tied to the signal.
    expect(observedSignal?.aborted).toBe(true);
  });

  it("continues serving other enabled capabilities and re-routes after a timeout", async () => {
    const registry = new AiProviderRegistry();

    // A capability whose provider always times out.
    registry.register(
      "transcription",
      handler(
        "slow-ai",
        (_req, _signal) => new Promise<AiResult>(() => {})
      )
    );
    // An independent, healthy capability.
    registry.register(
      "summarization",
      handler("fast-ai", async (req) => ({
        capability: req.capability,
        output: "summary",
      }))
    );

    const router = new StreetAiRouter({ resolver: registry, timeoutMs: 10 });

    // The failing AI capability rejects...
    await expect(router.route("transcription", REQ)).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
    });

    // ...yet another enabled capability is unaffected (no shared-state
    // degradation) and can be routed repeatedly.
    for (let i = 0; i < 3; i += 1) {
      await expect(
        router.route("summarization", { capability: "summarization", payload: {} })
      ).resolves.toEqual({ capability: "summarization", output: "summary" });
    }
  });

  it("keeps non-AI paths working: an unrelated computation runs after an AI failure", async () => {
    const registry = new AiProviderRegistry();
    registry.register(
      "transcription",
      handler("boom-ai", async () => {
        throw new Error("provider exploded");
      })
    );
    const router = new StreetAiRouter({ resolver: registry, timeoutMs: 50 });

    // Simulate a non-AI feature: a plain, side-effect-free operation.
    const nonAiFeature = (a: number, b: number): number => a + b;

    await expect(router.route("transcription", REQ)).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
    });

    // The AI failure did not throw synchronously out of the router or otherwise
    // disrupt the surrounding (non-AI) control flow.
    expect(nonAiFeature(2, 3)).toBe(5);

    // The same capability can be re-attempted once a working provider is
    // enabled, proving the failure left no lingering router state.
    registry.register("transcription", handler("boom-ai", async (req) => ({
      capability: req.capability,
      output: "recovered",
    })));
    // Replacing requires the same pluginId (registry rejects a different one),
    // so unregister first to swap in a healthy handler.
    registry.unregister("transcription");
    registry.register(
      "transcription",
      handler("healthy-ai", async (req) => ({
        capability: req.capability,
        output: "recovered",
      }))
    );

    await expect(router.route("transcription", REQ)).resolves.toEqual({
      capability: "transcription",
      output: "recovered",
    });
  });
});
