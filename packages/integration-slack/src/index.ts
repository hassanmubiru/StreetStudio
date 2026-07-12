/**
 * @streetstudio/integration-slack
 *
 * Slack integration delivered as an isolated plugin (Requirement 21.8). It
 * implements the {@link Plugin} contract from `@streetstudio/plugins` and is
 * discovered/loaded through the StreetJS plugin loader like any other plugin.
 * No Slack vendor SDK is imported into platform core: the integration lives
 * entirely inside this plugin package.
 */
import type { Capability, Plugin, PluginContext } from "@streetstudio/plugins";

export const DOMAIN = "Slack integration plugin." as const;

/** Stable identifier for the Slack integration plugin. */
export const SLACK_PLUGIN_ID = "streetstudio.integration.slack";

/** A message to publish to a Slack channel. */
export interface SlackMessage {
  /** Target channel identifier (e.g. "#reviews" or a channel id). */
  readonly channel: string;
  /** Message body; must be non-empty to be delivered. */
  readonly text: string;
}

/** Outcome of a publish attempt. */
export interface SlackDeliveryResult {
  readonly delivered: boolean;
}

/**
 * The capability contributed by the Slack plugin: a channel-messaging surface
 * the platform can invoke without knowing anything about Slack internals.
 */
export interface SlackMessagingCapability {
  readonly service: "slack";
  postMessage(message: SlackMessage): Promise<SlackDeliveryResult>;
}

/** Capability id registered by the Slack plugin on activation. */
export const SLACK_MESSAGING_CAPABILITY_ID = "slack.messaging";

/** Construct the messaging capability implementation. */
export function createSlackMessagingCapability(): SlackMessagingCapability {
  return {
    service: "slack",
    async postMessage(message) {
      return { delivered: message.text.length > 0 };
    },
  };
}

/** The Slack integration plugin. */
export const slackPlugin: Plugin = {
  id: SLACK_PLUGIN_ID,
  type: "integration",
  activate(_context: PluginContext): Capability[] {
    return [
      {
        id: SLACK_MESSAGING_CAPABILITY_ID,
        kind: "integration",
        value: createSlackMessagingCapability(),
      },
    ];
  },
  deactivate(_context: PluginContext): void {
    // No long-lived resources to release for this integration.
  },
};

export default slackPlugin;
