/**
 * Integration framework (Requirement 24, and the vision's integrations domain).
 *
 * Integrations (Slack, Discord, Teams, GitHub, GitLab, Jira, Linear, Notion)
 * are delivered as plugins of the `@streetstudio/plugins` system — there is no
 * separate plugin runtime. This package adds the thin, typed contract and
 * registry that make the *integration* domain first-class over that system:
 *
 *  - {@link IntegrationPlugin}: a {@link Plugin} narrowed to `type: "integration"`
 *    and enriched with integration metadata (provider + category).
 *  - {@link IntegrationRegistry}: an in-memory registry to register, look up,
 *    and group enabled integration plugins by category.
 *  - {@link BUILT_IN_INTEGRATIONS}: the catalog of first-party integrations
 *    shipped as `@streetstudio/integration-*` packages.
 *
 * The framework holds no vendor code and imports no specific integration —
 * integrations depend on it (or the plugin system) rather than the reverse,
 * keeping platform core vendor-neutral.
 */
import { AppError } from "@streetstudio/shared";
import type { Plugin } from "@streetstudio/plugins";

/** The kind of workflow an integration connects StreetStudio to. */
export type IntegrationCategory = "chat" | "issue_tracker" | "knowledge_base";

/** Provider/category metadata an integration plugin declares. */
export interface IntegrationMetadata {
  /** Vendor/provider slug, e.g. `"slack"`, `"github"`. */
  readonly provider: string;
  /** The workflow category this integration serves. */
  readonly category: IntegrationCategory;
}

/**
 * An integration plugin: a platform {@link Plugin} of type `"integration"`
 * carrying {@link IntegrationMetadata}. Existing `@streetstudio/integration-*`
 * plugins are structurally compatible and can be adapted by attaching an
 * `integration` descriptor.
 */
export interface IntegrationPlugin extends Plugin {
  readonly type: "integration";
  readonly integration: IntegrationMetadata;
}

/**
 * An in-memory registry of integration plugins. Enforces unique ids and the
 * `"integration"` plugin type, and supports grouping by {@link IntegrationCategory}.
 */
export class IntegrationRegistry {
  private readonly byId = new Map<string, IntegrationPlugin>();

  /** Register `plugin`; throws `CONFLICT` on a duplicate id. */
  register(plugin: IntegrationPlugin): this {
    if (plugin.type !== "integration") {
      throw new AppError("VALIDATION_FAILED", {
        details: { reason: `Plugin ${plugin.id} is not an integration plugin` },
      });
    }
    if (this.byId.has(plugin.id)) {
      throw new AppError("CONFLICT", {
        details: { reason: `Integration already registered: ${plugin.id}` },
      });
    }
    this.byId.set(plugin.id, plugin);
    return this;
  }

  /** True when an integration with `id` is registered. */
  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** The registered integration with `id`, or `undefined`. */
  get(id: string): IntegrationPlugin | undefined {
    return this.byId.get(id);
  }

  /** All registered integrations, in registration order. */
  list(): readonly IntegrationPlugin[] {
    return [...this.byId.values()];
  }

  /** The ids of all registered integrations, sorted. */
  ids(): readonly string[] {
    return [...this.byId.keys()].sort();
  }

  /** Registered integrations in `category`, in registration order. */
  byCategory(category: IntegrationCategory): readonly IntegrationPlugin[] {
    return this.list().filter((p) => p.integration.category === category);
  }
}

/** A first-party integration shipped as an `@streetstudio/integration-*` package. */
export interface BuiltInIntegration {
  /** The plugin id the integration package registers. */
  readonly id: string;
  /** Provider slug. */
  readonly provider: string;
  /** Workflow category. */
  readonly category: IntegrationCategory;
}

/**
 * Catalog of the built-in integrations. Ids match the `*_PLUGIN_ID` constants
 * exported by the `@streetstudio/integration-*` packages.
 */
export const BUILT_IN_INTEGRATIONS: readonly BuiltInIntegration[] = [
  { id: "streetstudio.integration.slack", provider: "slack", category: "chat" },
  { id: "streetstudio.integration.discord", provider: "discord", category: "chat" },
  { id: "streetstudio.integration.microsoft-teams", provider: "microsoft-teams", category: "chat" },
  { id: "streetstudio.integration.github", provider: "github", category: "issue_tracker" },
  { id: "streetstudio.integration.gitlab", provider: "gitlab", category: "issue_tracker" },
  { id: "streetstudio.integration.jira", provider: "jira", category: "issue_tracker" },
  { id: "streetstudio.integration.linear", provider: "linear", category: "issue_tracker" },
  { id: "streetstudio.integration.notion", provider: "notion", category: "knowledge_base" },
] as const;
