/**
 * @streetstudio/media
 *
 * Public entry point for the media domain: videos, assets, the storage
 * abstraction, comments, sharing, playback, and search.
 */
import type { AuthContext } from "@streetstudio/auth";
import type { PluginType } from "@streetstudio/plugins";

export const DOMAIN =
  "Media domain: videos, assets, storage abstraction, comments, sharing, playback, and search." as const;

/** Placeholder access context threaded through media operations. */
export interface AccessContext {
  readonly auth: AuthContext;
}

/** Storage providers are supplied by plugins of this type. */
export const STORAGE_PLUGIN_TYPE: PluginType = "storage";
