import { describe, expect, it } from "vitest";
import { AppError } from "@streetstudio/shared";
import {
  DEFAULT_CONFIG_SCHEMA,
  StartupConfigError,
  formatConfigIssues,
  loadPlatformConfig,
  objectConfigSource,
  streetConfigSource,
  validatePlatformConfig,
  type PlatformConfig,
} from "./config.js";

/** A complete, valid set of raw configuration values. */
function validRaw(): Record<string, unknown> {
  return {
    instanceId: "123e4567-e89b-12d3-a456-426614174000",
    "database.url": "postgres://user:pass@localhost:5432/streetstudio",
    "redis.url": "redis://localhost:6379",
    "auth.jwtSecret": "a".repeat(32),
    "http.port": 8080,
    "http.publicBaseUrl": "https://studio.example.com",
  };
}

describe("validatePlatformConfig", () => {
  it("accepts a complete, valid configuration and applies defaults", () => {
    const result = validatePlatformConfig(objectConfigSource(validRaw()));

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    const config = result.config as PlatformConfig;
    expect(config.instanceId).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(config.httpPort).toBe(8080);
    // Optional values fall back to spec-aligned defaults.
    expect(config.signedUploadTtlSeconds).toBe(900);
    expect(config.rateLimitPerWindow).toBe(100);
    expect(config.rateLimitWindowSeconds).toBe(60);
  });

  it("coerces integral numeric strings for numeric fields", () => {
    const raw = { ...validRaw(), "http.port": "3000" };
    const result = validatePlatformConfig(objectConfigSource(raw));

    expect(result.valid).toBe(true);
    expect((result.config as PlatformConfig).httpPort).toBe(3000);
  });

  it("reports every missing required value, not just the first", () => {
    const result = validatePlatformConfig(objectConfigSource({}));

    expect(result.valid).toBe(false);
    const names = result.issues.map((i) => i.name);
    // All six required values are named.
    expect(names).toEqual([
      "instanceId",
      "database.url",
      "redis.url",
      "auth.jwtSecret",
      "http.port",
      "http.publicBaseUrl",
    ]);
    expect(result.issues.every((i) => i.kind === "missing")).toBe(true);
  });

  it("reports every invalid value in a single pass", () => {
    const raw = {
      instanceId: "not-a-uuid",
      "database.url": "mysql://localhost/db",
      "redis.url": "http://localhost",
      "auth.jwtSecret": "too-short",
      "http.port": 70000,
      "http.publicBaseUrl": "ftp://example.com",
    };
    const result = validatePlatformConfig(objectConfigSource(raw));

    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(6);
    expect(result.issues.every((i) => i.kind === "invalid")).toBe(true);
    expect(result.issues.map((i) => i.name)).toContain("http.port");
  });

  it("flags out-of-range optional values as invalid when provided", () => {
    const raw = {
      ...validRaw(),
      "storage.signedUploadTtlSeconds": 30, // below the 60s minimum
    };
    const result = validatePlatformConfig(objectConfigSource(raw));

    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.name)).toEqual([
      "storage.signedUploadTtlSeconds",
    ]);
    expect(result.issues[0].kind).toBe("invalid");
  });

  it("treats empty strings as absent for required values", () => {
    const raw = { ...validRaw(), "auth.jwtSecret": "" };
    const result = validatePlatformConfig(objectConfigSource(raw));

    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      name: "auth.jwtSecret",
      kind: "missing",
    });
  });
});

describe("loadPlatformConfig", () => {
  it("returns typed config when everything is valid", () => {
    const config = loadPlatformConfig(objectConfigSource(validRaw()));
    expect(config.databaseUrl).toBe(
      "postgres://user:pass@localhost:5432/streetstudio"
    );
  });

  it("throws a StartupConfigError naming every offending value", () => {
    let thrown: unknown;
    try {
      loadPlatformConfig(objectConfigSource({ "http.port": 999999 }));
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(StartupConfigError);
    expect(thrown).toBeInstanceOf(AppError);
    const error = thrown as StartupConfigError;
    expect(error.code).toBe("CONFIGURATION_INVALID");

    // Every missing/invalid value is named in the emitted error message.
    for (const issue of error.issues) {
      expect(error.message).toContain(issue.name);
    }
    // instanceId is missing and http.port is invalid — both must appear.
    expect(error.message).toContain("instanceId");
    expect(error.message).toContain("http.port");

    // The structured details carry the full list too.
    const details = error.details as { invalidValues: string[] };
    expect(details.invalidValues).toContain("instanceId");
    expect(details.invalidValues).toContain("http.port");
  });
});

describe("formatConfigIssues", () => {
  it("names each value with its kind and reason", () => {
    const message = formatConfigIssues([
      { name: "database.url", key: "database.url", kind: "missing", reason: "is required but was not provided" },
      { name: "http.port", key: "http.port", kind: "invalid", reason: "must be an integer between 1 and 65535" },
    ]);

    expect(message).toContain("database.url (missing");
    expect(message).toContain("http.port (invalid");
    expect(message).toContain("2 value(s)");
  });
});

describe("config sources", () => {
  it("streetConfigSource delegates to the StreetJS config interface", () => {
    const seen: string[] = [];
    const street = {
      get: (key: string) => {
        seen.push(key);
        return validRaw()[key];
      },
    };
    const config = loadPlatformConfig(streetConfigSource(street));

    expect(config.redisUrl).toBe("redis://localhost:6379");
    // The loader reads through the StreetJS interface for each schema key.
    expect(seen).toContain("database.url");
    expect(seen).toContain("http.publicBaseUrl");
  });

  it("objectConfigSource returns undefined for absent keys", () => {
    const source = objectConfigSource({ a: 1 });
    expect(source.get("a")).toBe(1);
    expect(source.get("missing")).toBeUndefined();
  });
});

describe("DEFAULT_CONFIG_SCHEMA", () => {
  it("marks exactly the six operator-supplied values as required", () => {
    const required = (Object.keys(DEFAULT_CONFIG_SCHEMA) as (keyof PlatformConfig)[])
      .filter((k) => DEFAULT_CONFIG_SCHEMA[k].required)
      .map((k) => DEFAULT_CONFIG_SCHEMA[k].name);

    expect(required).toEqual([
      "instanceId",
      "database.url",
      "redis.url",
      "auth.jwtSecret",
      "http.port",
      "http.publicBaseUrl",
    ]);
  });
});
