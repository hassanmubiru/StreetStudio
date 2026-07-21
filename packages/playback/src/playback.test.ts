import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseRange } from "./application/playback-service.js";

describe("parseRange", () => {
  it("returns null when there is no header or it is unparseable", () => {
    expect(parseRange(undefined, 10)).toBeNull();
    expect(parseRange("bytes=abc", 10)).toBeNull();
    expect(parseRange("items=0-5", 10)).toBeNull();
    expect(parseRange("bytes=-", 10)).toBeNull();
  });

  it("parses a closed range", () => {
    expect(parseRange("bytes=0-4", 10)).toEqual({ start: 0, end: 4 });
    expect(parseRange("bytes=2-7", 10)).toEqual({ start: 2, end: 7 });
  });

  it("parses an open-ended range (clamped to size)", () => {
    expect(parseRange("bytes=5-", 10)).toEqual({ start: 5, end: 9 });
    expect(parseRange("bytes=0-100", 10)).toEqual({ start: 0, end: 9 });
  });

  it("parses a suffix range", () => {
    expect(parseRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
    expect(parseRange("bytes=-100", 10)).toEqual({ start: 0, end: 9 });
  });

  it("flags unsatisfiable ranges", () => {
    expect(parseRange("bytes=100-200", 10)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 10)).toBe("unsatisfiable");
    expect(parseRange("bytes=10-", 10)).toBe("unsatisfiable");
  });

  it("property: a valid closed range within size round-trips", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 0, max: 9_999 }),
        fc.integer({ min: 0, max: 9_999 }),
        (size, a, b) => {
          // Construct a guaranteed 0 <= start <= end < size.
          const start = a % size;
          const end = start + (b % (size - start));
          const result = parseRange(`bytes=${start}-${end}`, size);
          expect(result).toEqual({ start, end });
        },
      ),
    );
  });

  it("property: a start at or beyond size is always unsatisfiable", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), fc.integer({ min: 0, max: 1000 }), (size, extra) => {
        const start = size + extra;
        expect(parseRange(`bytes=${start}-`, size)).toBe("unsatisfiable");
      }),
    );
  });
});
