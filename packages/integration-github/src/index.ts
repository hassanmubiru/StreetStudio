/**
 * @streetstudio/integration-github
 *
 * GitHub source control integration delivered as an isolated plugin
 * (Requirements 21.8, 24.2). It implements the {@link Plugin} contract from
 * `@streetstudio/plugins` and is discovered/loaded through the StreetJS plugin
 * loader. No GitHub vendor SDK is imported into platform core: the integration
 * lives entirely inside this plugin package.
 *
 * The contributed capability exposes repository and pull-request access so
 * Engineering Reviews can associate Videos with repositories and pull requests
 * managed by this plugin, and reject references that are not accessible.
 */
import type { Capability, Plugin, PluginContext } from "@streetstudio/plugins";

export const DOMAIN = "GitHub source control integration plugin." as const;

/** Stable identifier for the GitHub integration plugin. */
export const GITHUB_PLUGIN_ID = "streetstudio.integration.github";

/** A repository managed through the source control plugin. */
export interface Repository {
  readonly id: string;
  readonly name: string;
}

/** A pull request within a managed repository. */
export interface PullRequest {
  readonly repositoryId: string;
  readonly number: number;
  readonly title: string;
}

/**
 * Repository/pull-request access surface used by Engineering Reviews (R24.2).
 * Lookups return `null` when the repository or pull request is not accessible
 * through this plugin, so callers can reject inaccessible references.
 */
export interface SourceControlCapability {
  readonly service: "github";
  listRepositories(): Promise<readonly Repository[]>;
  getRepository(repositoryId: string): Promise<Repository | null>;
  getPullRequest(repositoryId: string, number: number): Promise<PullRequest | null>;
}

/** Backend snapshot the capability reads from. */
export interface SourceControlBackend {
  readonly repositories?: readonly Repository[];
  readonly pullRequests?: readonly PullRequest[];
}

/** Capability id registered by the GitHub plugin on activation. */
export const GITHUB_SOURCE_CONTROL_CAPABILITY_ID = "github.source-control";

/** Construct the source control capability implementation. */
export function createGithubSourceControlCapability(
  backend: SourceControlBackend = {},
): SourceControlCapability {
  const repositories = backend.repositories ?? [];
  const pullRequests = backend.pullRequests ?? [];
  return {
    service: "github",
    async listRepositories() {
      return repositories;
    },
    async getRepository(repositoryId) {
      return repositories.find((r) => r.id === repositoryId) ?? null;
    },
    async getPullRequest(repositoryId, number) {
      return (
        pullRequests.find(
          (pr) => pr.repositoryId === repositoryId && pr.number === number,
        ) ?? null
      );
    },
  };
}

/** The GitHub integration plugin. */
export const githubPlugin: Plugin = {
  id: GITHUB_PLUGIN_ID,
  type: "integration",
  activate(_context: PluginContext): Capability[] {
    return [
      {
        id: GITHUB_SOURCE_CONTROL_CAPABILITY_ID,
        kind: "integration",
        value: createGithubSourceControlCapability(),
      },
    ];
  },
  deactivate(_context: PluginContext): void {
    // No long-lived resources to release for this integration.
  },
};

export default githubPlugin;
