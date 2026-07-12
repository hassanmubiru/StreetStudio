/**
 * Plugin contracts, isolation types, and Plugin_Manager result shapes.
 *
 * Internal module: consumers must import these through the package entry point
 * (`@streetstudio/plugins`), never directly.
 *
 * These types model Requirement 21 (Plugin Management):
 *  - discovery/load via the StreetJS plugin loader (R21.1, R21.5),
 *  - enable = activate + register capabilities (R21.2, R21.3),
 *  - disable = deactivate + unregister capabilities (R21.4),
 *  - execution inside an isolated context with no write access to core, where
 *    core-modification attempts are denied and recorded (R21.6, R21.7).
 */
import type { IsoTimestamp, PluginType } from "@streetstudio/shared";

/**
 * Time budgets, in milliseconds, imposed by Requirement 21.
 *
 *  - {@link LOAD_BUDGET_MS}: each plugin must load within 30 seconds (R21.1).
 *  - {@link ENABLE_BUDGET_MS}: enable (activate + register) within 10s (R21.2).
 *  - {@link DISABLE_BUDGET_MS}: disable (deactivate + unregister) within 10s
 *    (R21.4).
 */
export const LOAD_BUDGET_MS = 30_000;
export const ENABLE_BUDGET_MS = 10_000;
export const DISABLE_BUDGET_MS = 10_000;

/**
 * A capability a plugin contributes to the platform when it is enabled. The
 * concrete payload is opaque to the Plugin_Manager; it is registered verbatim
 * on activation and removed on deactivation.
 */
export interface Capability {
  /** Stable identifier for the capability, unique within a plugin. */
  readonly id: string;
  /** The capability kind, aligned with the plugin's {@link PluginType}. */
  readonly kind: PluginType;
  /** Opaque implementation handle registered with the platform. */
  readonly value: unknown;
}

/**
 * A read-only view of platform core exposed to a plugin. Every write, delete,
 * or property (re)definition against this surface is denied and recorded; only
 * reads succeed (R21.6, R21.7).
 */
export type CoreSurface = Readonly<Record<string, unknown>>;

/**
 * The isolated execution context handed to a plugin. It exposes the plugin's
 * own identity and a guarded, read-only view of platform core. A plugin cannot
 * obtain write access to core through this context.
 */
export interface PluginContext {
  /** Identifier of the plugin this context belongs to. */
  readonly pluginId: string;
  /**
   * Guarded, read-only view of platform core. Attempts to mutate it are denied
   * and recorded (R21.6, R21.7).
   */
  readonly core: CoreSurface;
}

/**
 * The contract every plugin implements. Discovery via the StreetJS loader
 * yields objects of this shape. `activate` performs any startup work and
 * returns the capabilities to register; `deactivate` performs teardown. Either
 * may be async and either may throw/reject to signal failure.
 */
export interface Plugin {
  /** Stable, unique plugin identifier. */
  readonly id: string;
  /** The category of platform extension this plugin provides. */
  readonly type: PluginType;
  /**
   * Activate the plugin and return the capabilities to register. Throwing (or
   * rejecting) signals activation failure; when that happens the Plugin_Manager
   * leaves the plugin deactivated and preserves prior registration (R21.3).
   */
  activate(context: PluginContext): Capability[] | Promise<Capability[]>;
  /** Deactivate the plugin. Called during disable before unregistration. */
  deactivate(context: PluginContext): void | Promise<void>;
}

/** Lifecycle state tracked by the Plugin_Manager for each known plugin. */
export type PluginState =
  /** Loaded successfully and available to enable, currently disabled. */
  | "disabled"
  /** Loaded and enabled: activated with its capabilities registered. */
  | "enabled"
  /** Failed to load; excluded from the active set (R21.5). */
  | "failed";

/** A single plugin's load outcome. */
export interface LoadFailure {
  /** Identifier of the plugin that failed to load (best-effort). */
  readonly pluginId: string;
  /** Human-readable reason the plugin failed to load. */
  readonly reason: string;
}

/**
 * The result of a discovery/load pass. Successfully loaded plugin ids are
 * listed in `loaded`; each failure is recorded in `failed` with its reason and
 * excluded from the active set, while remaining plugins continue (R21.5).
 */
export interface LoadReport {
  /** Ids of plugins that loaded successfully. */
  readonly loaded: readonly string[];
  /** Load failures, each identifying the plugin and the reason (R21.5). */
  readonly failed: readonly LoadFailure[];
}

/** The operation a plugin attempted against the read-only core surface. */
export type CoreMutationOperation = "set" | "delete" | "defineProperty";

/**
 * A recorded attempt by a plugin to modify platform core code. Every such
 * attempt is denied and recorded, identifying the offending plugin (R21.7).
 */
export interface CoreModificationAttempt {
  /** Identifier of the plugin that attempted the modification. */
  readonly pluginId: string;
  /** The property path the plugin attempted to change. */
  readonly property: string;
  /** The kind of mutation that was denied. */
  readonly operation: CoreMutationOperation;
  /** When the attempt was denied. */
  readonly at: IsoTimestamp;
}

/** A record describing everything the manager knows about one plugin. */
export interface PluginRecord {
  /** The plugin's identifier. */
  readonly id: string;
  /** The plugin's category. */
  readonly type: PluginType;
  /** Current lifecycle state. */
  readonly state: PluginState;
  /**
   * Ids of the capabilities currently registered for this plugin. Empty unless
   * the plugin is enabled.
   */
  readonly registeredCapabilityIds: readonly string[];
}
