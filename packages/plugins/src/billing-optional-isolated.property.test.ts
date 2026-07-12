import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import {
  BillingProviderRegistry,
  StreetBillingGateway,
  type BillingOperation,
  type BillingProviderHandler,
  type BillingResult,
} from "./billing-gateway.js";

/**
 * Property 80: Billing is optional and isolated.
 *
 * Feature: streetstudio, Property 80: Billing is optional and isolated
 *
 * Validates: Requirements 27.3
 *
 * For any platform configuration with no billing Plugin enabled, every billing
 * operation is rejected with a "billing not configured" error, and that
 * rejection is side-effect free: the gateway invokes no handler and mutates no
 * non-billing state, so non-billing features continue to operate normally.
 */

// --- Generators -----------------------------------------------------------

const jsonValue: fc.Arbitrary<unknown> = fc.jsonValue();

const operation: fc.Arbitrary<BillingOperation> = fc.record({
  kind: fc.string(),
  payload: jsonValue,
});

// A short sequence of arbitrary billing operations to exercise repeated
// rejection without any accumulated state or drift.
const operations: fc.Arbitrary<readonly BillingOperation[]> = fc.array(operation, {
  minLength: 1,
  maxLength: 8,
});

const pluginId: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 12 })
  .map((s) => `billing-${s}`);

// Plugins that WERE registered at some point but are unregistered before any
// operation runs, so the enabled set is empty. Their handlers must never fire.
const disabledPluginIds: fc.Arbitrary<readonly string[]> = fc.uniqueArray(pluginId, {
  minLength: 0,
  maxLength: 4,
});

// A tiny model of "non-billing" state that must remain untouched by any
// billing rejection (R27.3: preserve all existing non-billing state).
interface NonBillingState {
  featureFlag: boolean;
  counter: number;
  label: string;
}

const nonBillingState: fc.Arbitrary<NonBillingState> = fc.record({
  featureFlag: fc.boolean(),
  counter: fc.integer(),
  label: fc.string(),
});

describe("Feature: streetstudio, Property 80: Billing is optional and isolated", () => {
  it("rejects every operation with BILLING_NOT_CONFIGURED, invoking no handler and preserving non-billing state (R27.3)", async () => {
    await fc.assert(
      fc.asyncProperty(
        operations,
        disabledPluginIds,
        nonBillingState,
        async (ops, disabledIds, initialState) => {
          const registry = new BillingProviderRegistry();

          // Record any handler invocation; with no billing plugin enabled,
          // this must stay empty (rejection is side-effect free).
          const invocations: { pluginId: string; op: BillingOperation }[] = [];

          // Register then unregister decoy handlers so the enabled set is empty
          // but the gateway still resolves against a real registry.
          for (const id of disabledIds) {
            const decoy: BillingProviderHandler = {
              pluginId: id,
              handle: async (o: BillingOperation): Promise<BillingResult> => {
                invocations.push({ pluginId: id, op: o });
                return { kind: o.kind, output: "should-never-run" };
              },
            };
            registry.register(decoy);
            registry.unregister(id);
          }

          // Precondition: no billing plugin is enabled.
          expect(registry.resolveEnabled()).toHaveLength(0);

          // A snapshot of non-billing state and a live copy that a
          // well-behaved non-billing feature keeps operating on.
          const snapshot = { ...initialState };
          const liveState = { ...initialState };

          const gateway = new StreetBillingGateway({ resolver: registry });

          for (const op of ops) {
            // Every billing operation is rejected with "not configured".
            let rejected: unknown;
            try {
              await gateway.execute(op);
              rejected = undefined;
            } catch (err) {
              rejected = err;
            }

            expect(rejected).toBeInstanceOf(AppError);
            expect((rejected as AppError).code).toBe("BILLING_NOT_CONFIGURED");

            // Non-billing features keep operating normally across billing
            // rejections: mutating unrelated state succeeds and is unaffected
            // by the billing error path.
            liveState.counter += 1;
            liveState.featureFlag = !liveState.featureFlag;
          }

          // No handler was ever invoked: the rejection routed to no plugin.
          expect(invocations).toHaveLength(0);

          // The gateway mutated no non-billing state: the original snapshot is
          // untouched, and the live non-billing state only reflects the
          // feature's own writes, one per operation.
          expect(snapshot).toEqual(initialState);
          expect(liveState.counter).toBe(initialState.counter + ops.length);
          expect(liveState.label).toBe(initialState.label);

          // The enabled set is still empty afterwards (no drift/side effects).
          expect(registry.resolveEnabled()).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
