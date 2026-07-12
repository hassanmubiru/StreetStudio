import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { DOMAIN } from "./index.js";

describe("@streetstudio/shared scaffold", () => {
  it("exposes a domain marker", () => {
    expect(DOMAIN).toContain("Cross-cutting");
  });

  // Smoke property test confirming the fast-check runner is wired up.
  it("fast-check runner executes properties", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      })
    );
  });
});
