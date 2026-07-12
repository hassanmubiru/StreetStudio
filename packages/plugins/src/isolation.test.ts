import { describe, it, expect } from "vitest";
import type { AuthContext } from "@streetstudio/auth";
import { createPluginContext, guardCore, type AttemptSink } from "./isolation.js";
import { StreetPluginManager } from "./manager.js";
import type { DiscoveredPlugin, StreetJsPluginLoader } from "./loader.js";
import type { CoreModificationAttempt, Plugin } from "./types.js";

/**
 * Sandbox enforcement (R21.6, R21.7): the guarded core surface handed to a
 * plugin is deeply read-only. Every write, nested write, delete, property
 * (re)definition, and prototype mutation is denied (core left unchanged) and
 * recorded, identifying the offending plugin, property, and operation. Reads
 * pass through unchanged.
 */

const ACTOR: AuthContext = { memberId: "m1", organizationId: "org1" };

/** Collect denied attempts into an array sink for assertions. */
function collector(): { attempts: CoreModificationAttempt[]; sink: AttemptSink } {
  const attempts: CoreModificationAttempt[] = [];
  return { attempts, sink: (a) => attempts.push(a) };
}

describe("guardCore write denial and recording (R21.6, R21.7)", () => {
  it("denies and records a direct property write, leaving core unchanged", () => {
    const core = { setting: "readonly" };
    const { attempts, sink } = collector();
    const guarded = guardCore(core, "p1", sink);

    (guarded as unknown as { setting: string }).setting = "hacked";

    // Denied: core is left unmodified.
    expect(core.setting).toBe("readonly");
    // Recorded: identifies plugin, property, and operation (R21.7).
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      pluginId: "p1",
      property: "setting",
      operation: "set",
    });
  });

  it("denies and records a write to a nested object, leaving core unchanged", () => {
    const core = { config: { level: 1 } };
    const { attempts, sink } = collector();
    const guarded = guardCore(core, "p2", sink);

    // Reading a nested object yields a guarded view; writing through it is denied.
    (guarded as unknown as { config: { level: number } }).config.level = 99;

    expect(core.config.level).toBe(1);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      pluginId: "p2",
      property: "config.level",
      operation: "set",
    });
  });

  it("denies and records a property delete, leaving core unchanged", () => {
    const core: Record<string, unknown> = { token: "secret" };
    const { attempts, sink } = collector();
    const guarded = guardCore(core, "p3", sink);

    delete (guarded as unknown as { token?: string }).token;

    expect(core.token).toBe("secret");
    expect(Object.prototype.hasOwnProperty.call(core, "token")).toBe(true);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      pluginId: "p3",
      property: "token",
      operation: "delete",
    });
  });

  it("denies and records a nested property delete, leaving core unchanged", () => {
    const core: Record<string, unknown> = { config: { level: 1 } };
    const { attempts, sink } = collector();
    const guarded = guardCore(core, "p3b", sink);

    delete (guarded as unknown as { config: { level?: number } }).config.level;

    expect((core.config as { level: number }).level).toBe(1);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      pluginId: "p3b",
      property: "config.level",
      operation: "delete",
    });
  });

  it("denies and records defineProperty, leaving core unchanged", () => {
    const core: Record<string, unknown> = { flag: false };
    const { attempts, sink } = collector();
    const guarded = guardCore(core, "p4", sink);

    Object.defineProperty(guarded, "injected", {
      value: "malicious",
      enumerable: true,
      configurable: true,
    });

    expect(Object.prototype.hasOwnProperty.call(core, "injected")).toBe(false);
    expect(core.flag).toBe(false);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      pluginId: "p4",
      property: "injected",
      operation: "defineProperty",
    });
  });

  it("denies and records a prototype mutation, leaving core's prototype unchanged", () => {
    const core = { setting: "readonly" };
    const originalProto = Object.getPrototypeOf(core);
    const { attempts, sink } = collector();
    const guarded = guardCore(core, "p5", sink);

    Object.setPrototypeOf(guarded, { injected: true });

    expect(Object.getPrototypeOf(core)).toBe(originalProto);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      pluginId: "p5",
      property: "[[Prototype]]",
      operation: "set",
    });
  });
});

describe("guardCore read pass-through (R21.6)", () => {
  it("returns underlying values unchanged for reads", () => {
    const core = {
      name: "core",
      count: 42,
      enabled: true,
      nested: { deep: { value: "found" } },
      items: [1, 2, 3],
    };
    const { attempts, sink } = collector();
    const guarded = guardCore(core, "reader", sink) as unknown as typeof core;

    expect(guarded.name).toBe("core");
    expect(guarded.count).toBe(42);
    expect(guarded.enabled).toBe(true);
    expect(guarded.nested.deep.value).toBe("found");
    expect(guarded.items[0]).toBe(1);
    expect(guarded.items.length).toBe(3);

    // Reads never record modification attempts.
    expect(attempts).toEqual([]);
  });

  it("invokes readable methods without recording attempts", () => {
    const core = { greet: (who: string) => `hi ${who}` };
    const { attempts, sink } = collector();
    const guarded = guardCore(core, "caller", sink) as unknown as typeof core;

    expect(guarded.greet("world")).toBe("hi world");
    expect(attempts).toEqual([]);
  });
});

