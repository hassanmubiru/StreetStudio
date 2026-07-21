/**
 * @streetstudio/playback
 *
 * Playback — authorized byte-range streaming of a completed upload's assembled
 * object, built on StreetJS + `@streetjs/storage`. Authorization defers to the
 * uploads domain (the object must belong to a completed upload in the actor's
 * organization). Composes the framework; reimplements nothing.
 */
export const DOMAIN =
  "Playback: authorized byte-range streaming of completed uploads." as const;

export {
  PlaybackService,
  parseRange,
  type PlaybackObject,
  type ByteRange,
} from "./application/playback-service.js";

export { PlaybackController } from "./api/playback-controller.js";
export { createPlaybackApp, registerPlayback } from "./api/app.js";
