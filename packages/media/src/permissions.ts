/**
 * Media-domain permission contracts.
 *
 * These are the RBAC action tokens a Role must grant to read/stream media
 * resources. They live in the media domain (where Videos and Assets are owned)
 * and are consumed both here — by comment and search authorization — and by the
 * playback service in `@streetstudio/player`, which re-exports
 * {@link VIEW_VIDEO_PERMISSION} for its own consumers.
 */

/**
 * Permission a Role must grant to view/stream a Video within an Organization
 * (R10.1, R10.2, R11.4, R14.4). Evaluated by `AccessControl.can` in the Video's
 * owning Organization scope.
 */
export const VIEW_VIDEO_PERMISSION = "content:view_video";
