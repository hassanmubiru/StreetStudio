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
 * Property 81: At most one billing plugin may be enabled.
 *
 * Feature: streetstudio, Property 81: At most one billing plugin may be enabled
 *
 * Validates: Requirements 27.4
 *
 * For any plugin configuration that enables MORE THAN ONE billing Plugin, the
 * configuration is rejected: the gateway's execute() rejects the operation with
 * CONFIGURATION_INVALID and routes NOTHING to any Plugin (no handler is ever
 * invoked). This holds for arbitrary operations and arbitrary sets of two or
 * more enabled billing Plugins.
 */

// --- Generators -----------------------------------------------------------

const jsonValue: fc.Arbitrary<unknown> = fc.jsonValue();

const operation: fc.Arbitrary<BillingOperation> = fc.record({
  kind: fc.string(),
  payload: jsonValue,
});

// A short sequence of arbitrary billing operations to exercise repeated
// rejection of the conflicting configuration.
const operations: fc.Arbitrary<readonly BillingOperation[]> = fc.array(operation, {
  minLength: 1,
  maxLength: 8,
});

const pluginId: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 12 })
  .map((s) => `billing-${s}`);

// Two or more distinct enabled billing plugin ids => a conflicting
// configuration the gateway must reject (R27.4).
const conflictingPluginIds: fc.Arbitrary<readonly string[]> = fc.uniqueArray(pluginId, {
  minLength: 2,
  maxLength: 5,
});

describe("Feature: streetstudio, Property 81: At most one billing plugin may be enabled", () => {
  it("rejects a >1 billing plugin configuration with CONFIGURATION_INVALID and routes nothing to any plugin (R27.4)", async () => {
    await fc.assert(
      fc.asyncProperty(
        operations,
        conflictingPluginIds,
        async (ops, enabledIds) => {
          const registry = new BillingProviderRegistry();

          // Record any handler invocation; with more than one billing plugin
          // enabled, nothing must be routed, so this stays empty.
          const invocations: { pluginId: string; op: BillingOperation }[] = [];

          // Register two or more billing plugins so the enabled set has length
          // > 1 (a conflicting configuration). Every handler records any
          // invocation so we can assert none was reached.
          for (const id of enabledIds) {
            const handler: BillingProviderHandler = {
              pluginId: id,
              handle: async (o: BillingOperation): Promise<BillingResult> => {
                invocations.push({ pluginId: id, op: o });
                return { kind: o.kind, output: "should-never-run" };
              },
            };
            registry.register(handler);
          }

          // Precondition: more than one billing plugin is enabled.
          expect(registry.resolveEnabled().length).toBeGreaterThan(1);

          const gateway = new StreetBillingGateway({ resolver: registry });

          for (const op of ops) {
            // Every operation is rejected due to the conflicting configuration.
            let rejected: unknown;
            try {
              await gateway.execute(op);
              rejected = undefined;
            } catch (err) {
              rejected = err;
            }

            expect(rejected).toBeInstanceOf(AppError);
            expect((rejected as AppError).code).toBe("CONFIGURATION_INVALID");
          }

          // Nothing was routed to any billing plugin: no handler ever ran.
          expect(invocations).toHaveLength(0);

          // The enabled set is unchanged afterwards (rejection is side-effect
          // free with respect to the registered configuration).
          expect(registry.resolveEnabled().length).toBe(enabledIds.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
