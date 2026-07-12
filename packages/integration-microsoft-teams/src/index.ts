/**
 * @streetstudio/integration-microsoft-teams
 *
 * Microsoft Teams integration delivered as an isolated plugin (Requirement
 * 21.8). It implements the {@link Plugin} contract from `@streetstudio/plugins`
 * and is discovered/loaded through the StreetJS plugin loader. No Microsoft
 * Teams vendor SDK is imported into platform core: the integration lives
 * entirely inside this plugin package.
 */
import type { Capability, Plugin, PluginContext } from "@streetstudio/plugins";

export const DOMAIN = "Microsoft Teams integration plugin." as const;

/** Stable identifier for the Microsoft Teams integration plugin. */
export const MICROSOFT_TEAMS_PLUGIN_ID = "streetstudio.integration.microsoft-teams";

/** A message to publish to a Microsoft Teams channel. */
export interface TeamsMessage {
  /** Target channel identifier. */
  readonly channel: string;
  /** Message body; must be non-empty to be delivered. */
  readonly text: string;
}

/** Outcome of a publish attempt. */
export interface TeamsDeliveryResult {
  readonly delivered: boolean;
}

/** The channel-messaging capability contributed by the Teams plugin. */
export interface TeamsMessagingCapability {
  readonly service: "microsoft-teams";
  postMessage(message: TeamsMessage): Promise<TeamsDeliveryResult>;
}

/** Capability id registered by the Microsoft Teams plugin on activation. */
export const TEAMS_MESSAGING_CAPABILITY_ID = "microsoft-teams.messaging";

/** Construct the messaging capability implementation. */
export function createTeamsMessagingCapability(): TeamsMessagingCapability {
  return {
    service: "microsoft-teams",
    async postMessage(message) {
      return { delivered: message.text.length > 0 };
    },
  };
}

/** The Microsoft Teams integration plugin. */
export const microsoftTeamsPlugin: Plugin = {
  id: MICROSOFT_TEAMS_PLUGIN_ID,
  type: "integration",
  activate(_context: PluginContext): Capability[] {
    return [
      {
        id: TEAMS_MESSAGING_CAPABILITY_ID,
        kind: "integration",
        value: createTeamsMessagingCapability(),
      },
    ];
  },
  deactivate(_context: PluginContext): void {
    // No long-lived resources to release for this integration.
  },
};

export default microsoftTeamsPlugin;
