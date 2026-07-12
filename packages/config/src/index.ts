/**
 * @streetstudio/config
 *
 * Public entry point for configuration schema and loading. Configuration is
 * loaded and validated via the StreetJS configuration interface (imported only
 * through StreetJS public package entry points in later tasks).
 */
import type { Uuid } from "@streetstudio/shared";

export const DOMAIN =
  "Configuration schema and loading via StreetJS configuration." as const;

/**
 * Import-boundary analyzer (build tooling). Enforces the StreetJS, package, and
 * AI/billing vendor boundaries at build/CI time (Requirements 1.3, 1.6, 2.4,
 * 2.6, 22.6). Exposed through the package entry point so tooling and tests
 * consume it without reaching into internal modules.
 */
export * from "./boundary/index.js";

/** Placeholder shape for the validated platform configuration. */
export interface PlatformConfig {
  readonly instanceId: Uuid;
}

// Package dependency-graph acyclicity checker (Requirement 2.5). Exposed
// through the package entry point so CI tooling and tests consume it without
// reaching into internal module paths.
export * from "./dependency-graph.js";
