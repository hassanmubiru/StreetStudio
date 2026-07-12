import { describe, it, expect } from "vitest";
import fc from "fast-check";
import slackPlugin, {
  SLACK_PLUGIN_ID,
  SLACK_MESSAGING_CAPABILITY_ID,
  createSlackMessagingCapability,
} from "./index.js";
import type { PluginContext } from "@streetstudio/plugins";

const context: PluginContext = { pluginId: SLACK_PLUGIN_ID, core: {} };

describe("slackPlugin", () => {
  it("implements the plugin contract as an integration plugin (R21.8)", () => {
    expect(slackPlugin.id).toBe(SLACK_PLUGIN_ID);
    expect(slackPlugin.type).toBe("integration");
    expect(typeof slackPlugin.activate).toBe("function");
    expect(typeof slackPlugin.deactivate).toBe("function");
  });

  it("registers the messaging capability on activate", () => {
    const caps = slackPlugin.activate(context);
    const list = Array.isArray(caps) ? caps : [];
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(SLACK_MESSAGING_CAPABILITY_ID);
    expect(list[0]?.kind).toBe("integration");
  });

  it("deactivates without throwing", () => {
    expect(() => slackPlugin.deactivate(context)).not.toThrow();
  });
});

describe("slack messaging capability", () => {
  it("delivers non-empty messages and rejects empty ones", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.string(), async (channel, text) => {
        const cap = createSlackMessagingCapability();
        const result = await cap.postMessage({ channel, text });
        expect(result.delivered).toBe(text.length > 0);
      }),
      { numRuns: 100 },
    );
  });
});
