import { describe, expect, it } from "vitest";
import {
  MetricsRegistry,
  exposeMetrics,
  type StreetMetricsInterface,
} from "./metrics.js";

describe("MetricsRegistry (R30.4)", () => {
  it("increments counters, defaulting the amount to 1", () => {
    const registry = new MetricsRegistry();
    registry.increment("requests");
    registry.increment("requests");
    registry.increment("requests", 3);
    expect(registry.counter("requests")).toBe(5);
  });

  it("returns 0 for a counter that was never incremented", () => {
    expect(new MetricsRegistry().counter("unknown")).toBe(0);
  });

  it("rejects negative and non-finite counter increments to stay monotonic", () => {
    const registry = new MetricsRegistry();
    expect(() => registry.increment("x", -1)).toThrow(RangeError);
    expect(() => registry.increment("x", Number.NaN)).toThrow(RangeError);
  });

  it("sets and overwrites gauge values", () => {
    const registry = new MetricsRegistry();
    registry.setGauge("connections", 5);
    expect(registry.gauge("connections")).toBe(5);
    registry.setGauge("connections", 2);
    expect(registry.gauge("connections")).toBe(2);
  });

  it("returns undefined for a gauge that was never set", () => {
    expect(new MetricsRegistry().gauge("unknown")).toBeUndefined();
  });

  it("rejects non-finite gauge values", () => {
    expect(() => new MetricsRegistry().setGauge("g", Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
  });

  it("produces an immutable snapshot of all metrics", () => {
    const registry = new MetricsRegistry();
    registry.increment("requests", 10);
    registry.setGauge("connections", 3);
    const snapshot = registry.snapshot();
    expect(snapshot).toEqual({
      counters: { requests: 10 },
      gauges: { connections: 3 },
    });
    // Mutating after snapshotting does not change the earlier snapshot.
    registry.increment("requests");
    expect(snapshot.counters["requests"]).toBe(10);
  });
});

describe("exposeMetrics (StreetJS metrics interface)", () => {
  it("publishes every counter and gauge through the StreetJS metrics interface", () => {
    const counters: Record<string, number> = {};
    const gauges: Record<string, number> = {};
    const street: StreetMetricsInterface = {
      counter: (name, value) => {
        counters[name] = value;
      },
      gauge: (name, value) => {
        gauges[name] = value;
      },
    };

    const registry = new MetricsRegistry();
    registry.increment("requests", 7);
    registry.increment("errors", 1);
    registry.setGauge("connections", 4);

    const published = exposeMetrics(street, registry);

    expect(counters).toEqual({ requests: 7, errors: 1 });
    expect(gauges).toEqual({ connections: 4 });
    expect(published).toEqual(registry.snapshot());
  });
});
