/**
 * @streetstudio/integration-jira
 *
 * Jira integration delivered as an isolated plugin (Requirement 21.8). It
 * implements the {@link Plugin} contract from `@streetstudio/plugins` and is
 * discovered/loaded through the StreetJS plugin loader. No Jira vendor SDK is
 * imported into platform core: the integration lives entirely inside this
 * plugin package.
 */
import type { Capability, Plugin, PluginContext } from "@streetstudio/plugins";

export const DOMAIN = "Jira integration plugin." as const;

/** Stable identifier for the Jira integration plugin. */
export const JIRA_PLUGIN_ID = "streetstudio.integration.jira";

/** Input for creating a Jira issue. */
export interface JiraIssueInput {
  /** Project key the issue belongs to. */
  readonly projectKey: string;
  /** Issue summary; must be non-empty. */
  readonly summary: string;
  /** Optional issue description. */
  readonly description?: string;
}

/** A reference to a created Jira issue. */
export interface JiraIssueRef {
  readonly projectKey: string;
  readonly summary: string;
}

/** The issue-tracking capability contributed by the Jira plugin. */
export interface JiraIssuesCapability {
  readonly service: "jira";
  createIssue(input: JiraIssueInput): Promise<JiraIssueRef>;
}

/** Capability id registered by the Jira plugin on activation. */
export const JIRA_ISSUES_CAPABILITY_ID = "jira.issues";

/** Construct the issue-tracking capability implementation. */
export function createJiraIssuesCapability(): JiraIssuesCapability {
  return {
    service: "jira",
    async createIssue(input) {
      if (input.summary.length === 0) {
        throw new Error("Jira issue summary must be non-empty.");
      }
      return { projectKey: input.projectKey, summary: input.summary };
    },
  };
}

/** The Jira integration plugin. */
export const jiraPlugin: Plugin = {
  id: JIRA_PLUGIN_ID,
  type: "integration",
  activate(_context: PluginContext): Capability[] {
    return [
      {
        id: JIRA_ISSUES_CAPABILITY_ID,
        kind: "integration",
        value: createJiraIssuesCapability(),
      },
    ];
  },
  deactivate(_context: PluginContext): void {
    // No long-lived resources to release for this integration.
  },
};

export default jiraPlugin;