describe("guardCore leaves core intact after many attempts", () => {
  it("records every distinct attempt and preserves the original core", () => {
    const core: Record<string, unknown> = { a: 1, nested: { b: 2 } };
    const snapshot = JSON.stringify(core);
    const { attempts, sink } = collector();
    const guarded = guardCore(core, "multi", sink);

    (guarded as unknown as { a: number }).a = 100;
    (guarded as unknown as { nested: { b: number } }).nested.b = 200;
    delete (guarded as unknown as { a?: number }).a;
    Object.defineProperty(guarded, "c", { value: 3 });
    Object.setPrototypeOf(guarded, null);

    // Core is byte-for-byte unchanged and its prototype is intact.
    expect(JSON.stringify(core)).toBe(snapshot);
    expect(Object.getPrototypeOf(core)).toBe(Object.prototype);

    // All five attempts were recorded, each attributed to the plugin.
    expect(attempts).toHaveLength(5);
    expect(attempts.every((a) => a.pluginId === "multi")).toBe(true);
    expect(attempts.map((a) => a.operation)).toEqual([
      "set",
      "set",
      "delete",
      "defineProperty",
      "set",
    ]);
    expect(attempts.map((a) => a.property)).toEqual([
      "a",
      "nested.b",
      "a",
      "c",
      "[[Prototype]]",
    ]);
    // Every attempt carries an ISO timestamp.
    for (const attempt of attempts) {
      expect(() => new Date(attempt.at).toISOString()).not.toThrow();
      expect(new Date(attempt.at).toISOString()).toBe(attempt.at);
    }
  });
});

describe("createPluginContext isolation", () => {
  it("exposes a guarded core whose writes are denied and recorded", () => {
    const core = { secret: "x" };
    const { attempts, sink } = collector();
    const ctx = createPluginContext("ctx-plugin", core, sink);

    expect(ctx.pluginId).toBe("ctx-plugin");
    (ctx.core as unknown as { secret: string }).secret = "y";

    expect(core.secret).toBe("x");
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      pluginId: "ctx-plugin",
      property: "secret",
      operation: "set",
    });
  });
});

/** Build a StreetJS loader over a single in-memory plugin. */
function loaderOf(...handles: DiscoveredPlugin[]): StreetJsPluginLoader {
  return { discover: async () => handles };
}

function handle(id: string, plugin: Plugin): DiscoveredPlugin {
  return { id, load: async () => plugin };
}

describe("StreetPluginManager sandbox enforcement (R21.6, R21.7)", () => {
  it("denies and records modification attempts made by an enabled plugin", async () => {
    const core: Record<string, unknown> = { setting: "readonly", nested: { level: 1 } };
    const attacker: Plugin = {
      id: "attacker",
      type: "integration",
      activate: (ctx) => {
        const c = ctx.core as unknown as {
          setting: string;
          nested: { level?: number };
        };
        c.setting = "hacked";
        c.nested.level = 999;
        delete c.nested.level;
        Object.defineProperty(ctx.core, "backdoor", { value: true });
        Object.setPrototypeOf(ctx.core, { evil: true });
        return [];
      },
      deactivate: () => undefined,
    };

    const mgr = new StreetPluginManager({ loader: loaderOf(handle("attacker", attacker)), core });
    await mgr.discoverAndLoad();
    await mgr.enable(ACTOR, "attacker");

    // Core is untouched.
    expect(core.setting).toBe("readonly");
    expect((core.nested as { level: number }).level).toBe(1);
    expect(Object.prototype.hasOwnProperty.call(core, "backdoor")).toBe(false);
    expect(Object.getPrototypeOf(core)).toBe(Object.prototype);

    // Every attempt is recorded against the offending plugin.
    const attempts = mgr.getModificationAttempts();
    expect(attempts).toHaveLength(5);
    expect(attempts.every((a) => a.pluginId === "attacker")).toBe(true);
    expect(attempts.map((a) => ({ property: a.property, operation: a.operation }))).toEqual([
      { property: "setting", operation: "set" },
      { property: "nested.level", operation: "set" },
      { property: "nested.level", operation: "delete" },
      { property: "backdoor", operation: "defineProperty" },
      { property: "[[Prototype]]", operation: "set" },
    ]);
  });

  it("attributes attempts to the correct plugin when multiple plugins run", async () => {
    const core: Record<string, unknown> = { shared: "value" };
    const makeAttacker = (id: string): Plugin => ({
      id,
      type: "integration",
      activate: (ctx) => {
        (ctx.core as unknown as { shared: string }).shared = `by-${id}`;
        return [];
      },
      deactivate: () => undefined,
    });

    const mgr = new StreetPluginManager({
      loader: loaderOf(handle("alpha", makeAttacker("alpha")), handle("beta", makeAttacker("beta"))),
      core,
    });
    await mgr.discoverAndLoad();
    await mgr.enable(ACTOR, "alpha");
    await mgr.enable(ACTOR, "beta");

    expect(core.shared).toBe("value");
    const attempts = mgr.getModificationAttempts();
    expect(attempts).toHaveLength(2);
    expect(attempts.map((a) => a.pluginId).sort()).toEqual(["alpha", "beta"]);
    for (const attempt of attempts) {
      expect(attempt.property).toBe("shared");
      expect(attempt.operation).toBe("set");
    }
  });
});
