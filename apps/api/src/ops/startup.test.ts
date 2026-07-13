import { describe, expect, it, vi } from "vitest";
import { StartupConfigError, objectConfigSource } from "@streetstudio/config";
import { DEFAULT_STARTUP_DEADLINE_MS, startApiService } from "./startup.js";

/** A complete, valid configuration record for the default platform schema. */
function validConfigRecord(): Record<string, unknown> {
  return {
    instanceId: "11111111-1111-1111-1111-111111111111",
    "database.url": "postgres://user:pass@localhost:5432/streetstudio",
    "redis.url": "redis://localhost:6379",
    "auth.jwtSecret": "a".repeat(32),
    "http.port": 8080,
    "http.publicBaseUrl": "https://studio.example.com",
  };
}

describe("startApiService — configuration validation (R30.3)", () => {
  it("returns the validated configuration when every required value is valid", async () => {
    const result = await startApiService({
      configSource: objectConfigSource(validConfigRecord()),
    });
    expect(result.config.httpPort).toBe(8080);
    expect(result.config.databaseUrl).toContain("postgres://");
    // Optional values fall back to their spec-aligned defaults.
    expect(result.config.signedUploadTtlSeconds).toBe(900);
  });

  it("aborts and names every missing required configuration value", async () => {
    // Provide nothing: all required values are missing.
    const promise = startApiService({ configSource: objectConfigSource({}) });
    await expect(promise).rejects.toBeInstanceOf(StartupConfigError);

    const error = await promise.catch((e: unknown) => e as StartupConfigError);
    const named = error.issues.map((i) => i.name);
    expect(named).toEqual(
      expect.arrayContaining([
        "instanceId",
        "database.url",
        "redis.url",
        "auth.jwtSecret",
        "http.port",
        "http.publicBaseUrl",
      ]),
    );
    // The message names each offending value so an operator can fix them all.
    for (const name of named) {
      expect(error.message).toContain(name);
    }
    expect(error.code).toBe("CONFIGURATION_INVALID");
  });

  it("aborts naming a present-but-invalid value alongside missing ones", async () => {
    const record = validConfigRecord();
    record["http.port"] = 999999; // out of the 1..65535 range → invalid
    delete record["redis.url"]; // → missing

    const error = await startApiService({
      configSource: objectConfigSource(record),
    }).catch((e: unknown) => e as StartupConfigError);

    const named = error.issues.map((i) => i.name);
    expect(named).toContain("http.port");
    expect(named).toContain("redis.url");
    expect(error.message).toContain("http.port");
    expect(error.message).toContain("redis.url");
  });

  it("does not activate dependencies when configuration is invalid", async () => {
    const activate = vi.fn().mockResolvedValue(undefined);
    await expect(
      startApiService({ configSource: objectConfigSource({}), activate }),
    ).rejects.toBeInstanceOf(StartupConfigError);
    // Startup aborts before any dependency is touched → no requests served.
    expect(activate).not.toHaveBeenCalled();
  });
});

describe("startApiService — activation within the deadline (R30.2)", () => {
  it("defaults the startup budget to 60 seconds", () => {
    expect(DEFAULT_STARTUP_DEADLINE_MS).toBe(60_000);
  });

  it("runs activation with the validated config and reports duration", async () => {
    const times = [1_000, 1_250];
    const clock = { now: vi.fn(() => times.shift() ?? 1_250) };
    const activate = vi.fn().mockResolvedValue(undefined);

    const result = await startApiService({
      configSource: objectConfigSource(validConfigRecord()),
      clock,
      activate,
    });

    expect(activate).toHaveBeenCalledTimes(1);
    expect(activate.mock.calls[0]?.[0]).toMatchObject({ httpPort: 8080 });
    expect(result.startedAt).toBe(1_000);
    expect(result.durationMs).toBe(250);
  });

  it("aborts with CAPABILITY_UNAVAILABLE when activation exceeds the deadline", async () => {
    // Activation never resolves; a tiny deadline forces the timeout path.
    const neverResolves = new Promise<void>(() => {});
    await expect(
      startApiService({
        configSource: objectConfigSource(validConfigRecord()),
        deadlineMs: 10,
        activate: () => neverResolves,
      }),
    ).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
  });

  it("propagates an activation failure", async () => {
    await expect(
      startApiService({
        configSource: objectConfigSource(validConfigRecord()),
        activate: () => Promise.reject(new Error("db down")),
      }),
    ).rejects.toThrow("db down");
  });
});
