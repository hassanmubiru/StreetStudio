import { describe, it, expect } from "vitest";
import { AppError } from "@streetstudio/shared";
import {
  AiProviderRegistry,
  StreetAiRouter,
  type AiCapability,
  type AiProviderHandler,
  type AiRequest,
  type AiResult,
} from "./ai-router.js";

/**
 * Sanity checks for the AI Capability Router (R22.2, R22.3, R22.5). Exhaustive
 * property/timeout coverage lives in tasks 27.2 and 27.3.
 */

function handler(
  pluginId: string,
  impl: (req: AiRequest, signal: AbortSignal) => Promise<AiResult>
): AiProviderHandler {
  return { pluginId, handle: impl };
}

const REQ: AiRequest = { capability: "transcription", payload: { audio: "x" } };

describe("StreetAiRouter", () => {
  it("routes to the enabled provider for the capability (R22.2)", async () => {
    const registry = new AiProviderRegistry();
    registry.register(
      "transcription",
      handler("acme-ai", async (req) => ({
        capability: req.capability,
        output: "transcript",
      }))
    );
    const router = new StreetAiRouter({ resolver: registry });

    const result = await router.route("transcription", REQ);

    expect(result).toEqual({ capability: "transcription", output: "transcript" });
  });

  it("rejects with AI_UNAVAILABLE when no provider is enabled (R22.3)", async () => {
    const router = new StreetAiRouter({ resolver: new AiProviderRegistry() });

    await expect(router.route("summarization", { capability: "summarization", payload: {} }))
      .rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });

  it("aborts and rejects with AI_UNAVAILABLE on provider failure (R22.5)", async () => {
    const registry = new AiProviderRegistry();
    registry.register(
      "transcription",
      handler("boom-ai", async () => {
        throw new Error("provider exploded");
      })
    );
    const router = new StreetAiRouter({ resolver: registry });

    await expect(router.route("transcription", REQ)).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
    });
  });

  it("aborts and rejects with AI_UNAVAILABLE when the provider exceeds the timeout (R22.5)", async () => {
    const registry = new AiProviderRegistry();
    let aborted = false;
    registry.register(
      "transcription",
      handler(
        "slow-ai",
        (_req, signal) =>
          new Promise<AiResult>(() => {
            signal.addEventListener("abort", () => {
              aborted = true;
            });
            // Never settles on its own; the router's timeout must abort it.
          })
      )
    );
    const router = new StreetAiRouter({ resolver: registry, timeoutMs: 10 });

    await expect(router.route("transcription", REQ)).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
    });
    expect(aborted).toBe(true);
  });

  it("does not double-register different providers for one capability", () => {
    const registry = new AiProviderRegistry();
    registry.register("summarization", handler("a", async (r) => ({ capability: r.capability, output: 1 })));

    expect(() =>
      registry.register("summarization", handler("b", async (r) => ({ capability: r.capability, output: 2 })))
    ).toThrow(AppError);
  });

  it("reflects disable by resolving undefined after unregister", () => {
    const registry = new AiProviderRegistry();
    const h = handler("a", async (r) => ({ capability: r.capability, output: 1 }));
    registry.register("action-items", h);
    expect(registry.resolve("action-items")).toBe(h);

    registry.unregisterPlugin("a");
    const cap: AiCapability = "action-items";
    expect(registry.resolve(cap)).toBeUndefined();
  });
});
