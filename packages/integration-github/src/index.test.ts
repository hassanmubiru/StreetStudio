import { describe, it, expect } from "vitest";
import fc from "fast-check";
import githubPlugin, {
  GITHUB_PLUGIN_ID,
  GITHUB_SOURCE_CONTROL_CAPABILITY_ID,
  createGithubSourceControlCapability,
} from "./index.js";
import type { PluginContext } from "@streetstudio/plugins";

const context: PluginContext = { pluginId: GITHUB_PLUGIN_ID, core: {} };

describe("githubPlugin", () => {
  it("implements the plugin contract as an integration plugin (R21.8)", () => {
    expect(githubPlugin.id).toBe(GITHUB_PLUGIN_ID);
    expect(githubPlugin.type).toBe("integration");
    expect(typeof githubPlugin.activate).toBe("function");
    expect(typeof githubPlugin.deactivate).toBe("function");
  });

  it("registers the source control capability on activate", () => {
    const caps = githubPlugin.activate(context);
    const list = Array.isArray(caps) ? caps : [];
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(GITHUB_SOURCE_CONTROL_CAPABILITY_ID);
    expect(list[0]?.kind).toBe("integration");
  });

  it("deactivates without throwing", () => {
    expect(() => githubPlugin.deactivate(context)).not.toThrow();
  });
});

describe("github source control capability (R24.2)", () => {
  it("returns managed repositories and null for unknown ones", async () => {
    const cap = createGithubSourceControlCapability({
      repositories: [{ id: "r1", name: "repo-one" }],
    });
    expect(await cap.listRepositories()).toHaveLength(1);
    expect(await cap.getRepository("r1")).toEqual({ id: "r1", name: "repo-one" });
    expect(await cap.getRepository("missing")).toBeNull();
  });

  it("resolves an accessible pull request and rejects inaccessible ones", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.integer({ min: 1, max: 100000 }),
        fc.string({ minLength: 1 }),
        async (repositoryId, number, title) => {
          const cap = createGithubSourceControlCapability({
            pullRequests: [{ repositoryId, number, title }],
          });
          const found = await cap.getPullRequest(repositoryId, number);
          expect(found).toEqual({ repositoryId, number, title });
          // A different PR number in the same repo is not accessible.
          expect(await cap.getPullRequest(repositoryId, number + 1)).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
