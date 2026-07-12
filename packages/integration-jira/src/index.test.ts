import { describe, it, expect } from "vitest";
import fc from "fast-check";
import jiraPlugin, {
  JIRA_PLUGIN_ID,
  JIRA_ISSUES_CAPABILITY_ID,
  createJiraIssuesCapability,
} from "./index.js";
import type { PluginContext } from "@streetstudio/plugins";

const context: PluginContext = { pluginId: JIRA_PLUGIN_ID, core: {} };

describe("jiraPlugin", () => {
  it("implements the plugin contract as an integration plugin (R21.8)", () => {
    expect(jiraPlugin.id).toBe(JIRA_PLUGIN_ID);
    expect(jiraPlugin.type).toBe("integration");
    expect(typeof jiraPlugin.activate).toBe("function");
    expect(typeof jiraPlugin.deactivate).toBe("function");
  });

  it("registers the issues capability on activate", () => {
    const caps = jiraPlugin.activate(context);
    const list = Array.isArray(caps) ? caps : [];
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(JIRA_ISSUES_CAPABILITY_ID);
    expect(list[0]?.kind).toBe("integration");
  });

  it("deactivates without throwing", () => {
    expect(() => jiraPlugin.deactivate(context)).not.toThrow();
  });
});

describe("jira issues capability", () => {
  it("creates an issue for any non-empty summary", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string(),
        fc.string({ minLength: 1 }),
        async (projectKey, summary) => {
          const cap = createJiraIssuesCapability();
          const ref = await cap.createIssue({ projectKey, summary });
          expect(ref.projectKey).toBe(projectKey);
          expect(ref.summary).toBe(summary);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects an empty summary", async () => {
    const cap = createJiraIssuesCapability();
    await expect(cap.createIssue({ projectKey: "P", summary: "" })).rejects.toThrow();
  });
});
