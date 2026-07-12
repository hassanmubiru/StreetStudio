/**
 * @streetstudio/plugins
 *
 * Public entry point for the Plugin_Manager, plugin contracts, and isolation.
 * Plugins are discovered and loaded through the StreetJS plugin loader.
 */
export const DOMAIN = "Plugin_Manager, plugin contracts, and isolation." as const;

/** Supported plugin categories. */
export type PluginType = "storage" | "ai" | "integration" | "billing";
