import { describe, it, expect } from "vitest";
import { clipCount, type Timeline } from "@streetstudio/timeline";
import { applyEdit, applyEdits } from "./apply.js";

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
    ],
    markers: [
      { atSeconds: 10, kind: "bug" },
      { atSeconds: 50, kind: "todo" },
    ],
  };
}

describe("applyEdit — trim", () => {
  it("keeps only the window, shifts to 0, and re-scopes markers", () => {
    const out = applyEdit(sample(), { op: "trim", startSeconds: 20, endSeconds: 60 });
    expect(out.durationSeconds).toBe(40);
    expect(out.tracks[0]!.clips).toEqual([
      { id: "a", startSeconds: 0, endSeconds: 20 },
      { id: "b", startSeconds: 20, endSeconds: 40 },
    ]);
    // marker@10 dropped (outside window); marker@50 shifted to 30
    expect(out.markers).toEqual([{ atSeconds: 30, kind: "todo" }]);
  });

  it("rejects an invalid window", () => {
    expect(() => applyEdit(sample(), { op: "trim", startSeconds: 60, endSeconds: 20 })).toThrow(RangeError);
  });
});

describe("applyEdit — split", () => {
  it("splits the clip spanning the cut point", () => {
    const out = applyEdit(sample(), { op: "split", atSeconds: 20 });
    expect(clipCount(out)).toBe(3);
    expect(out.tracks[0]!.clips).toEqual([
      { id: "a", startSeconds: 0, endSeconds: 20 },
      { id: "a#2", startSeconds: 20, endSeconds: 40 },
      { id: "b", startSeconds: 40, endSeconds: 100 },
    ]);
    expect(out.durationSeconds).toBe(100);
  });

  it("does not split at a clip boundary", () => {
    expect(clipCount(applyEdit(sample(), { op: "split", atSeconds: 40 }))).toBe(2);
  });
});

describe("applyEdit — speed", () => {
  it("scales every time by 1/factor", () => {
    const out = applyEdit(sample(), { op: "speed", factor: 2 });
    expect(out.durationSeconds).toBe(50);
    expect(out.tracks[0]!.clips).toEqual([
      { id: "a", startSeconds: 0, endSeconds: 20 },
      { id: "b", startSeconds: 20, endSeconds: 50 },
    ]);
    expect(out.markers).toEqual([
      { atSeconds: 5, kind: "bug" },
      { atSeconds: 25, kind: "todo" },
    ]);
  });

  it("rejects a non-positive factor", () => {
    expect(() => applyEdit(sample(), { op: "speed", factor: 0 })).toThrow(RangeError);
  });
});

describe("applyEdit — merge", () => {
  it("merges identified clips into one spanning clip", () => {
    const out = applyEdit(sample(), { op: "merge", clipIds: ["a", "b"] });
    expect(out.tracks[0]!.clips).toEqual([{ id: "a", startSeconds: 0, endSeconds: 100 }]);
  });
});

describe("applyEdit — non-structural overlays", () => {
  it("passes the timeline through unchanged for crop/caption/annotate", () => {
    const tl = sample();
    expect(applyEdit(tl, { op: "crop", x: 0, y: 0, width: 10, height: 10 })).toEqual(tl);
    expect(applyEdit(tl, { op: "caption", atSeconds: 5, text: "hi" })).toEqual(tl);
    expect(applyEdit(tl, { op: "annotate", atSeconds: 5, kind: "arrow" })).toEqual(tl);
  });
});

describe("applyEdits — folds a session", () => {
  it("applies operations in order and never mutates the source", () => {
    const source = sample();
    const out = applyEdits({
      source,
      operations: [
        { op: "trim", startSeconds: 0, endSeconds: 80 },
        { op: "speed", factor: 2 },
      ],
    });
    // trim → duration 80; speed/2 → 40
    expect(out.durationSeconds).toBe(40);
    expect(source.durationSeconds).toBe(100); // immutable
  });
});
