/**
 * StreetJS plugin-loader abstraction.
 *
 * Plugins are discovered and loaded through the StreetJS plugin loader
 * (R21.1). The concrete loader is provided by the StreetJS framework at its
 * public entry point (`@streetjs/core`) and is wired into the Plugin_Manager by
 * the host application. We depend on the narrow {@link StreetJsPluginLoader}
 * interface rather than the framework directly so that:
 *
 *  - platform core keeps a single, explicit seam onto StreetJS (respecting the
 *    import-boundary rules; StreetJS is consumed only at its public entry
 *    point), and
 *  - the manager remains unit-testable without a running framework.
 *
 * Internal module: import through the package entry point (`@streetstudio/plugins`).
 */
import type { Plugin } from "./types.js";

/**
 * A handle to a plugin as surfaced by the StreetJS loader before it is fully
 * loaded. `load()` resolves the executable {@link Plugin}; it may reject to
 * signal a load failure, which the Plugin_Manager records and isolates (R21.5).
 */
export interface DiscoveredPlugin {
  /** Best-effort identifier for the plugin, used in failure records (R21.5). */
  readonly id: string;
  /** Resolve the executable plugin. May reject on a load failure. */
  load(): Promise<Plugin>;
}

/**
 * The subset of the StreetJS plugin loader the Plugin_Manager depends on.
 * Implementations are backed by the StreetJS framework's public loader.
 */
export interface StreetJsPluginLoader {
  /** Discover the plugins available to the platform. */
  discover(): Promise<readonly DiscoveredPlugin[]>;
}
