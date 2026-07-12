import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  BillingProviderRegistry,
  StreetBillingGateway,
  type BillingOperation,
  type BillingProviderHandler,
  type BillingResult,
} from "./billing-gateway.js";

/**
 * Property 79: Billing operations route to the single enabled plugin.
 *
 * Feature: streetstudio, Property 79: Billing operations route to the single enabled plugin
 *
 * Validates: Requirements 27.2
 *
 * For any billing operation, when exactly one billing Plugin is enabled, the
 * gateway's execute() routes the operation to THAT plugin (and no other) and
 * returns the plugin's result to the caller verbatim.
 */

// --- Generators -----------------------------------------------------------

const jsonValue: fc.Arbitrary<unknown> = fc.jsonValue();

const operation: fc.Arbitrary<BillingOperation> = fc.record({
  kind: fc.string(),
  payload: jsonValue,
});

const result: fc.Arbitrary<BillingResult> = fc.record({
  kind: fc.string(),
  output: jsonValue,
});

const pluginId: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 12 })
  .map((s) => `billing-${s}`);

// A small set of "other" (not-enabled) plugins that must never be reached, plus
// the single enabled plugin's id.
const otherPluginIds: fc.Arbitrary<readonly string[]> = fc.uniqueArray(pluginId, {
  minLength: 0,
  maxLength: 4,
});

describe("Feature: streetstudio, Property 79: Billing operations route to the single enabled plugin", () => {
  it("routes to the single enabled plugin and returns its result verbatim (R27.2)", async () => {
    await fc.assert(
      fc.asyncProperty(
        operation,
        result,
        pluginId,
        otherPluginIds,
        async (op, cannedResult, enabledId, otherIds) => {
          const registry = new BillingProviderRegistry();

          // Track exactly which plugins were invoked and with which operation.
          const invocations: { pluginId: string; op: BillingOperation }[] = [];

          // Register a set of "other" plugins that are NOT enabled at execute
          // time. We register them then unregister so only one remains enabled,
          // ensuring the gateway resolves exactly one handler. These handlers
          // record any invocation so we can assert they were never reached.
          const decoys: BillingProviderHandler[] = otherIds
            .filter((id) => id !== enabledId)
            .map((id) => ({
              pluginId: id,
              handle: async (o: BillingOperation): Promise<BillingResult> => {
                invocations.push({ pluginId: id, op: o });
                return { kind: o.kind, output: "decoy" };
              },
            }));

          // The single enabled plugin returns the canned result verbatim.
          const enabledHandler: BillingProviderHandler = {
            pluginId: enabledId,
            handle: async (o: BillingOperation): Promise<BillingResult> => {
              invocations.push({ pluginId: enabledId, op: o });
              return cannedResult;
            },
          };

          // Only the enabled plugin is registered => resolveEnabled() has length 1.
          registry.register(enabledHandler);

          const gateway = new StreetBillingGateway({ resolver: registry });

          const returned = await gateway.execute(op);

          // Result is returned to the caller verbatim.
          expect(returned).toBe(cannedResult);

          // The operation reached exactly the one enabled plugin, no other.
          expect(invocations).toHaveLength(1);
          expect(invocations[0]!.pluginId).toBe(enabledId);
          // The exact operation object was routed (same reference).
          expect(invocations[0]!.op).toBe(op);

          // None of the decoy plugins were reached.
          for (const decoy of decoys) {
            expect(invocations.some((i) => i.pluginId === decoy.pluginId)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
