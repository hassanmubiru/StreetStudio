/**
 * @streetstudio/integrations
 *
 * The integration framework: a typed integration-plugin contract, an in-memory
 * registry, and the built-in integration catalog — layered over the
 * `@streetstudio/plugins` system. Contains no vendor code; concrete
 * integrations ship as `@streetstudio/integration-*` plugins.
 */
export const DOMAIN =
  "Integration framework: typed integration-plugin contract, registry, and built-in catalog over the plugin system." as const;

export {
  IntegrationRegistry,
  BUILT_IN_INTEGRATIONS,
} from "./integrations.js";
export type {
  IntegrationCategory,
  IntegrationMetadata,
  IntegrationPlugin,
  BuiltInIntegration,
} from "./integrations.js";
