# @streetstudio/player

Streaming and playback for StreetStudio.

`PlaybackService` produces an adaptive-bitrate streaming manifest for a Video
**if and only if** the Video is `ready` **and** the requester either holds the
media-domain view permission (RBAC, evaluated in the Video's owning Organization
scope) **or** presents a share credential that is valid, unexpired, not revoked,
and bound to the Video (Requirement 10, Properties 30/31). Authorization is
checked before readiness so an unauthorized requester never learns a Video's
processing state.

The package is a consumer of the media domain: it resolves Videos and renditions
through the `@streetstudio/database` repositories and authorizes with
`VIEW_VIDEO_PERMISSION` from `@streetstudio/media` (re-exported here for
convenience). It depends on no application host, so it can back an embeddable or
standalone player surface.

## Public surface

- `PlaybackService` — `getManifest(ctx, videoId)`.
- `repositoryPlaybackStore`, `repositoryShareCredentialResolver` — default
  adapters over `@streetstudio/database`.
- `VIEW_VIDEO_PERMISSION` — re-exported media-domain permission contract.
- Types: `PlaybackServiceDeps`, `PlaybackStore`, `PlaybackContext`,
  `ShareCredentialResolver`, `ResolvedShare`, `StreamManifest`, `ManifestRendition`.

## Dependencies

`@streetstudio/shared`, `@streetstudio/auth`, `@streetstudio/database`,
`@streetstudio/media`.
