import { describe, it, expect } from "vitest";
import {
  BillingProviderRegistry,
  StreetBillingGateway,
  type BillingOperation,
  type BillingProviderHandler,
  type BillingResult,
} from "./billing-gateway.js";

/**
 * Sanity checks for the Billing Gateway (R27.2, R27.3, R27.4, R27.5).
 * Exhaustive property/timeout coverage lives in tasks 28.2-28.5.
 */

function handler(
  pluginId: string,
  impl: (op: BillingOperation, signal: AbortSignal) => Promise<BillingResult>
): BillingProviderHandler {
  return { pluginId, handle: impl };
}

const OP: BillingOperation = { kind: "create-subscription", payload: { plan: "pro" } };

describe("StreetBillingGateway", () => {
  it("routes to the single enabled billing plugin and returns its result (R27.2)", async () => {
    const registry = new BillingProviderRegistry();
    registry.register(
      handler("acme-billing", async (op) => ({ kind: op.kind, output: "ok" }))
    );
    const gateway = new StreetBillingGateway({ resolver: registry });

    const result = await gateway.execute(OP);

    expect(result).toEqual({ kind: "create-subscription", output: "ok" });
  });

  it("rejects with BILLING_NOT_CONFIGURED when no billing plugin is enabled (R27.3)", async () => {
    const gateway = new StreetBillingGateway({ resolver: new BillingProviderRegistry() });

    await expect(gateway.execute(OP)).rejects.toMatchObject({
      code: "BILLING_NOT_CONFIGURED",
    });
  });

  it("rejects the configuration and routes nothing when more than one is enabled (R27.4)", async () => {
    const registry = new BillingProviderRegistry();
    let routed = false;
    registry.register(
      handler("a-billing", async (op) => {
        routed = true;
        return { kind: op.kind, output: "a" };
      })
    );
    registry.register(
      handler("b-billing", async (op) => {
        routed = true;
        return { kind: op.kind, output: "b" };
      })
    );
    const gateway = new StreetBillingGateway({ resolver: registry });

    await expect(gateway.execute(OP)).rejects.toMatchObject({
      code: "CONFIGURATION_INVALID",
    });
    expect(routed).toBe(false);
  });

  it("returns an operation-failed error on plugin failure with no partial application (R27.5)", async () => {
    const registry = new BillingProviderRegistry();
    registry.register(
      handler("boom-billing", async () => {
        throw new Error("provider exploded");
      })
    );
    const gateway = new StreetBillingGateway({ resolver: registry });

    await expect(gateway.execute(OP)).rejects.toMatchObject({
      code: "CAPABILITY_UNAVAILABLE",
    });
  });

  it("aborts and rejects when the plugin exceeds the 30s timeout (R27.5)", async () => {
    const registry = new BillingProviderRegistry();
    let aborted = false;
    registry.register(
      handler(
        "slow-billing",
        (_op, signal) =>
          new Promise<BillingResult>(() => {
            signal.addEventListener("abort", () => {
              aborted = true;
            });
            // Never settles on its own; the gateway's timeout must abort it.
          })
      )
    );
    const gateway = new StreetBillingGateway({ resolver: registry, timeoutMs: 10 });

    await expect(gateway.execute(OP)).rejects.toMatchObject({
      code: "CAPABILITY_UNAVAILABLE",
    });
    expect(aborted).toBe(true);
  });

  it("reflects disable by resolving no enabled handler after unregister", async () => {
    const registry = new BillingProviderRegistry();
    registry.register(handler("a-billing", async (op) => ({ kind: op.kind, output: 1 })));
    expect(registry.resolveEnabled()).toHaveLength(1);

    registry.unregister("a-billing");
    expect(registry.resolveEnabled()).toHaveLength(0);

    const gateway = new StreetBillingGateway({ resolver: registry });
    await expect(gateway.execute(OP)).rejects.toMatchObject({
      code: "BILLING_NOT_CONFIGURED",
    });
  });
});
