/**
 * Billing Gateway.
 *
 * Implements Requirement 27 (Billing Abstraction):
 *  - billing operations are exposed exclusively through this single abstraction
 *    and platform core holds zero direct references to any specific billing
 *    vendor; all vendor behaviour lives inside a billing Plugin reached only
 *    through the seams below (R27.1);
 *  - when exactly one billing Plugin is enabled, an operation is routed to it
 *    and the Plugin's result is returned to the caller verbatim (R27.2);
 *  - when no billing Plugin is enabled the operation is rejected with
 *    {@link BILLING_NOT_CONFIGURED}; rejection is synchronous and side-effect
 *    free so non-billing features and state are unaffected (R27.3);
 *  - when more than one billing Plugin is enabled the configuration is rejected
 *    with {@link CONFIGURATION_INVALID} and nothing is routed to any Plugin
 *    (R27.4);
 *  - when the enabled Plugin fails or does not respond within 30 seconds the
 *    operation is aborted and rejected; no partial application occurs and
 *    non-billing state is preserved (R27.5).
 *
 * Vendor specifics live entirely inside billing Plugins, which implement
 * {@link BillingProviderHandler}. Platform core depends only on these seams, so
 * the import-boundary rule that forbids a billing vendor reference in core
 * (R27.1) holds.
 *
 * Internal module: import through the package entry point (`@streetstudio/plugins`).
 */
import { AppError } from "@streetstudio/shared";

/**
 * Maximum time an enabled billing Plugin has to complete a routed operation
 * before it is aborted and the operation rejected (R27.5).
 */
export const BILLING_OPERATION_TIMEOUT_MS = 30_000;

/**
 * A billing operation routed to a Plugin. The `kind` names the operation
 * (e.g. a subscription or invoice action) and `payload` is opaque to core: its
 * shape is agreed between the caller and the billing Plugin. Core never
 * inspects vendor-specific fields (R27.1).
 */
export interface BillingOperation {
  /** Names the billing operation; opaque to the gateway. */
  readonly kind: string;
  /** Operation-specific input, opaque to the gateway. */
  readonly payload: unknown;
}

/** The result produced by a billing Plugin for a {@link BillingOperation}. */
export interface BillingResult {
  /** The operation kind that produced this result. */
  readonly kind: string;
  /** Operation-specific output, opaque to the gateway. */
  readonly output: unknown;
}

/**
 * A handler contributed by an enabled billing Plugin that fulfills billing
 * operations. This is the only vendor-aware surface; its implementation lives
 * in the Plugin, never in core (R27.1).
 */
export interface BillingProviderHandler {
  /** Identifier of the billing Plugin backing this handler. */
  readonly pluginId: string;
  /**
   * Fulfill a billing operation. Implementations SHOULD observe `signal` and
   * abandon work promptly when it aborts (the gateway aborts on timeout, R27.5).
   * Rejecting signals a provider failure, which the gateway surfaces as an
   * operation-failed error with no partial application.
   */
  handle(op: BillingOperation, signal: AbortSignal): Promise<BillingResult>;
}

/**
 * Resolves the set of currently enabled billing Plugin handlers. The
 * Plugin_Manager (or host wiring) supplies an implementation reflecting the
 * billing Plugins that are enabled right now. The gateway routes only when
 * exactly one is enabled (R27.2); zero triggers {@link BILLING_NOT_CONFIGURED}
 * (R27.3) and more than one triggers {@link CONFIGURATION_INVALID} (R27.4).
 */
export interface BillingProviderResolver {
  /** The billing handlers currently enabled (0, 1, or more). */
  resolveEnabled(): readonly BillingProviderHandler[];
}

/** The billing gateway surface (mirrors the design's `BillingGateway`). */
export interface BillingGateway {
  /** Route a billing operation to the single enabled Plugin, or fail cleanly (R27.2..R27.5). */
  execute(op: BillingOperation): Promise<BillingResult>;
}

/** Options for constructing a {@link StreetBillingGateway}. */
export interface BillingGatewayOptions {
  /** Resolves the enabled billing Plugin handlers (R27.2..R27.4). */
  readonly resolver: BillingProviderResolver;
  /**
   * Per-operation timeout in milliseconds. Defaults to
   * {@link BILLING_OPERATION_TIMEOUT_MS} (R27.5). Primarily overridden for
   * testing.
   */
  readonly timeoutMs?: number;
}

