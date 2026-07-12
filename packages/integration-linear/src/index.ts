/**
 * @streetstudio/integration-linear
 *
 * Linear integration delivered as an isolated plugin (Requirement 21.8). It
 * implements the {@link Plugin} contract from `@streetstudio/plugins` and is
 * discovered/loaded through the StreetJS plugin loader. No Linear vendor SDK is
 * imported into platform core: the integration lives entirely inside this
 * plugin package.
 */
import type { Capability, Plugin, PluginContext } from "@streetstudio/plugins";

export const DOMAIN = "Linear integration plugin." as const;

/** Stable identifier for the Linear integration plugin. */
export const LINEAR_PLUGIN_ID = "streetstudio.integration.linear";

/** Input for creating a Linear issue. */
export interface LinearIssueInput {
  /** Team identifier the issue belongs to. */
  readonly teamId: string;
  /** Issue title; must be non-empty. */
  readonly title: string;
  /** Optional issue description. */
  readonly description?: string;
}

/** A reference to a created Linear issue. */
export interface LinearIssueRef {
  readonly teamId: string;
  readonly title: string;
}

/** The issue-tracking capability contributed by the Linear plugin. */
export interface LinearIssuesCapability {
  readonly service: "linear";
  createIssue(input: LinearIssueInput): Promise<LinearIssueRef>;
}

/** Capability id registered by the Linear plugin on activation. */
export const LINEAR_ISSUES_CAPABILITY_ID = "linear.issues";

/** Construct the issue-tracking capability implementation. */
export function createLinearIssuesCapability(): LinearIssuesCapability {
  return {
    service: "linear",
    async createIssue(input) {
      if (input.title.length === 0) {
        throw new Error("Linear issue title must be non-empty.");
      }
      return { teamId: input.teamId, title: input.title };
    },
  };
}

/** The Linear integration plugin. */
export const linearPlugin: Plugin = {
  id: LINEAR_PLUGIN_ID,
  type: "integration",
  activate(_context: PluginContext): Capability[] {
    return [
      {
        id: LINEAR_ISSUES_CAPABILITY_ID,
        kind: "integration",
        value: createLinearIssuesCapability(),
      },
    ];
  },
  deactivate(_context: PluginContext): void {
    // No long-lived resources to release for this integration.
  },
};

export default linearPlugin;
