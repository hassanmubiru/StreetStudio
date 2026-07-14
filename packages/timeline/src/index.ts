/**
 * @streetstudio/timeline
 *
 * The timeline model for a recording: tracks, clips, and creator-placed markers
 * (press `M` while recording → typed marker). Pure model types shared by the
 * editor and player; no runtime side effects.
 */
import type { Seconds, MarkerKind } from "@streetstudio/types";

export const DOMAIN =
  "Timeline model: tracks, clips, and creator markers for recordings." as const;

/** A creator-placed marker anchored to a playback position. */
export interface Marker {
  readonly atSeconds: Seconds;
  readonly kind: MarkerKind;
  readonly label?: string;
}

/** A single media segment on a track. */
export interface Clip {
  readonly id: string;
  readonly startSeconds: Seconds;
  readonly endSeconds: Seconds;
}

/** A named lane of clips (e.g. screen, camera, audio). */
export interface Track {
  readonly id: string;
  readonly kind: "screen" | "camera" | "audio";
  readonly clips: readonly Clip[];
}

/** The full timeline of a recording. */
export interface Timeline {
  readonly durationSeconds: Seconds;
  readonly tracks: readonly Track[];
  readonly markers: readonly Marker[];
}
