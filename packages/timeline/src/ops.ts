/**
 * Pure helper operations over the {@link Timeline} model. No side effects; every
 * function returns a new value and never mutates its input.
 */
import type { Marker, Timeline } from "./index.js";

/** Total timeline duration in seconds. */
export function totalDuration(tl: Timeline): number {
  return tl.durationSeconds;
}

/** Total number of clips across all tracks. */
export function clipCount(tl: Timeline): number {
  return tl.tracks.reduce((n, t) => n + t.clips.length, 0);
}

/** Markers ordered by playback position (ascending), as a new array. */
export function sortedMarkers(tl: Timeline): readonly Marker[] {
  return [...tl.markers].sort((a, b) => a.atSeconds - b.atSeconds);
}

/**
 * Return a copy of `tl` with `marker` added. Throws {@link RangeError} when the
 * marker falls outside the timeline (`0 <= atSeconds <= durationSeconds`).
 */
export function withMarker(tl: Timeline, marker: Marker): Timeline {
  if (marker.atSeconds < 0 || marker.atSeconds > tl.durationSeconds) {
    throw new RangeError(
      `Marker at ${marker.atSeconds}s is outside the timeline [0, ${tl.durationSeconds}]`,
    );
  }
  return { ...tl, markers: [...tl.markers, marker] };
}
