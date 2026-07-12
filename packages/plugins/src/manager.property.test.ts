import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { AppError } from "@streetstudio/shared";
import type { AuthContext } from "@streetstudio/auth";
import { StreetPluginManager } from "./manager.js";
import type { DiscoveredPlugin, StreetJsPluginLoader } from "./loader.js";
import type { Capability, Plugin } from "./types.js";

/**
 * Property 66: Plugin activation failures preserve prior state.
 *
 * Feature: streetstudio, Property 66: Plugin activation failures preserve prior state
 *
 * Validates: Requirements 21.3
 *
 * For any plugin whose activation fails — by throwing synchronously, returning a
 * rejected promise, or never resolving (exceeding the enable budget) — at any
 * point in an arbitrary sequence of enable/disable operations across multiple
 * plugins, the failed activation always:
 *   - leaves the plugin in the deactivated ("disabled") state,
 *   - registers no capabilities from the failed activation,
 *   - leaves every other plugin's prior registration state unchanged, and
 *   - reports the failure by throwing an AppError describing the activation
 *     failure.
 *
 * The test drives the real StreetPluginManager against a model of the expected
 * per-plugin state after each operation and asserts the two agree, so a single
 * failing activation can never corrupt prior registration state.
 */

const ACTOR: AuthContext = { memberId: "m1", organizationId: "org1" };

// Small budgets keep the timeout-failure case fast while remaining faithful to
// the enable/disable time-budget semantics (R21.2, R21.4).
const ENABLE_MS = 20;
const DISABLE_MS = 20;

type Outcome = "success" | "throw" | "reject" | "timeout";

interface PluginSpec {
  readonly outcome: Outcome;
  readonly capCount: number;
}

interface Op {
  readonly kind: "enable" | "disable";
  readonly index: number;
}

/** Deterministic capability ids for a plugin, so the model can predict them. */
function capsFor(pluginId: string, count: number): Capability[] {
  return Array.from({ length: count }, (_v, j) => ({
    id: `${pluginId}-c${j}`,
    kind: "integration" as const,
    value: { pluginId, j },
  }));
}

/** Build a Plugin whose activate() behaves according to its outcome. */
function pluginOf(id: string, spec: PluginSpec): Plugin {
  const caps = capsFor(id, spec.capCount);
  return {
    id,
    type: "integration",
    activate: () => {
      switch (spec.outcome) {
        case "success":
          return caps;
        case "throw":
          throw new Error(`activation threw for ${id}`);
        case "reject":
          return Promise.reject(new Error(`activation rejected for ${id}`));
        case "timeout":
          // Never resolves: the manager must abandon it after ENABLE_MS.
          return new Promise<Capability[]>(() => {});
      }
    },
    deactivate: () => undefined,
  };
}

function handle(id: string, plugin: Plugin): DiscoveredPlugin {
  return { id, load: async () => plugin };
}

function loaderOf(...handles: DiscoveredPlugin[]): StreetJsPluginLoader {
  return { discover: async () => handles };
}

/** The model's view of one plugin's lifecycle state. */
interface ModelEntry {
  state: "disabled" | "enabled";
  capIds: string[];
}

const outcomeArb: fc.Arbitrary<Outcome> = fc.constantFrom(
  "success",
  "throw",
  "reject",
  "timeout"
);

const pluginSpecArb: fc.Arbitrary<PluginSpec> = fc.record({
  outcome: outcomeArb,
  capCount: fc.integer({ min: 0, max: 3 }),
});

const scenarioArb = fc
  .array(pluginSpecArb, { minLength: 1, maxLength: 4 })
  .chain((specs) => {
    const opArb: fc.Arbitrary<Op> = fc.record({
      kind: fc.constantFrom<"enable" | "disable">("enable", "disable"),
      index: fc.integer({ min: 0, max: specs.length - 1 }),
    });
    return fc.record({
      specs: fc.constant(specs),
      ops: fc.array(opArb, { minLength: 1, maxLength: 14 }),
    });
  });

describe("Property 66: Plugin activation failures preserve prior state", () => {
  it("a failed activation leaves the plugin disabled with prior registration unchanged (R21.3)", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ specs, ops }) => {
        const ids = specs.map((_s, i) => `p${i}`);
        const handles = ids.map((id, i) => handle(id, pluginOf(id, specs[i]!)));
        const mgr = new StreetPluginManager({
          loader: loaderOf(...handles),
          budgets: { loadMs: 1_000, enableMs: ENABLE_MS, disableMs: DISABLE_MS },
        });

        const report = await mgr.discoverAndLoad();
        expect(report.loaded).toEqual(ids);

        // Model: every plugin starts loaded-but-disabled with no capabilities.
        const model: ModelEntry[] = ids.map(() => ({ state: "disabled", capIds: [] }));

        for (const op of ops) {
          const i = op.index;
          const id = ids[i]!;
          const spec = specs[i]!;

          if (op.kind === "enable") {
            const wasEnabled = model[i]!.state === "enabled";
            const willFail = !wasEnabled && spec.outcome !== "success";

            // Snapshot prior state of ALL plugins to prove preservation.
            const prior = model.map((m) => ({ state: m.state, capIds: [...m.capIds] }));

            let threw: unknown;
            try {
              await mgr.enable(ACTOR, id);
            } catch (err) {
              threw = err;
            }

            if (willFail) {
              // R21.3: the manager reports the activation failure.
              expect(threw).toBeInstanceOf(AppError);
              expect((threw as AppError).details?.phase).toBe("activation");

              // The failed plugin stays deactivated with no capabilities...
              const rec = mgr.get(id);
              expect(rec?.state).toBe("disabled");
              expect(rec?.registeredCapabilityIds).toEqual([]);
              expect(mgr.capabilitiesOf(id)).toEqual([]);

              // ...and every plugin's prior registration state is unchanged.
              ids.forEach((otherId, k) => {
                const r = mgr.get(otherId);
                expect(r?.state).toBe(prior[k]!.state);
                expect([...(r?.registeredCapabilityIds ?? [])]).toEqual(prior[k]!.capIds);
              });
              // Model is unchanged by a failed activation.
            } else {
              // Successful (or idempotent) enable: no error reported.
              expect(threw).toBeUndefined();
              if (!wasEnabled) {
                model[i] = {
                  state: "enabled",
                  capIds: capsFor(id, spec.capCount).map((c) => c.id),
                };
              }
            }
          } else {
            // disable is always allowed and never fails here.
            await mgr.disable(ACTOR, id);
            model[i] = { state: "disabled", capIds: [] };
          }

          // Full-manager invariant: real state matches the model after each op.
          ids.forEach((otherId, k) => {
            const r = mgr.get(otherId);
            expect(r?.state).toBe(model[k]!.state);
            expect([...(r?.registeredCapabilityIds ?? [])]).toEqual(model[k]!.capIds);
          });
        }
      }),
      { numRuns: 100 }
    );
  });
});
