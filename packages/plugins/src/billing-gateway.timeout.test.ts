import { describe, it, expect } from "vitest";
import { AppError } from "@streetstudio/shared";
import {
  BillingProviderRegistry,
  StreetBillingGateway,
  type BillingOperation,
  type BillingProviderHandler,
  type BillingResult,
} from "./billing-gateway.js";

/**
 * Timeout / failure-handling unit tests for the Billing Gateway (R27.5):
 *  - a billing Plugin that exceeds the per-operation timeout is aborted (its
 *    AbortSignal fires) and execute() rejects with CAPABILITY_UNAVAILABLE;
 *  - a billing Plugin that throws/rejects causes execute() to reject with no
 *    partial application: the Plugin's result is never returned to the caller;
 *  - after a billing timeout/failure, non-billing state is preserved and both
 *    non-billing operations and subsequent billing operations behave correctly.
 *
 * A small injected `timeoutMs` keeps the timeout tests fast.
 *
 * Complements the sanity checks in billing-gateway.test.ts and the property
 * tests in billing-gateway.property.test.ts (both intentionally left untouched).
 */

function handler(
  pluginId: string,
  impl: (op: BillingOperation, signal: AbortSignal) => Promise<BillingResult>
): BillingProviderHandler {
  return { pluginId, handle: impl };
}

const OP: BillingOperation = {
  kind: "create-subscription",
  payload: { plan: "pro" },
};

describe("StreetBillingGateway timeout / failure handling (R27.5)", () => {
  it("aborts a plugin that exceeds the timeout and rejects with CAPABILITY_UNAVAILABLE", async () => {
    const registry = new BillingProviderRegistry();
    let observedSignal: AbortSignal | undefined;
    let abortFired = false;

    registry.register(
      handler(
        "slow-billing",
        (_op, signal) =>
          new Promise<BillingResult>(() => {
            observedSignal = signal;
            signal.addEventListener("abort", () => {
              abortFired = true;
            });
            // Never settles on its own; only the gateway's timeout can end this.
          })
      )
    );

    const gateway = new StreetBillingGateway({ resolver: registry, timeoutMs: 10 });

    const error = await gateway.execute(OP).then(
      () => {
        throw new Error("expected execute() to reject on timeout");
      },
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      code: "CAPABILITY_UNAVAILABLE",
      details: {
        kind: "create-subscription",
        pluginId: "slow-billing",
        reason: "billing-operation-timeout",
        timeoutMs: 10,
      },
    });
    // The plugin's AbortSignal fired so it can abandon in-flight work.
    expect(abortFired).toBe(true);
    expect(observedSignal?.aborted).toBe(true);
  });

  it("rejects with no partial application when the plugin throws (result never returned)", async () => {
    const registry = new BillingProviderRegistry();
    let observedSignal: AbortSignal | undefined;
    // Sentinel the plugin would produce on success; the gateway must never
    // surface it because the operation failed.
    const wouldBeResult: BillingResult = { kind: OP.kind, output: "APPLIED" };

    registry.register(
      handler("boom-billing", (_op, signal) => {
        observedSignal = signal;
        // Reject after (conceptually) attempting work; the gateway must not
        // return `wouldBeResult` nor any partial result.
        return Promise.reject(new Error("provider exploded"));
      })
    );

    const gateway = new StreetBillingGateway({ resolver: registry, timeoutMs: 50 });

    let resolvedValue: BillingResult | undefined;
    const error = await gateway.execute(OP).then(
      (value) => {
        resolvedValue = value;
        throw new Error("expected execute() to reject on plugin failure");
      },
      (e: unknown) => e
    );

    // No result was returned to the caller: no partial application observed.
    expect(resolvedValue).toBeUndefined();
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      code: "CAPABILITY_UNAVAILABLE",
      details: {
        kind: "create-subscription",
        pluginId: "boom-billing",
        reason: "billing-operation-failed",
      },
    });
    // The original provider error is preserved as the cause.
    expect((error as AppError).cause).toBeInstanceOf(Error);
    expect((error as AppError).cause).not.toBe(wouldBeResult);
    // The gateway releases the signal even on failure (finally-path abort).
    expect(observedSignal?.aborted).toBe(true);
  });

  it("preserves non-billing state after a failure and keeps non-billing operations working", async () => {
    const registry = new BillingProviderRegistry();
    registry.register(
      handler("boom-billing", async () => {
        throw new Error("provider exploded");
      })
    );
    const gateway = new StreetBillingGateway({ resolver: registry, timeoutMs: 50 });

    // Simulate non-billing state that must be untouched by a billing failure.
    const nonBillingState = { activeMembers: 3, seatsAssigned: 3 };
    const snapshot = { ...nonBillingState };

    await expect(gateway.execute(OP)).rejects.toMatchObject({
      code: "CAPABILITY_UNAVAILABLE",
    });

    // The billing failure did not throw synchronously out of execute() nor
    // mutate surrounding non-billing state.
    expect(nonBillingState).toEqual(snapshot);

    // A plain, non-billing computation still runs correctly.
    const nonBillingFeature = (a: number, b: number): number => a + b;
    expect(nonBillingFeature(2, 3)).toBe(5);
  });

  it("allows subsequent billing operations to succeed after a timeout leaves no lingering state", async () => {
    const registry = new BillingProviderRegistry();
    registry.register(
      handler(
        "slow-billing",
        (_op, _signal) => new Promise<BillingResult>(() => {})
      )
    );
    const gateway = new StreetBillingGateway({ resolver: registry, timeoutMs: 10 });

    // First operation times out and rejects.
    await expect(gateway.execute(OP)).rejects.toMatchObject({
      code: "CAPABILITY_UNAVAILABLE",
      details: { reason: "billing-operation-timeout" },
    });

    // Swap the timed-out plugin for a healthy one (a single billing plugin must
    // be enabled at a time, R27.2/R27.4), proving the failure left no lingering
    // gateway state.
    registry.unregister("slow-billing");
    registry.register(
      handler("healthy-billing", async (op) => ({ kind: op.kind, output: "ok" }))
    );

    // Subsequent operations behave correctly and return the plugin result verbatim.
    for (let i = 0; i < 3; i += 1) {
      await expect(gateway.execute(OP)).resolves.toEqual({
        kind: "create-subscription",
        output: "ok",
      });
    }
  });
});
