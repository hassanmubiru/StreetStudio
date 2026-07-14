/**
 * The editor reducer: apply non-destructive {@link EditOperation}s to a
 * {@link Timeline}, always returning a new timeline (inputs are never mutated).
 *
 * Structural operations (`trim`, `split`, `merge`, `speed`) transform clips,
 * duration, and markers. Non-structural operations (`crop`, `caption`,
 * `annotate`) are render-time overlays and pass the timeline through unchanged.
 */
import type { Clip, Timeline, Track } from "@streetstudio/timeline";
import type { EditOperation, EditSession } from "./model.js";

/** Replace every track's clip list via `f`, preserving track identity/order. */
function mapTrackClips(tl: Timeline, f: (clips: readonly Clip[]) => Clip[]): Track[] {
  return tl.tracks.map((t) => ({ ...t, clips: f(t.clips) }));
}

const byStart = (a: Clip, b: Clip): number => a.startSeconds - b.startSeconds;

/** Keep only the `[start, end)` window, shifted to begin at 0 (R: trim). */
function trim(tl: Timeline, start: number, end: number): Timeline {
  if (!(start >= 0) || !(end > start)) {
    throw new RangeError(`trim requires 0 <= start < end (got start=${start}, end=${end})`);
  }
  const effectiveEnd = Math.min(end, tl.durationSeconds);
  const clip = (c: Clip): Clip[] => {
    const lo = Math.max(c.startSeconds, start);
    const hi = Math.min(c.endSeconds, effectiveEnd);
    return hi > lo ? [{ ...c, startSeconds: lo - start, endSeconds: hi - start }] : [];
  };
  return {
    durationSeconds: Math.max(0, effectiveEnd - start),
    tracks: mapTrackClips(tl, (clips) => clips.flatMap(clip)),
    markers: tl.markers
      .filter((m) => m.atSeconds >= start && m.atSeconds <= effectiveEnd)
      .map((m) => ({ ...m, atSeconds: m.atSeconds - start })),
  };
}

/** Split any clip spanning `at` into two adjacent clips (R: split). */
function split(tl: Timeline, at: number): Timeline {
  if (!(at > 0) || !(at < tl.durationSeconds)) {
    throw new RangeError(`split requires 0 < at < duration (got at=${at}, duration=${tl.durationSeconds})`);
  }
  const clip = (c: Clip): Clip[] =>
    c.startSeconds < at && at < c.endSeconds
      ? [
          { ...c, endSeconds: at },
          { ...c, id: `${c.id}#2`, startSeconds: at },
        ]
      : [c];
  return { ...tl, tracks: mapTrackClips(tl, (clips) => clips.flatMap(clip)) };
}

/** Scale all times by `1/factor` (R: speed; factor > 0, faster ⇒ shorter). */
function speed(tl: Timeline, factor: number): Timeline {
  if (!(factor > 0) || !Number.isFinite(factor)) {
    throw new RangeError(`speed requires a positive finite factor (got ${factor})`);
  }
  const s = (v: number): number => v / factor;
  return {
    durationSeconds: s(tl.durationSeconds),
    tracks: mapTrackClips(tl, (clips) =>
      clips.map((c) => ({ ...c, startSeconds: s(c.startSeconds), endSeconds: s(c.endSeconds) })),
    ),
    markers: tl.markers.map((m) => ({ ...m, atSeconds: s(m.atSeconds) })),
  };
}

/** Merge the identified clips within each track into one spanning clip. */
function merge(tl: Timeline, clipIds: readonly string[]): Timeline {
  const ids = new Set(clipIds);
  return {
    ...tl,
    tracks: mapTrackClips(tl, (clips) => {
      const matched = clips.filter((c) => ids.has(c.id));
      if (matched.length < 2) return [...clips];
      const merged: Clip = {
        ...matched[0]!,
        startSeconds: Math.min(...matched.map((c) => c.startSeconds)),
        endSeconds: Math.max(...matched.map((c) => c.endSeconds)),
      };
      return [...clips.filter((c) => !ids.has(c.id)), merged].sort(byStart);
    }),
  };
}

/** Apply a single edit operation, returning a new timeline. */
export function applyEdit(tl: Timeline, op: EditOperation): Timeline {
  switch (op.op) {
    case "trim":
      return trim(tl, op.startSeconds, op.endSeconds);
    case "split":
      return split(tl, op.atSeconds);
    case "speed":
      return speed(tl, op.factor);
    case "merge":
      return merge(tl, op.clipIds);
    case "crop":
    case "caption":
    case "annotate":
      // Non-structural overlays: resolved at render time; structure is unchanged.
      return tl;
  }
}

/** Fold an entire {@link EditSession} into the resulting timeline. */
export function applyEdits(session: EditSession): Timeline {
  return session.operations.reduce(applyEdit, session.source);
}
