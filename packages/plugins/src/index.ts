/**
 * @streetstudio/plugins
 *
 * Public entry point for the Plugin_Manager, plugin contracts, and isolation.
 * Plugins are discovered and loaded through the StreetJS plugin loader.
 *
 * This is the ONLY module other packages may import from. Internal modules
 * (`./types`, `./loader`, `./isolation`, `./manager`) are not part of the
 * public surface and must not be imported directly.
 */
export const DOMAIN = "Plugin_Manager, plugin contracts, and isolation." as const;

/** Supported plugin categories (re-exported from the shared taxonomy). */
export type { PluginType } from "@streetstudio/shared";

// Plugin contracts, isolation types, and lifecycle result shapes.
export {
  LOAD_BUDGET_MS,
  ENABLE_BUDGET_MS,
  DISABLE_BUDGET_MS,
} from "./types.js";
export type {
  Capability,
  CoreSurface,
  PluginContext,
  Plugin,
  PluginState,
  LoadFailure,
  LoadReport,
  CoreMutationOperation,
  CoreModificationAttempt,
  PluginRecord,
} from "./types.js";

// StreetJS loader seam.
export type { DiscoveredPlugin, StreetJsPluginLoader } from "./loader.js";

// Isolation helpers.
export { createPluginContext, guardCore, type AttemptSink } from "./isolation.js";

// The Plugin_Manager itself.
export { StreetPluginManager } from "./manager.js";
export type { PluginManager, PluginManagerOptions } from "./manager.js";
