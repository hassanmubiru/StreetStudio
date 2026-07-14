import { describe, it, expect } from "vitest";
import {
  clipCount,
  sortedMarkers,
  totalDuration,
  withMarker,
  type Timeline,
} from "./index.js";

function sample(): Timeline {
  return {
    durationSeconds: 100,
    tracks: [
      {
        id: "screen",
        kind: "screen",
        clips: [
          { id: "a", startSeconds: 0, endSeconds: 40 },
          { id: "b", startSeconds: 40, endSeconds: 100 },
        ],
      },
      { id: "audio", kind: "audio", clips: [{ id: "c", startSeconds: 0, endSeconds: 100 }] },
    ],
    markers: [
      { atSeconds: 50, kind: "todo" },
      { atSeconds: 10, kind: "bug", label: "repro" },
    ],
  };
}

describe("timeline ops", () => {
  it("totalDuration and clipCount reflect the model", () => {
    const tl = sample();
    expect(totalDuration(tl)).toBe(100);
    expect(clipCount(tl)).toBe(3);
  });

  it("sortedMarkers orders by playback position without mutating", () => {
    const tl = sample();
    expect(sortedMarkers(tl).map((m) => m.atSeconds)).toEqual([10, 50]);
    // original untouched
    expect(tl.markers.map((m) => m.atSeconds)).toEqual([50, 10]);
  });

  it("withMarker appends within bounds and rejects out-of-range", () => {
    const tl = sample();
    const next = withMarker(tl, { atSeconds: 75, kind: "decision" });
    expect(next.markers).toHaveLength(3);
    expect(tl.markers).toHaveLength(2); // immutable
    expect(() => withMarker(tl, { atSeconds: 150, kind: "marker" })).toThrow(RangeError);
    expect(() => withMarker(tl, { atSeconds: -1, kind: "marker" })).toThrow(RangeError);
  });
});
