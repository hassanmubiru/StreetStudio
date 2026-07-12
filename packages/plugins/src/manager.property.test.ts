import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { StreetPluginManager } from "./manager.js";
import type { DiscoveredPlugin, StreetJsPluginLoader } from "./loader.js";
import type { Plugin } from "./types.js";

/**
 * Property 67: Plugin load failures are isolated.
 *
 * Feature: streetstudio, Property 67: Plugin load failures are isolated
 *
 * *For any* set of discovered plugins containing an arbitrary subset of failing
 * members (whether they throw synchronously, reject asynchronously, or exceed
 * the per-plugin load budget), `discoverAndLoad`:
 *  - records each failed plugin with its failure reason,
 *  - excludes every failed plugin from the active set, and
 *  - still loads and keeps EVERY non-failing plugin (the loaded set equals
 *    exactly the plugins that did not fail).
 * One plugin's failure never affects another.
 *
 * **Validates: Requirements 21.5**
 */

// A short load budget so the "timeout" failure mode resolves quickly under test.
const LOAD_BUDGET_MS = 25;

/** The ways a plugin's load can turn out. */
type Outcome =
  | { readonly kind: "success" }
  | { readonly kind: "throw"; readonly reason: string }
  | { readonly kind: "reject"; readonly reason: string }
  | { readonly kind: "timeout" };

/** A generated plugin spec: an id (assigned by index) plus its load outcome. */
interface Spec {
  readonly outcome: Outcome;
}

function okPlugin(id: string): Plugin {
  return {
    id,
    type: "integration",
    activate: () => [],
    deactivate: () => undefined,
  };
}

/**
 * Build a discovered handle for the given id/outcome. The distinct failure
 * modes exercise every way a load can fail per R21.5.
 */
function handleFor(id: string, outcome: Outcome): DiscoveredPlugin {
  switch (outcome.kind) {
    case "success":
      return { id, load: async () => okPlugin(id) };
    case "throw":
      // Synchronous throw out of load() itself.
      return {
        id,
        load: () => {
          throw new Error(outcome.reason);
        },
      };
    case "reject":
      return {
        id,
        load: async () => {
          throw new Error(outcome.reason);
        },
      };
    case "timeout":
      // Never settles: the manager's per-plugin budget must fire.
      return { id, load: () => new Promise<Plugin>(() => {}) };
  }
}

function loaderOf(handles: readonly DiscoveredPlugin[]): StreetJsPluginLoader {
  return { discover: async () => handles };
}

const outcomeArb: fc.Arbitrary<Outcome> = fc.oneof(
  fc.constant<Outcome>({ kind: "success" }),
  fc.string({ minLength: 1, maxLength: 40 }).map<Outcome>((reason) => ({ kind: "throw", reason })),
  fc.string({ minLength: 1, maxLength: 40 }).map<Outcome>((reason) => ({ kind: "reject", reason })),
  fc.constant<Outcome>({ kind: "timeout" }),
);

// Keep counts modest: timeout plugins each wait out the (small) budget serially.
const specsArb: fc.Arbitrary<readonly Spec[]> = fc
  .array(outcomeArb.map((outcome) => ({ outcome })), { minLength: 0, maxLength: 8 });

describe("Feature: streetstudio, Property 67: Plugin load failures are isolated", () => {
  it("records every failure, excludes failed plugins, and keeps all successful ones (R21.5)", async () => {
    await fc.assert(
      fc.asyncProperty(specsArb, async (specs) => {
        // Assign unique ids by index so identity is unambiguous.
        const ids = specs.map((_, i) => `plugin-${i}`);
        const handles = specs.map((spec, i) => handleFor(ids[i], spec.outcome));

        const expectedLoaded = new Set(
          ids.filter((_, i) => specs[i].outcome.kind === "success"),
        );
        const expectedFailed = new Set(
          ids.filter((_, i) => specs[i].outcome.kind !== "success"),
        );

        const mgr = new StreetPluginManager({
          loader: loaderOf(handles),
          budgets: { loadMs: LOAD_BUDGET_MS },
        });

        const report = await mgr.discoverAndLoad();

        // 1) The loaded set equals exactly the non-failing plugins.
        expect(new Set(report.loaded)).toEqual(expectedLoaded);
        // No duplicates in the loaded list.
        expect(report.loaded.length).toBe(expectedLoaded.size);

        // 2) The failed set equals exactly the failing plugins, each with a reason.
        const failedIds = new Set(report.failed.map((f) => f.pluginId));
        expect(failedIds).toEqual(expectedFailed);
        expect(report.failed.length).toBe(expectedFailed.size);
        for (const failure of report.failed) {
          expect(typeof failure.reason).toBe("string");
          expect(failure.reason.length).toBeGreaterThan(0);
        }

        // 3) The recorded reason matches the thrown/rejected reason exactly for
        //    the deterministic failure modes; timeouts record a budget message.
        const failureById = new Map(report.failed.map((f) => [f.pluginId, f]));
        specs.forEach((spec, i) => {
          const id = ids[i];
          if (spec.outcome.kind === "throw" || spec.outcome.kind === "reject") {
            expect(failureById.get(id)?.reason).toBe(spec.outcome.reason);
          }
          if (spec.outcome.kind === "timeout") {
            expect(failureById.get(id)?.reason).toContain("budget");
          }
        });

        // 4) getLoadFailures() mirrors the report's failures.
        const recorded = mgr.getLoadFailures();
        expect(recorded.length).toBe(expectedFailed.size);
        expect(new Set(recorded.map((f) => f.pluginId))).toEqual(expectedFailed);

        // 5) Successful plugins are in the active set (loaded, disabled); failed
        //    plugins are excluded entirely. This is the isolation guarantee: one
        //    plugin's failure never removes or affects another.
        specs.forEach((spec, i) => {
          const id = ids[i];
          if (spec.outcome.kind === "success") {
            expect(mgr.get(id)).toBeDefined();
            expect(mgr.get(id)?.state).toBe("disabled");
          } else {
            expect(mgr.get(id)).toBeUndefined();
          }
        });
      }),
      { numRuns: 100 },
    );
  });
});
