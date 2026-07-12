import { describe, it, expect } from "vitest";
import fc from "fast-check";
import linearPlugin, {
  LINEAR_PLUGIN_ID,
  LINEAR_ISSUES_CAPABILITY_ID,
  createLinearIssuesCapability,
} from "./index.js";
import type { PluginContext } from "@streetstudio/plugins";

const context: PluginContext = { pluginId: LINEAR_PLUGIN_ID, core: {} };

describe("linearPlugin", () => {
  it("implements the plugin contract as an integration plugin (R21.8)", () => {
    expect(linearPlugin.id).toBe(LINEAR_PLUGIN_ID);
    expect(linearPlugin.type).toBe("integration");
    expect(typeof linearPlugin.activate).toBe("function");
    expect(typeof linearPlugin.deactivate).toBe("function");
  });

  it("registers the issues capability on activate", () => {
    const caps = linearPlugin.activate(context);
    const list = Array.isArray(caps) ? caps : [];
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(LINEAR_ISSUES_CAPABILITY_ID);
    expect(list[0]?.kind).toBe("integration");
  });

  it("deactivates without throwing", () => {
    expect(() => linearPlugin.deactivate(context)).not.toThrow();
  });
});

describe("linear issues capability", () => {
  it("creates an issue for any non-empty title", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string(),
        fc.string({ minLength: 1 }),
        async (teamId, title) => {
          const cap = createLinearIssuesCapability();
          const ref = await cap.createIssue({ teamId, title });
          expect(ref.teamId).toBe(teamId);
          expect(ref.title).toBe(title);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects an empty title", async () => {
    const cap = createLinearIssuesCapability();
    await expect(cap.createIssue({ teamId: "T", title: "" })).rejects.toThrow();
  });
});
