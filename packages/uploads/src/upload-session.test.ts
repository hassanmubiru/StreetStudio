import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { UploadSession, UploadStateError, type Actor } from "./domain/upload-session.js";

const actor: Actor = {
  memberId: "11111111-1111-1111-1111-111111111111",
  organizationId: "22222222-2222-2222-2222-222222222222",
};
const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

function begin(totalParts = 3, objectKey = "videos/demo.mp4") {
  return UploadSession.begin({ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", owner: actor, objectKey, totalParts, createdAt: NOW });
}

describe("UploadSession domain", () => {
  it("begins pending with no parts received", () => {
    const s = begin();
    expect(s.status).toBe("pending");
    expect(s.receivedParts).toEqual([]);
    expect(s.isComplete).toBe(false);
  });

  it("rejects an empty object key and out-of-range part counts", () => {
    expect(() => begin(3, "  ")).toThrow(UploadStateError);
    expect(() => begin(0)).toThrow(UploadStateError);
    expect(() => begin(10_001)).toThrow(UploadStateError);
  });

  it("records parts, is idempotent, and rejects out-of-range parts", () => {
    let s = begin(2);
    s = s.receivePart(2).receivePart(1).receivePart(1); // idempotent re-receive
    expect(s.receivedParts).toEqual([1, 2]);
    expect(s.isComplete).toBe(true);
    expect(() => begin(2).receivePart(3)).toThrow(UploadStateError);
    expect(() => begin(2).receivePart(0)).toThrow(UploadStateError);
  });

  it("completes only when all parts are present", () => {
    expect(() => begin(2).receivePart(1).complete(LATER)).toThrow(/1 part\(s\) still missing/);
    const done = begin(2).receivePart(1).receivePart(2).complete(LATER);
    expect(done.status).toBe("completed");
    expect(() => done.complete(LATER)).toThrow(UploadStateError);
  });

  it("abort is terminal and blocks further receipt/completion", () => {
    const aborted = begin(2).receivePart(1).abort(LATER);
    expect(aborted.status).toBe("aborted");
    expect(() => aborted.receivePart(2)).toThrow(UploadStateError);
    expect(() => aborted.complete(LATER)).toThrow(UploadStateError);
    expect(() => aborted.abort(LATER)).toThrow(UploadStateError);
  });

  it("only the owner may edit", () => {
    const s = begin();
    expect(s.canEdit(actor)).toBe(true);
    expect(s.canEdit({ ...actor, memberId: "33333333-3333-3333-3333-333333333333" })).toBe(false);
  });
});

describe("UploadSession properties", () => {
  it("receiving all parts in any order yields a completable session", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 25 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (total, seed) => {
          const order = shuffle(range(1, total), seed);
          let s = begin(total);
          for (const n of order) s = s.receivePart(n);
          expect(s.isComplete).toBe(true);
          expect(s.receivedParts).toEqual(range(1, total));
          expect(s.complete(LATER).status).toBe("completed");
        },
      ),
    );
  });

  it("any part number outside [1, total] is always rejected", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), fc.integer(), (total, n) => {
        if (Number.isInteger(n) && n >= 1 && n <= total) return; // in-range: skip
        expect(() => begin(total).receivePart(n)).toThrow(UploadStateError);
      }),
    );
  });
});

function range(lo: number, hi: number): number[] {
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}
function shuffle(arr: number[], seed: number): number[] {
  const a = [...arr];
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
