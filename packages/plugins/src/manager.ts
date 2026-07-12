/**
 * Plugin_Manager implementation.
 *
 * Responsibilities (Requirement 21):
 *  - discover and load plugins through the StreetJS loader, budgeting <=30s per
 *    plugin; a plugin that fails to load is recorded and excluded while the rest
 *    continue (R21.1, R21.5);
 *  - enable a plugin by activating it and registering its capabilities within
 *    10s; if activation fails the plugin is left deactivated and prior
 *    registration is preserved unchanged (R21.2, R21.3);
 *  - disable a plugin by deactivating it and unregistering its capabilities
 *    within 10s (R21.4);
 *  - run every plugin in an isolated context with no write access to core,
 *    denying and recording core-modification attempts (R21.6, R21.7).
 *
 * Internal module: import through the package entry point (`@streetstudio/plugins`).
 */
import { AppError, type PluginType } from "@streetstudio/shared";
import type { AuthContext } from "@streetstudio/auth";
import { createPluginContext } from "./isolation.js";
import type { StreetJsPluginLoader } from "./loader.js";
import {
  DISABLE_BUDGET_MS,
  ENABLE_BUDGET_MS,
  LOAD_BUDGET_MS,
  type Capability,
  type CoreModificationAttempt,
  type LoadFailure,
  type LoadReport,
  type Plugin,
  type PluginContext,
  type PluginRecord,
  type PluginState,
} from "./types.js";

/** The public Plugin_Manager surface (mirrors the design's `PluginManager`). */
export interface PluginManager {
  /** Discover and load plugins via the StreetJS loader, <=30s/plugin (R21.1, R21.5). */
  discoverAndLoad(): Promise<LoadReport>;
  /** Activate a plugin and register its capabilities, <=10s (R21.2, R21.3). */
  enable(actor: AuthContext, pluginId: string): Promise<void>;
  /** Deactivate a plugin and unregister its capabilities, <=10s (R21.4). */
  disable(actor: AuthContext, pluginId: string): Promise<void>;
}

/** Options for constructing a {@link StreetPluginManager}. */
export interface PluginManagerOptions {
  /** The StreetJS-backed plugin loader used for discovery/load (R21.1). */
  readonly loader: StreetJsPluginLoader;
  /**
   * The platform core surface exposed (read-only) to plugins. Plugins receive a
   * guarded view; writes are denied and recorded (R21.6, R21.7). Defaults to an
   * empty surface.
   */
  readonly core?: Record<string, unknown>;
  /**
   * Override for time budgets, primarily for testing. Values default to the
   * Requirement 21 limits.
   */
  readonly budgets?: {
    readonly loadMs?: number;
    readonly enableMs?: number;
    readonly disableMs?: number;
  };
}

/** Internal per-plugin bookkeeping. */
interface Entry {
  readonly plugin: Plugin;
  readonly context: PluginContext;
  state: PluginState;
  /** Capabilities currently registered (non-empty only while enabled). */
  capabilities: Capability[];
}

/**
 * Reject with the given cause if `promise` does not settle within `ms`. The
 * pending work is abandoned; callers treat a timeout as a load/activation/
 * deactivation failure per the relevant acceptance criterion.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} exceeded ${ms}ms budget`));
    }, ms);
    // Do not keep the event loop alive solely for this timer.
    if (typeof timer === "object" && typeof (timer as { unref?: () => void }).unref === "function") {
      (timer as { unref: () => void }).unref();
    }
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Extract a human-readable reason from an unknown thrown value. */
function reasonOf(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  return "Unknown error";
}

/**
 * Concrete Plugin_Manager. Construct with a StreetJS-backed loader (and,
 * optionally, the core surface exposed to plugins).
 */
export class StreetPluginManager implements PluginManager {
  private readonly loader: StreetJsPluginLoader;
  private readonly core: Record<string, unknown>;
  private readonly loadMs: number;
  private readonly enableMs: number;
  private readonly disableMs: number;

  /** Loaded/enabled plugins keyed by id. Failed loads are excluded (R21.5). */
  private readonly entries = new Map<string, Entry>();
  /** Recorded load failures (R21.5). */
  private readonly loadFailures: LoadFailure[] = [];
  /** Recorded denied core-modification attempts (R21.7). */
  private readonly modificationAttempts: CoreModificationAttempt[] = [];

  constructor(options: PluginManagerOptions) {
    this.loader = options.loader;
    this.core = options.core ?? {};
    this.loadMs = options.budgets?.loadMs ?? LOAD_BUDGET_MS;
    this.enableMs = options.budgets?.enableMs ?? ENABLE_BUDGET_MS;
    this.disableMs = options.budgets?.disableMs ?? DISABLE_BUDGET_MS;
  }

