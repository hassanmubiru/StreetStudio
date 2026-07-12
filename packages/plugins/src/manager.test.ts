import { describe, it, expect } from "vitest";
import { AppError } from "@streetstudio/shared";
import type { AuthContext } from "@streetstudio/auth";
import { StreetPluginManager } from "./manager.js";
import type { DiscoveredPlugin, StreetJsPluginLoader } from "./loader.js";
import type { Capability, Plugin } from "./types.js";

/**
 * Inline sanity checks for the Plugin_Manager lifecycle (R21.1-R21.7). The
 * exhaustive property tests (activation-failure state preservation, load-failure
 * isolation) and the sandbox enforcement tests are covered by separate tasks.
 */

const ACTOR: AuthContext = { memberId: "m1", organizationId: "org1" };

function handle(id: string, plugin: Plugin | (() => Promise<Plugin>)): DiscoveredPlugin {
  return {
    id,
    load: typeof plugin === "function" ? plugin : async () => plugin,
  };
}

function loaderOf(...handles: DiscoveredPlugin[]): StreetJsPluginLoader {
  return { discover: async () => handles };
}

function okPlugin(id: string, caps: Capability[] = []): Plugin {
  return {
    id,
    type: "integration",
    activate: () => caps,
    deactivate: () => undefined,
  };
}

describe("discoverAndLoad", () => {
  it("loads discovered plugins and marks them disabled", async () => {
    const mgr = new StreetPluginManager({ loader: loaderOf(handle("a", okPlugin("a"))) });
    const report = await mgr.discoverAndLoad();
    expect(report.loaded).toEqual(["a"]);
    expect(report.failed).toEqual([]);
    expect(mgr.get("a")?.state).toBe("disabled");
  });

  it("records a load failure, excludes the plugin, and continues (R21.5)", async () => {
    const boom = handle("bad", async () => {
      throw new Error("cannot resolve module");
    });
    const mgr = new StreetPluginManager({
      loader: loaderOf(boom, handle("good", okPlugin("good"))),
    });
    const report = await mgr.discoverAndLoad();

    expect(report.loaded).toEqual(["good"]);
    expect(report.failed).toEqual([{ pluginId: "bad", reason: "cannot resolve module" }]);
    expect(mgr.get("bad")).toBeUndefined();
    expect(mgr.get("good")?.state).toBe("disabled");
    expect(mgr.getLoadFailures()).toHaveLength(1);
  });

  it("treats exceeding the per-plugin load budget as a failure (R21.1)", async () => {
    const slow = handle("slow", () => new Promise<Plugin>(() => {}));
    const mgr = new StreetPluginManager({
      loader: loaderOf(slow),
      budgets: { loadMs: 10 },
    });
    const report = await mgr.discoverAndLoad();
    expect(report.loaded).toEqual([]);
    expect(report.failed[0]?.pluginId).toBe("slow");
  });
});

describe("enable", () => {
  it("activates and registers capabilities (R21.2)", async () => {
    const caps: Capability[] = [{ id: "cap1", kind: "integration", value: {} }];
    const mgr = new StreetPluginManager({ loader: loaderOf(handle("a", okPlugin("a", caps))) });
    await mgr.discoverAndLoad();

    await mgr.enable(ACTOR, "a");

    expect(mgr.get("a")?.state).toBe("enabled");
    expect(mgr.get("a")?.registeredCapabilityIds).toEqual(["cap1"]);
  });

  it("leaves the plugin deactivated with prior registration unchanged on failure (R21.3)", async () => {
    const failing: Plugin = {
      id: "f",
      type: "integration",
      activate: () => {
        throw new Error("activation blew up");
      },
      deactivate: () => undefined,
    };
    const mgr = new StreetPluginManager({ loader: loaderOf(handle("f", failing)) });
    await mgr.discoverAndLoad();

    await expect(mgr.enable(ACTOR, "f")).rejects.toBeInstanceOf(AppError);

    expect(mgr.get("f")?.state).toBe("disabled");
    expect(mgr.get("f")?.registeredCapabilityIds).toEqual([]);
    expect(mgr.capabilitiesOf("f")).toEqual([]);
  });
});

describe("disable", () => {
  it("deactivates and unregisters capabilities (R21.4)", async () => {
    const caps: Capability[] = [{ id: "cap1", kind: "integration", value: {} }];
    const mgr = new StreetPluginManager({ loader: loaderOf(handle("a", okPlugin("a", caps))) });
    await mgr.discoverAndLoad();
    await mgr.enable(ACTOR, "a");

    await mgr.disable(ACTOR, "a");

    expect(mgr.get("a")?.state).toBe("disabled");
    expect(mgr.get("a")?.registeredCapabilityIds).toEqual([]);
  });
});

describe("isolation", () => {
  it("denies and records core-modification attempts (R21.6, R21.7)", async () => {
    const core = { setting: "readonly" };
    const attacker: Plugin = {
      id: "x",
      type: "integration",
      activate: (ctx) => {
        // Attempt to mutate platform core through the isolated context.
        (ctx.core as unknown as { setting: string }).setting = "hacked";
        return [];
      },
      deactivate: () => undefined,
    };
    const mgr = new StreetPluginManager({ loader: loaderOf(handle("x", attacker)), core });
    await mgr.discoverAndLoad();
    await mgr.enable(ACTOR, "x");

    expect(core.setting).toBe("readonly");
    const attempts = mgr.getModificationAttempts();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ pluginId: "x", property: "setting", operation: "set" });
  });
});

describe("unknown plugins", () => {
  it("rejects enable/disable for an unloaded plugin", async () => {
    const mgr = new StreetPluginManager({ loader: loaderOf() });
    await mgr.discoverAndLoad();
    await expect(mgr.enable(ACTOR, "nope")).rejects.toBeInstanceOf(AppError);
    await expect(mgr.disable(ACTOR, "nope")).rejects.toBeInstanceOf(AppError);
  });
});
