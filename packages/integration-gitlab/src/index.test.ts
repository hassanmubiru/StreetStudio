import { describe, it, expect } from "vitest";
import fc from "fast-check";
import gitlabPlugin, {
  GITLAB_PLUGIN_ID,
  GITLAB_SOURCE_CONTROL_CAPABILITY_ID,
  createGitlabSourceControlCapability,
} from "./index.js";
import type { PluginContext } from "@streetstudio/plugins";

const context: PluginContext = { pluginId: GITLAB_PLUGIN_ID, core: {} };

describe("gitlabPlugin", () => {
  it("implements the plugin contract as an integration plugin (R21.8)", () => {
    expect(gitlabPlugin.id).toBe(GITLAB_PLUGIN_ID);
    expect(gitlabPlugin.type).toBe("integration");
    expect(typeof gitlabPlugin.activate).toBe("function");
    expect(typeof gitlabPlugin.deactivate).toBe("function");
  });

  it("registers the source control capability on activate", () => {
    const caps = gitlabPlugin.activate(context);
    const list = Array.isArray(caps) ? caps : [];
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(GITLAB_SOURCE_CONTROL_CAPABILITY_ID);
    expect(list[0]?.kind).toBe("integration");
  });

  it("deactivates without throwing", () => {
    expect(() => gitlabPlugin.deactivate(context)).not.toThrow();
  });
});

describe("gitlab source control capability (R24.2)", () => {
  it("returns managed repositories and null for unknown ones", async () => {
    const cap = createGitlabSourceControlCapability({
      repositories: [{ id: "p1", name: "project-one" }],
    });
    expect(await cap.listRepositories()).toHaveLength(1);
    expect(await cap.getRepository("p1")).toEqual({ id: "p1", name: "project-one" });
    expect(await cap.getRepository("missing")).toBeNull();
  });

  it("resolves an accessible pull request and rejects inaccessible ones", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.integer({ min: 1, max: 100000 }),
        fc.string({ minLength: 1 }),
        async (repositoryId, number, title) => {
          const cap = createGitlabSourceControlCapability({
            pullRequests: [{ repositoryId, number, title }],
          });
          const found = await cap.getPullRequest(repositoryId, number);
          expect(found).toEqual({ repositoryId, number, title });
          expect(await cap.getPullRequest(repositoryId, number + 1)).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
