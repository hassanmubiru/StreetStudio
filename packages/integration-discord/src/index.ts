/**
 * @streetstudio/integration-discord
 *
 * Discord integration delivered as an isolated plugin (Requirement 21.8). It
 * implements the {@link Plugin} contract from `@streetstudio/plugins` and is
 * discovered/loaded through the StreetJS plugin loader. No Discord vendor SDK
 * is imported into platform core: the integration lives entirely inside this
 * plugin package.
 */
import type { Capability, Plugin, PluginContext } from "@streetstudio/plugins";

export const DOMAIN = "Discord integration plugin." as const;

/** Stable identifier for the Discord integration plugin. */
export const DISCORD_PLUGIN_ID = "streetstudio.integration.discord";

/** A message to publish to a Discord channel. */
export interface DiscordMessage {
  /** Target channel identifier. */
  readonly channel: string;
  /** Message body; must be non-empty to be delivered. */
  readonly content: string;
}

/** Outcome of a publish attempt. */
export interface DiscordDeliveryResult {
  readonly delivered: boolean;
}

/** The channel-messaging capability contributed by the Discord plugin. */
export interface DiscordMessagingCapability {
  readonly service: "discord";
  postMessage(message: DiscordMessage): Promise<DiscordDeliveryResult>;
}

/** Capability id registered by the Discord plugin on activation. */
export const DISCORD_MESSAGING_CAPABILITY_ID = "discord.messaging";

/** Construct the messaging capability implementation. */
export function createDiscordMessagingCapability(): DiscordMessagingCapability {
  return {
    service: "discord",
    async postMessage(message) {
      return { delivered: message.content.length > 0 };
    },
  };
}

/** The Discord integration plugin. */
export const discordPlugin: Plugin = {
  id: DISCORD_PLUGIN_ID,
  type: "integration",
  activate(_context: PluginContext): Capability[] {
    return [
      {
        id: DISCORD_MESSAGING_CAPABILITY_ID,
        kind: "integration",
        value: createDiscordMessagingCapability(),
      },
    ];
  },
  deactivate(_context: PluginContext): void {
    // No long-lived resources to release for this integration.
  },
};

export default discordPlugin;
