/**
 * AI Capability Router.
 *
 * Implements Requirement 22 (AI Capabilities via Plugins):
 *  - AI capabilities are provided exclusively through AI_Provider plugins; the
 *    router only *routes* requests and contains no vendor implementation
 *    (R22.1, R22.4);
 *  - a request for a capability is dispatched to the AI_Provider enabled for
 *    that capability (R22.2);
 *  - when no provider is enabled for the requested capability the AI request is
 *    rejected within 2 seconds with {@link AI_UNAVAILABLE}; non-AI features are
 *    unaffected because rejection is synchronous and side-effect free (R22.3);
 *  - when the enabled provider fails or does not respond within 30 seconds the
 *    request is aborted and rejected with {@link AI_UNAVAILABLE}; again, non-AI
 *    features are unaffected (R22.5).
 *
 * Vendor specifics live entirely inside AI_Provider plugins, which implement
 * {@link AiProviderHandler}. Platform core depends only on these seams, so the
 * import-boundary rules that forbid a vendor reference in core (R22.6) hold.
 *
 * Internal module: import through the package entry point (`@streetstudio/plugins`).
 */
import { AppError } from "@streetstudio/shared";

/**
 * The AI capabilities the platform can route. Each maps to at most one enabled
 * AI_Provider at a time (R22.2).
 */
export type AiCapability =
  | "transcription"
  | "summarization"
  | "action-items"
  | "semantic-search";

/** Every routable AI capability, for iteration and validation. */
export const AI_CAPABILITIES: readonly AiCapability[] = Object.freeze([
  "transcription",
  "summarization",
  "action-items",
  "semantic-search",
]);

/**
 * Maximum time to reject a request when no provider is enabled (R22.3). The
 * router rejects synchronously, well inside this budget; the constant documents
 * the contract and lets callers assert against it.
 */
export const AI_REJECT_BUDGET_MS = 2_000;

/**
 * Maximum time an enabled provider has to respond before the request is aborted
 * and rejected (R22.5).
 */
export const AI_REQUEST_TIMEOUT_MS = 30_000;

/**
 * An AI request routed to a provider. The `payload` is opaque to core: its
 * shape is agreed between the caller and the provider for the given capability.
 */
export interface AiRequest {
  /** The capability this request targets. */
  readonly capability: AiCapability;
  /** Capability-specific input, opaque to the router. */
  readonly payload: unknown;
}

/** The result produced by a provider for an {@link AiRequest}. */
export interface AiResult {
  /** The capability that produced this result. */
  readonly capability: AiCapability;
  /** Capability-specific output, opaque to the router. */
  readonly output: unknown;
}

/**
 * A handler contributed by an enabled AI_Provider plugin that fulfills AI
 * requests. This is the only vendor-aware surface; its implementation lives in
 * the plugin, never in core (R22.1, R22.4).
 */
export interface AiProviderHandler {
  /** Identifier of the AI_Provider plugin backing this handler. */
  readonly pluginId: string;
  /**
   * Fulfill an AI request. Implementations SHOULD observe `signal` and abandon
   * work promptly when it aborts (the router aborts on timeout, R22.5).
   * Rejecting signals a provider failure, which the router treats as
   * {@link AI_UNAVAILABLE}.
   */
  handle(req: AiRequest, signal: AbortSignal): Promise<AiResult>;
}

/**
 * Resolves the AI_Provider handler enabled for a given capability, or
 * `undefined` when none is enabled. The Plugin_Manager (or host wiring) supplies
 * an implementation reflecting currently enabled AI_Provider plugins.
 */
export interface AiProviderResolver {
  /** The handler enabled for `capability`, or `undefined` if none (R22.2, R22.3). */
  resolve(capability: AiCapability): AiProviderHandler | undefined;
}

/** The router surface (mirrors the design's `AiRouter`). */
export interface AiRouter {
  /** Route an AI request to the enabled provider, or fail cleanly (R22.2, R22.3, R22.5). */
  route(capability: AiCapability, req: AiRequest): Promise<AiResult>;
}

/** Options for constructing a {@link StreetAiRouter}. */
export interface AiRouterOptions {
  /** Resolves the enabled AI_Provider for a capability (R22.2). */
  readonly resolver: AiProviderResolver;
  /**
   * Per-request timeout in milliseconds. Defaults to {@link AI_REQUEST_TIMEOUT_MS}
   * (R22.5). Primarily overridden for testing.
   */
  readonly timeoutMs?: number;
}