  /**
   * Discover plugins via the StreetJS loader and load each within the per-plugin
   * budget. Each failure is recorded and the plugin excluded; remaining plugins
   * continue to load and operate (R21.1, R21.5).
   */
  async discoverAndLoad(): Promise<LoadReport> {
    const loaded: string[] = [];
    const failed: LoadFailure[] = [];

    let discovered: readonly { id: string; load(): Promise<Plugin> }[];
    try {
      discovered = await this.loader.discover();
    } catch (err) {
      // Discovery itself failed; report as a single failure and continue with
      // an empty active set rather than throwing.
      const failure: LoadFailure = { pluginId: "*", reason: reasonOf(err) };
      this.loadFailures.push(failure);
      return { loaded: [], failed: [failure] };
    }

    for (const handle of discovered) {
      try {
        const plugin = await withTimeout(handle.load(), this.loadMs, `load(${handle.id})`);
        const context = createPluginContext(plugin.id, this.core, (attempt) => {
          this.modificationAttempts.push(attempt);
        });
        this.entries.set(plugin.id, {
          plugin,
          context,
          state: "disabled",
          capabilities: [],
        });
        loaded.push(plugin.id);
      } catch (err) {
        const failure: LoadFailure = { pluginId: handle.id, reason: reasonOf(err) };
        this.loadFailures.push(failure);
        failed.push(failure);
        // Continue loading and operating the remaining plugins (R21.5).
      }
    }

    return { loaded, failed };
  }

  /**
   * Enable a plugin: activate it and register its capabilities within the enable
   * budget (R21.2). If activation fails (throws, rejects, or times out) the
   * plugin is left deactivated and its prior registration state is preserved
   * unchanged; an error describing the failure is thrown (R21.3).
   */
  async enable(_actor: AuthContext, pluginId: string): Promise<void> {
    const entry = this.requireLoaded(pluginId);
    if (entry.state === "enabled") {
      // Idempotent: already active with capabilities registered.
      return;
    }

    let capabilities: Capability[];
    try {
      capabilities = await withTimeout(
        Promise.resolve(entry.plugin.activate(entry.context)),
        this.enableMs,
        `activate(${pluginId})`
      );
    } catch (err) {
      // R21.3: leave deactivated, prior registration unchanged, return an error.
      entry.state = "disabled";
      throw new AppError("CAPABILITY_UNAVAILABLE", {
        details: { pluginId, phase: "activation", reason: reasonOf(err) },
        cause: err,
      });
    }

    // Activation succeeded: register capabilities and mark enabled.
    entry.capabilities = [...capabilities];
    entry.state = "enabled";
  }

  /**
   * Disable a plugin: deactivate it and unregister its capabilities within the
   * disable budget (R21.4).
   */
  async disable(_actor: AuthContext, pluginId: string): Promise<void> {
    const entry = this.requireLoaded(pluginId);
    if (entry.state !== "enabled") {
      // Idempotent: nothing registered to tear down.
      return;
    }

    try {
      await withTimeout(
        Promise.resolve(entry.plugin.deactivate(entry.context)),
        this.disableMs,
        `deactivate(${pluginId})`
      );
    } catch (err) {
      throw new AppError("CAPABILITY_UNAVAILABLE", {
        details: { pluginId, phase: "deactivation", reason: reasonOf(err) },
        cause: err,
      });
    }

    // Unregister capabilities and mark disabled.
    entry.capabilities = [];
    entry.state = "disabled";
  }

  /** Snapshot of a single plugin's record, or `undefined` if not loaded. */
  get(pluginId: string): PluginRecord | undefined {
    const entry = this.entries.get(pluginId);
    if (entry === undefined) {
      return undefined;
    }
    return this.toRecord(pluginId, entry);
  }

  /** Snapshot of every loaded plugin's record. */
  list(): PluginRecord[] {
    return [...this.entries.entries()].map(([id, entry]) => this.toRecord(id, entry));
  }

  /** The currently registered capabilities for an enabled plugin. */
  capabilitiesOf(pluginId: string): readonly Capability[] {
    return this.entries.get(pluginId)?.capabilities ?? [];
  }

  /** Recorded load failures (R21.5). */
  getLoadFailures(): readonly LoadFailure[] {
    return [...this.loadFailures];
  }

  /** Recorded denied core-modification attempts (R21.7). */
  getModificationAttempts(): readonly CoreModificationAttempt[] {
    return [...this.modificationAttempts];
  }

  private requireLoaded(pluginId: string): Entry {
    const entry = this.entries.get(pluginId);
    if (entry === undefined) {
      throw new AppError("NOT_FOUND", { details: { pluginId } });
    }
    return entry;
  }

  private toRecord(id: string, entry: Entry): PluginRecord {
    const type: PluginType = entry.plugin.type;
    return {
      id,
      type,
      state: entry.state,
      registeredCapabilityIds: entry.capabilities.map((c) => c.id),
    };
  }
}
