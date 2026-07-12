/**
 * @streetstudio/config
 *
 * Public entry point for configuration schema and loading. Configuration is
 * loaded and validated via the StreetJS configuration interface (consumed only
 * through the `@streetjs/core` public package entry point by the composition
 * root).
 */
export const DOMAIN =
  "Configuration schema and loading via StreetJS configuration." as const;

/**
 * Import-boundary analyzer (build tooling). Enforces the StreetJS, package, and
 * AI/billing vendor boundaries at build/CI time (Requirements 1.3, 1.6, 2.4,
 * 2.6, 22.6). Exposed through the package entry point so tooling and tests
 * consume it without reaching into internal modules.
 */
export * from "./boundary/index.js";

// Configuration schema, loading, and startup validation (Requirement 30.3).
// Loads and validates configuration via the StreetJS configuration interface
// and aborts startup with an error naming every missing/invalid required value.
export * from "./config.js";

// Package dependency-graph acyclicity checker (Requirement 2.5). Exposed
// through the package entry point so CI tooling and tests consume it without
// reaching into internal module paths.
export * from "./dependency-graph.js";
