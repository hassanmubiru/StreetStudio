import { describe, it, expect } from "vitest";
import fc from "fast-check";
import discordPlugin, {
  DISCORD_PLUGIN_ID,
  DISCORD_MESSAGING_CAPABILITY_ID,
  createDiscordMessagingCapability,
} from "./index.js";
import type { PluginContext } from "@streetstudio/plugins";

const context: PluginContext = { pluginId: DISCORD_PLUGIN_ID, core: {} };

describe("discordPlugin", () => {
  it("implements the plugin contract as an integration plugin (R21.8)", () => {
    expect(discordPlugin.id).toBe(DISCORD_PLUGIN_ID);
    expect(discordPlugin.type).toBe("integration");
    expect(typeof discordPlugin.activate).toBe("function");
    expect(typeof discordPlugin.deactivate).toBe("function");
  });

  it("registers the messaging capability on activate", () => {
    const caps = discordPlugin.activate(context);
    const list = Array.isArray(caps) ? caps : [];
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(DISCORD_MESSAGING_CAPABILITY_ID);
    expect(list[0]?.kind).toBe("integration");
  });

  it("deactivates without throwing", () => {
    expect(() => discordPlugin.deactivate(context)).not.toThrow();
  });
});

describe("discord messaging capability", () => {
  it("delivers non-empty messages and rejects empty ones", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.string(), async (channel, content) => {
        const cap = createDiscordMessagingCapability();
        const result = await cap.postMessage({ channel, content });
        expect(result.delivered).toBe(content.length > 0);
      }),
      { numRuns: 100 },
    );
  });
});
