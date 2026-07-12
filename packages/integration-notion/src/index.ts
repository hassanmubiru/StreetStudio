/**
 * @streetstudio/integration-notion
 *
 * Notion integration delivered as an isolated plugin (Requirement 21.8). It
 * implements the {@link Plugin} contract from `@streetstudio/plugins` and is
 * discovered/loaded through the StreetJS plugin loader. No Notion vendor SDK is
 * imported into platform core: the integration lives entirely inside this
 * plugin package.
 */
import type { Capability, Plugin, PluginContext } from "@streetstudio/plugins";

export const DOMAIN = "Notion integration plugin." as const;

/** Stable identifier for the Notion integration plugin. */
export const NOTION_PLUGIN_ID = "streetstudio.integration.notion";

/** A page to create in a Notion workspace/database. */
export interface NotionPageInput {
  /** Parent database or page id the new page belongs to. */
  readonly parentId: string;
  /** Page title; must be non-empty. */
  readonly title: string;
  /** Optional page body content. */
  readonly body?: string;
}

/** A reference to a created Notion page. */
export interface NotionPageRef {
  readonly parentId: string;
  readonly title: string;
}

/** The knowledge-page capability contributed by the Notion plugin. */
export interface NotionPagesCapability {
  readonly service: "notion";
  createPage(input: NotionPageInput): Promise<NotionPageRef>;
}

/** Capability id registered by the Notion plugin on activation. */
export const NOTION_PAGES_CAPABILITY_ID = "notion.pages";

/** Construct the pages capability implementation. */
export function createNotionPagesCapability(): NotionPagesCapability {
  return {
    service: "notion",
    async createPage(input) {
      if (input.title.length === 0) {
        throw new Error("Notion page title must be non-empty.");
      }
      return { parentId: input.parentId, title: input.title };
    },
  };
}

/** The Notion integration plugin. */
export const notionPlugin: Plugin = {
  id: NOTION_PLUGIN_ID,
  type: "integration",
  activate(_context: PluginContext): Capability[] {
    return [
      {
        id: NOTION_PAGES_CAPABILITY_ID,
        kind: "integration",
        value: createNotionPagesCapability(),
      },
    ];
  },
  deactivate(_context: PluginContext): void {
    // No long-lived resources to release for this integration.
  },
};

export default notionPlugin;