/**
 * Concrete Billing Gateway. It resolves the enabled billing Plugins and routes
 * an operation only when exactly one is enabled, enforcing the timeout and
 * ensuring failures never apply partially.
 *
 * It holds no vendor logic: all provider behaviour is reached through the
 * injected {@link BillingProviderResolver} and {@link BillingProviderHandler}
 * (R27.1).
 */
export class StreetBillingGateway implements BillingGateway {
  private readonly resolver: BillingProviderResolver;
  private readonly timeoutMs: number;

  constructor(options: BillingGatewayOptions) {
    this.resolver = options.resolver;
    this.timeoutMs = options.timeoutMs ?? BILLING_OPERATION_TIMEOUT_MS;
  }

  async execute(op: BillingOperation): Promise<BillingResult> {
    const enabled = this.resolver.resolveEnabled();

    if (enabled.length === 0) {
      // R27.3: no billing Plugin enabled -> reject "not configured". Rejection
      // is synchronous and side-effect free, so non-billing features/state are
      // unaffected.
      throw new AppError("BILLING_NOT_CONFIGURED", {
        details: { kind: op.kind, reason: "no-billing-plugin-enabled" },
      });
    }

    if (enabled.length > 1) {
      // R27.4: more than one billing Plugin enabled -> reject the conflicting
      // configuration and route nothing to any Plugin.
      throw new AppError("CONFIGURATION_INVALID", {
        details: {
          kind: op.kind,
          reason: "multiple-billing-plugins-enabled",
          enabledPluginIds: enabled.map((h) => h.pluginId),
        },
      });
    }

    const handler = enabled[0]!;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      // Abort the Plugin so it can abandon in-flight work (R27.5).
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
      const result = await new Promise<BillingResult>((resolve, reject) => {
        // The timeout is enforced independently of the Plugin promise so a
        // Plugin that never settles still aborts the operation (R27.5).
        controller.signal.addEventListener(
          "abort",
          () => {
            if (timedOut) {
              reject(
                new AppError("CAPABILITY_UNAVAILABLE", {
                  details: {
                    kind: op.kind,
                    pluginId: handler.pluginId,
                    reason: "billing-operation-timeout",
                    timeoutMs: this.timeoutMs,
                  },
                })
              );
            }
          },
          { once: true }
        );

        handler.handle(op, controller.signal).then(resolve, reject);
      });
      // R27.2: return the Plugin's result verbatim.
      return result;
    } catch (err) {
      // Already the uniform operation-failed error (e.g. timeout): rethrow.
      if (err instanceof AppError && err.code === "CAPABILITY_UNAVAILABLE") {
        throw err;
      }
      // R27.5: Plugin failure -> abort and reject with an operation-failed
      // error. Because the result is never returned, no partial application is
      // observed by the caller and non-billing state is preserved.
      throw new AppError("CAPABILITY_UNAVAILABLE", {
        details: {
          kind: op.kind,
          pluginId: handler.pluginId,
          reason: "billing-operation-failed",
        },
        cause: err,
      });
    } finally {
      clearTimeout(timer);
      // Ensure any listeners/Plugin observing the signal are released.
      if (!controller.signal.aborted) {
        controller.abort();
      }
    }
  }
}

/**
 * A minimal, vendor-agnostic registry of enabled billing Plugin handlers. Host
 * wiring registers a handler when a billing Plugin is enabled and clears it on
 * disable, so {@link resolveEnabled} always reflects the billing Plugins that
 * are currently enabled (R27.2). The registry deliberately tolerates more than
 * one enabled handler so the gateway can detect and reject that conflicting
 * configuration (R27.4); it never silently drops one.
 */
export class BillingProviderRegistry implements BillingProviderResolver {
  private readonly handlers = new Map<string, BillingProviderHandler>();

  /**
   * Register `handler` as an enabled billing Plugin, keyed by its `pluginId`.
   * Re-registering the same Plugin replaces its handler.
   */
  register(handler: BillingProviderHandler): void {
    this.handlers.set(handler.pluginId, handler);
  }

  /** Clear the enabled billing Plugin identified by `pluginId` (e.g. on disable). */
  unregister(pluginId: string): void {
    this.handlers.delete(pluginId);
  }

  resolveEnabled(): readonly BillingProviderHandler[] {
    return [...this.handlers.values()];
  }
}
