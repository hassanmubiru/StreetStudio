import { describe, it, expect } from "vitest";
import fc from "fast-check";
import notionPlugin, {
  NOTION_PLUGIN_ID,
  NOTION_PAGES_CAPABILITY_ID,
  createNotionPagesCapability,
} from "./index.js";
import type { PluginContext } from "@streetstudio/plugins";

const context: PluginContext = { pluginId: NOTION_PLUGIN_ID, core: {} };

describe("notionPlugin", () => {
  it("implements the plugin contract as an integration plugin (R21.8)", () => {
    expect(notionPlugin.id).toBe(NOTION_PLUGIN_ID);
    expect(notionPlugin.type).toBe("integration");
    expect(typeof notionPlugin.activate).toBe("function");
    expect(typeof notionPlugin.deactivate).toBe("function");
  });

  it("registers the pages capability on activate", () => {
    const caps = notionPlugin.activate(context);
    const list = Array.isArray(caps) ? caps : [];
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(NOTION_PAGES_CAPABILITY_ID);
    expect(list[0]?.kind).toBe("integration");
  });

  it("deactivates without throwing", () => {
    expect(() => notionPlugin.deactivate(context)).not.toThrow();
  });
});

describe("notion pages capability", () => {
  it("creates a page for any non-empty title and echoes the parent", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string(),
        fc.string({ minLength: 1 }),
        async (parentId, title) => {
          const cap = createNotionPagesCapability();
          const ref = await cap.createPage({ parentId, title });
          expect(ref.parentId).toBe(parentId);
          expect(ref.title).toBe(title);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects an empty title", async () => {
    const cap = createNotionPagesCapability();
    await expect(cap.createPage({ parentId: "p", title: "" })).rejects.toThrow();
  });
});
