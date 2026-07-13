/**
 * @streetstudio/player
 *
 * Streaming and playback for the StreetStudio platform: adaptive-bitrate
 * manifest generation gated by view permission (RBAC, in the Video's owning
 * Organization scope) or a valid, unexpired, non-revoked share credential
 * (Requirement 10, Properties 30/31).
 *
 * The player is a consumer of the media domain: it resolves a Video and its
 * renditions through the `@streetstudio/database` repositories and authorizes
 * with the media-domain `VIEW_VIDEO_PERMISSION` (re-exported here for
 * convenience), so it depends on `@streetstudio/media` for that permission
 * contract. It never depends on any application host, keeping the package
 * independently consumable (e.g. by an embeddable player surface).
 */
export const DOMAIN =
  "Streaming and playback: adaptive-bitrate manifest generation with view-permission and share-credential gating." as const;

export {
  PlaybackService,
  repositoryPlaybackStore,
  repositoryShareCredentialResolver,
  VIEW_VIDEO_PERMISSION,
} from "./playback.js";
export type {
  PlaybackServiceDeps,
  PlaybackStore,
  PlaybackContext,
  ShareCredentialResolver,
  ResolvedShare,
  StreamManifest,
  ManifestRendition,
} from "./playback.js";