/**
 * Concrete AI Capability Router. It resolves the enabled provider for the
 * requested capability and dispatches the request, enforcing the timeout and
 * translating provider failures into a uniform {@link AI_UNAVAILABLE} error.
 *
 * It holds no vendor logic: all provider behaviour is reached through the
 * injected {@link AiProviderResolver} and {@link AiProviderHandler} (R22.1,
 * R22.4).
 */
export class StreetAiRouter implements AiRouter {
  private readonly resolver: AiProviderResolver;
  private readonly timeoutMs: number;

  constructor(options: AiRouterOptions) {
    this.resolver = options.resolver;
    this.timeoutMs = options.timeoutMs ?? AI_REQUEST_TIMEOUT_MS;
  }

  async route(capability: AiCapability, req: AiRequest): Promise<AiResult> {
    const handler = this.resolver.resolve(capability);
    if (handler === undefined) {
      // R22.3: no enabled provider -> reject immediately (well under 2s) with a
      // capability-unavailable error. No side effects, so non-AI features are
      // unaffected.
      throw new AppError("AI_UNAVAILABLE", {
        details: { capability, reason: "no-provider-enabled" },
      });
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      // Abort the provider so it can abandon in-flight work (R22.5).
      controller.abort();
    }, this.timeoutMs);
    // Do not keep the event loop alive solely for this timer.
    if (
      typeof timer === "object" &&
      typeof (timer as { unref?: () => void }).unref === "function"
    ) {
      (timer as { unref: () => void }).unref();
    }

    try {
      const result = await new Promise<AiResult>((resolve, reject) => {
        // The timeout is enforced independently of the provider promise so a
        // provider that never settles still aborts the request (R22.5).
        controller.signal.addEventListener(
          "abort",
          () => {
            if (timedOut) {
              reject(
                new AppError("AI_UNAVAILABLE", {
                  details: {
                    capability,
                    pluginId: handler.pluginId,
                    reason: "provider-timeout",
                    timeoutMs: this.timeoutMs,
                  },
                })
              );
            }
          },
          { once: true }
        );

        handler.handle(req, controller.signal).then(resolve, reject);
      });
      return result;
    } catch (err) {
      // Already the uniform capability-unavailable error (e.g. timeout): rethrow.
      if (err instanceof AppError && err.code === "AI_UNAVAILABLE") {
        throw err;
      }
      // R22.5: provider failure -> abort and reject with a capability-unavailable
      // error. Non-AI features are unaffected.
      throw new AppError("AI_UNAVAILABLE", {
        details: {
          capability,
          pluginId: handler.pluginId,
          reason: "provider-failure",
        },
        cause: err,
      });
    } finally {
      clearTimeout(timer);
      // Ensure any listeners/provider observing the signal are released.
      if (!controller.signal.aborted) {
        controller.abort();
      }
    }
  }
}

/**
 * A minimal, vendor-agnostic registry mapping each AI capability to at most one
 * enabled provider handler. Host wiring registers a handler when an AI_Provider
 * plugin is enabled and clears it on disable, so {@link resolve} always reflects
 * the currently enabled provider for a capability (R22.2). Registering a second
 * handler for a capability that already has one is rejected to keep routing
 * unambiguous.
 */
export class AiProviderRegistry implements AiProviderResolver {
  private readonly handlers = new Map<AiCapability, AiProviderHandler>();

  /**
   * Register `handler` as the enabled provider for `capability`. Throws
   * `CAPABILITY_UNAVAILABLE` if a different provider is already enabled for it.
   */
  register(capability: AiCapability, handler: AiProviderHandler): void {
    const existing = this.handlers.get(capability);
    if (existing !== undefined && existing.pluginId !== handler.pluginId) {
      throw new AppError("CAPABILITY_UNAVAILABLE", {
        details: {
          capability,
          reason: "capability-already-provided",
          existingPluginId: existing.pluginId,
          pluginId: handler.pluginId,
        },
      });
    }
    this.handlers.set(capability, handler);
  }

  /** Clear the enabled provider for `capability` (e.g. on plugin disable). */
  unregister(capability: AiCapability): void {
    this.handlers.delete(capability);
  }

  /** Clear every capability provided by `pluginId` (e.g. on plugin disable). */
  unregisterPlugin(pluginId: string): void {
    for (const [capability, handler] of this.handlers) {
      if (handler.pluginId === pluginId) {
        this.handlers.delete(capability);
      }
    }
  }

  resolve(capability: AiCapability): AiProviderHandler | undefined {
    return this.handlers.get(capability);
  }
}
