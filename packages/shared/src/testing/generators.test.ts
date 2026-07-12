import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  LENGTH_BOUNDS,
  LENGTH_BOUNDARY_VALUES,
  ONE_MB,
  HUNDRED_MB,
  stringOfLength,
  boundaryString,
  emailArb,
  emailOfLength,
  invalidEmailArb,
  passwordArb,
  shortPasswordArb,
  passwordWithValidityArb,
  PASSWORD_MIN_LENGTH,
  orgNameArb,
  contentNameArb,
  orgNameBoundaryArb,
  boundedTextAtCanonicalLengthArb,
  timestampWithinDurationArb,
  epochTimestampArb,
  chunkSizeArb,
  bytePayloadArb,
  bytePayloadBoundaryArb,
  orderedChunkSequenceArb,
  multiOrgGraphArb,
  pluginSetWithFailuresArb,
} from "./generators.js";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

describe("shared testing generators", () => {
  it("stringOfLength produces strings of the exact requested length", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500 }), (n) => {
        const s = fc.sample(stringOfLength(n), 1)[0]!;
        return s.length === n;
      })
    );
  });

  it("boundaryString stays within [0, max+1] and hits the extremes", () => {
    const samples = fc.sample(boundaryString(1, 200), 200);
    const lengths = new Set(samples.map((s) => s.length));
    expect(lengths.has(1)).toBe(true);
    expect(lengths.has(200)).toBe(true);
    expect([...lengths].every((l) => l >= 0 && l <= 201)).toBe(true);
  });

  it("emailArb yields syntactically valid emails", () => {
    fc.assert(fc.property(emailArb, (e) => EMAIL_RE.test(e)));
  });

  it("emailOfLength produces valid emails and invalidEmailArb produces invalid ones", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 300 }), (n) => {
        const e = fc.sample(emailOfLength(n), 1)[0]!;
        return EMAIL_RE.test(e);
      })
    );
    fc.assert(fc.property(invalidEmailArb, (e) => !EMAIL_RE.test(e)));
  });

  it("password generators respect the minimum-length rule", () => {
    fc.assert(
      fc.property(passwordArb, (p) => p.length >= PASSWORD_MIN_LENGTH)
    );
    fc.assert(
      fc.property(shortPasswordArb, (p) => p.length < PASSWORD_MIN_LENGTH)
    );
    fc.assert(
      fc.property(passwordWithValidityArb, ({ password, valid }) => {
        return valid === password.length >= PASSWORD_MIN_LENGTH;
      })
    );
  });

  it("name generators stay within their length windows", () => {
    fc.assert(
      fc.property(orgNameArb, (n) => n.length >= 1 && n.length <= LENGTH_BOUNDS.ORG_NAME_MAX)
    );
    fc.assert(
      fc.property(
        contentNameArb,
        (n) => n.length >= 1 && n.length <= LENGTH_BOUNDS.CONTENT_NAME_MAX
      )
    );
    // Boundary generator can produce out-of-range values (e.g. 0 or 201).
    const boundarySamples = fc.sample(orgNameBoundaryArb, 200);
    expect(boundarySamples.some((s) => s.length === 0 || s.length === 201)).toBe(
      true
    );
  });

  it("boundedTextAtCanonicalLength hits every canonical length boundary", () => {
    fc.assert(
      fc.property(boundedTextAtCanonicalLengthArb, ({ length, text }) => {
        return (
          text.length === length &&
          (LENGTH_BOUNDARY_VALUES as readonly number[]).includes(length)
        );
      })
    );
    const seen = new Set(
      fc.sample(boundedTextAtCanonicalLengthArb, 500).map((x) => x.length)
    );
    for (const bound of LENGTH_BOUNDARY_VALUES) {
      expect(seen.has(bound)).toBe(true);
    }
  });

  it("timestamp generator's valid flag matches the 0..duration window", () => {
    fc.assert(
      fc.property(timestampWithinDurationArb, ({ duration, timestamp, valid }) => {
        return valid === (timestamp >= 0 && timestamp <= duration);
      })
    );
  });

  it("epoch timestamps cluster around 0", () => {
    const samples = fc.sample(epochTimestampArb, 300);
    expect(samples.includes(0)).toBe(true);
  });

  it("chunk-size generator's valid flag matches the 1MB..100MB window", () => {
    fc.assert(
      fc.property(chunkSizeArb, ({ size, valid }) => {
        return valid === (size >= ONE_MB && size <= HUNDRED_MB);
      })
    );
    const sizes = new Set(fc.sample(chunkSizeArb, 400).map((c) => c.size));
    expect(sizes.has(ONE_MB)).toBe(true);
    expect(sizes.has(HUNDRED_MB)).toBe(true);
  });

  it("byte payload generators respect their size bounds", () => {
    fc.assert(
      fc.property(bytePayloadArb(256), (bytes) => {
        return bytes instanceof Uint8Array && bytes.length <= 256;
      })
    );
    const boundary = fc.sample(bytePayloadBoundaryArb, 200);
    expect(boundary.some((b) => b.length === 0)).toBe(true);
    expect(boundary.some((b) => b.length === 1)).toBe(true);
  });

  it("ordered chunk sequences are contiguously indexed with in-range sizes", () => {
    fc.assert(
      fc.property(orderedChunkSequenceArb, (chunks) => {
        return chunks.every(
          (c, i) => c.index === i && c.size >= ONE_MB && c.size <= HUNDRED_MB
        );
      })
    );
  });

  it("multi-org graphs have >= 2 orgs with globally-unique ids and valid nesting", () => {
    fc.assert(
      fc.property(multiOrgGraphArb, (orgs) => {
        const ids = orgs.map((o) => o.id);
        const uniqueIds = new Set(ids).size === ids.length;
        const validDepth = orgs.every((o) =>
          o.projects.every((p) => p.folders.every((f) => f.depth >= 0 && f.depth <= 9))
        );
        return orgs.length >= 2 && uniqueIds && validDepth;
      })
    );
  });

  it("plugin sets have unique ids and at least one injected failure", () => {
    fc.assert(
      fc.property(pluginSetWithFailuresArb, (plugins) => {
        const ids = plugins.map((p) => p.id);
        const uniqueIds = new Set(ids).size === ids.length;
        const hasFailure = plugins.some((p) => p.failureMode !== "none");
        return plugins.length >= 2 && uniqueIds && hasFailure;
      })
    );
  });
});
