import { describe, it, expect } from "vitest";
import fc from "fast-check";
import microsoftTeamsPlugin, {
  MICROSOFT_TEAMS_PLUGIN_ID,
  TEAMS_MESSAGING_CAPABILITY_ID,
  createTeamsMessagingCapability,
} from "./index.js";
import type { PluginContext } from "@streetstudio/plugins";

const context: PluginContext = { pluginId: MICROSOFT_TEAMS_PLUGIN_ID, core: {} };

describe("microsoftTeamsPlugin", () => {
  it("implements the plugin contract as an integration plugin (R21.8)", () => {
    expect(microsoftTeamsPlugin.id).toBe(MICROSOFT_TEAMS_PLUGIN_ID);
    expect(microsoftTeamsPlugin.type).toBe("integration");
    expect(typeof microsoftTeamsPlugin.activate).toBe("function");
    expect(typeof microsoftTeamsPlugin.deactivate).toBe("function");
  });

  it("registers the messaging capability on activate", () => {
    const caps = microsoftTeamsPlugin.activate(context);
    const list = Array.isArray(caps) ? caps : [];
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(TEAMS_MESSAGING_CAPABILITY_ID);
    expect(list[0]?.kind).toBe("integration");
  });

  it("deactivates without throwing", () => {
    expect(() => microsoftTeamsPlugin.deactivate(context)).not.toThrow();
  });
});

describe("microsoft teams messaging capability", () => {
  it("delivers non-empty messages and rejects empty ones", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.string(), async (channel, text) => {
        const cap = createTeamsMessagingCapability();
        const result = await cap.postMessage({ channel, text });
        expect(result.delivered).toBe(text.length > 0);
      }),
      { numRuns: 100 },
    );
  });
});
