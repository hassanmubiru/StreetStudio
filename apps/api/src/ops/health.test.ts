import { describe, expect, it, vi } from "vitest";
import {
  HealthChecker,
  exposeHealthCheck,
  probeFromHealthCheck,
  type DependencyProbe,
  type StreetHealthInterface,
} from "./health.js";

const reachable = (name: string): DependencyProbe => ({
  name,
  check: () => Promise.resolve(),
});

const unreachable = (name: string, detail?: string): DependencyProbe => ({
  name,
  check: () => Promise.reject(detail ? new Error(detail) : new Error()),
});

const fixedClock = { now: () => 42 };

describe("HealthChecker (R30.4)", () => {
  it("reports passing when every dependency is reachable", async () => {
    const checker = new HealthChecker(
      [reachable("database"), reachable("redis"), reachable("storage")],
      fixedClock,
    );
    const report = await checker.check();
    expect(report.status).toBe("passing");
    expect(report.dependencies.every((d) => d.reachable)).toBe(true);
    expect(report.checkedAt).toBe(42);
  });

  it("reports failing when any single dependency is unreachable", async () => {
    const checker = new HealthChecker([
      reachable("database"),
      unreachable("redis", "connection refused"),
      reachable("storage"),
    ]);
    const report = await checker.check();
    expect(report.status).toBe("failing");
    const redis = report.dependencies.find((d) => d.name === "redis");
    expect(redis?.reachable).toBe(false);
    expect(redis?.detail).toBe("connection refused");
    // Other dependencies remain reported as reachable — one failure does not
    // mask the rest.
    expect(report.dependencies.find((d) => d.name === "database")?.reachable).toBe(true);
  });

  it("reports failing when all dependencies are unreachable", async () => {
    const checker = new HealthChecker([unreachable("database"), unreachable("redis")]);
    const report = await checker.check();
    expect(report.status).toBe("failing");
    expect(report.dependencies.every((d) => !d.reachable)).toBe(true);
  });

  it("reports passing with no probes registered", async () => {
    const report = await new HealthChecker().check();
    expect(report.status).toBe("passing");
    expect(report.dependencies).toEqual([]);
  });

  it("preserves probe declaration order and names", async () => {
    const checker = new HealthChecker([
      reachable("database"),
      reachable("redis"),
      reachable("storage"),
    ]);
    expect(checker.dependencyNames()).toEqual(["database", "redis", "storage"]);
    const report = await checker.check();
    expect(report.dependencies.map((d) => d.name)).toEqual([
      "database",
      "redis",
      "storage",
    ]);
  });

  it("never throws when a probe rejects", async () => {
    const checker = new HealthChecker([unreachable("storage")]);
    await expect(checker.check()).resolves.toMatchObject({ status: "failing" });
  });
});

describe("probeFromHealthCheck", () => {
  it("builds a probe that resolves when the seam's healthCheck resolves", async () => {
    const probe = probeFromHealthCheck("storage", { healthCheck: () => Promise.resolve() });
    await expect(probe.check()).resolves.toBeUndefined();
    expect(probe.name).toBe("storage");
  });

  it("builds a probe that rejects when the seam's healthCheck rejects", async () => {
    const probe = probeFromHealthCheck("storage", {
      healthCheck: () => Promise.reject(new Error("no bucket")),
    });
    await expect(probe.check()).rejects.toThrow("no bucket");
  });
});

describe("exposeHealthCheck (StreetJS health interface)", () => {
  it("registers a callback that is healthy only when the report passes", async () => {
    const registrations = new Map<string, () => Promise<boolean>>();
    const street: StreetHealthInterface = {
      registerHealthCheck: (name, check) => {
        registrations.set(name, check);
      },
    };

    const passing = new HealthChecker([reachable("database")]);
    exposeHealthCheck(street, passing, "api");
    await expect(registrations.get("api")?.()).resolves.toBe(true);

    const failing = new HealthChecker([unreachable("database")]);
    exposeHealthCheck(street, failing, "api");
    await expect(registrations.get("api")?.()).resolves.toBe(false);
  });

  it("defaults the registration name to \"api\"", () => {
    const register = vi.fn();
    exposeHealthCheck({ registerHealthCheck: register }, new HealthChecker());
    expect(register).toHaveBeenCalledWith("api", expect.any(Function));
  });
});
