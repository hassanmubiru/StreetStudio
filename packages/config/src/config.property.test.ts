import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  StartupConfigError,
  loadPlatformConfig,
  objectConfigSource,
  type PlatformConfig,
} from "./config.js";

/**
 * Property 88: Startup validation names every invalid configuration value.
 *
 * Feature: streetstudio, Property 88: Startup validation names every invalid
 * configuration value
 *
 * *For any* startup configuration with an arbitrary subset of required values
 * missing and/or invalid, startup validation aborts (throws
 * {@link StartupConfigError}) and the emitted error names EVERY offending
 * value — not just the first. When all required values are valid, startup
 * validation succeeds and produces a typed {@link PlatformConfig}.
 *
 * **Validates: Requirements 30.3**
 */

// ---------------------------------------------------------------------------
// The six operator-supplied required values, each with its dotted lookup key,
// reported name, and generators for valid / invalid raw values. Optional
// values are intentionally omitted here: they are never "offending" when
// absent (they fall back to defaults) and are covered by unit tests.
// ---------------------------------------------------------------------------

interface RequiredField {
  /** Lookup key used in the config source record. */
  readonly key: string;
  /** Name reported in the emitted error (equals key for these fields). */
  readonly name: string;
  /** Generator for a raw value the schema accepts. */
  readonly arbValid: fc.Arbitrary<unknown>;
  /** Generator for a raw value the schema rejects as invalid. */
  readonly arbInvalid: fc.Arbitrary<unknown>;
}

/** A syntactically valid UUID generator. */
const arbUuid: fc.Arbitrary<string> = fc.uuid();

/** Non-empty strings that are not valid UUIDs. */
const arbNotUuid: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter(
    (s) =>
      s.trim() !== "" &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );

/** A URL with one of the accepted schemes plus an arbitrary, non-empty tail. */
function arbUrlWithScheme(
  schemes: readonly string[]
): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.constantFrom(...schemes),
      fc.string({ minLength: 1, maxLength: 30 }).map((s) =>
        s.replace(/\s/g, "x")
      )
    )
    .map(([scheme, tail]) => `${scheme}${tail || "host"}`);
}

/**
 * A non-empty string that does NOT start with any of the accepted schemes,
 * so the URL field rejects it as invalid (but present).
 */
function arbUrlWrongScheme(
  schemes: readonly string[]
): fc.Arbitrary<string> {
  return fc
    .string({ minLength: 1, maxLength: 30 })
    .map((s) => (s.trim() === "" ? "bad" : s))
    .filter((s) => !schemes.some((scheme) => s.startsWith(scheme)));
}

const REQUIRED_FIELDS: readonly RequiredField[] = [
  {
    key: "instanceId",
    name: "instanceId",
    arbValid: arbUuid,
    arbInvalid: arbNotUuid,
  },
  {
    key: "database.url",
    name: "database.url",
    arbValid: arbUrlWithScheme(["postgres://", "postgresql://"]),
    arbInvalid: arbUrlWrongScheme(["postgres://", "postgresql://"]),
  },
  {
    key: "redis.url",
    name: "redis.url",
    arbValid: arbUrlWithScheme(["redis://", "rediss://"]),
    arbInvalid: arbUrlWrongScheme(["redis://", "rediss://"]),
  },
  {
    key: "auth.jwtSecret",
    name: "auth.jwtSecret",
    // >= 32 chars.
    arbValid: fc.string({ minLength: 32, maxLength: 80 }),
    // Present but shorter than 32 chars (and non-empty so it is "invalid",
    // not treated as absent/"missing").
    arbInvalid: fc.string({ minLength: 1, maxLength: 31 }),
  },
  {
    key: "http.port",
    name: "http.port",
    arbValid: fc.integer({ min: 1, max: 65535 }),
    // Present, non-empty, but out of range or non-integral.
    arbInvalid: fc.oneof(
      fc.integer({ min: 65536, max: 200000 }),
      fc.integer({ min: -100000, max: 0 }),
      fc.constantFrom("abc", "1.5", "not-a-port")
    ),
  },
  {
    key: "http.publicBaseUrl",
    name: "http.publicBaseUrl",
    arbValid: arbUrlWithScheme(["http://", "https://"]),
    arbInvalid: arbUrlWrongScheme(["http://", "https://"]),
  },
];

/** The state each required value takes in a generated configuration. */
type FieldState = "valid" | "missing" | "invalid";

const arbFieldState: fc.Arbitrary<FieldState> = fc.constantFrom(
  "valid",
  "missing",
  "invalid"
);

/**
 * Generate a full raw configuration record together with the set of names we
 * expect to be flagged as offending. A required value is offending when it is
 * missing or invalid.
 */
interface GeneratedConfig {
  readonly raw: Record<string, unknown>;
  readonly offending: readonly string[];
}

const arbConfig: fc.Arbitrary<GeneratedConfig> = fc
  .tuple(
    ...REQUIRED_FIELDS.map((field) =>
      arbFieldState.chain((state) => {
        switch (state) {
          case "valid":
            return field.arbValid.map((value) => ({ field, state, value }));
          case "invalid":
            return field.arbInvalid.map((value) => ({ field, state, value }));
          case "missing":
            // Encode "missing" as either an absent key or an empty string; the
            // loader treats both as absent. Randomize between the two.
            return fc
              .boolean()
              .map((omit) => ({ field, state, value: omit ? undefined : "" }));
        }
      })
    )
  )
  .map((entries) => {
    const raw: Record<string, unknown> = {};
    const offending: string[] = [];
    for (const { field, state, value } of entries) {
      // Only place a key when the value is not an "absent-by-omission" marker.
      if (!(state === "missing" && value === undefined)) {
        raw[field.key] = value;
      }
      if (state !== "valid") {
        offending.push(field.name);
      }
    }
    return { raw, offending };
  });

// ---------------------------------------------------------------------------
// Property 88
// ---------------------------------------------------------------------------
describe("Property 88: Startup validation names every invalid configuration value", () => {
  it("aborts naming every offending value, and succeeds only when all are valid", () => {
    fc.assert(
      fc.property(arbConfig, ({ raw, offending }) => {
        const source = objectConfigSource(raw);

        if (offending.length === 0) {
          // Every required value is valid: startup validation must succeed and
          // yield a typed configuration.
          const config: PlatformConfig = loadPlatformConfig(source);
          expect(typeof config.instanceId).toBe("string");
          expect(typeof config.httpPort).toBe("number");
          return;
        }

        // One or more required values are missing/invalid: startup must abort.
        let thrown: unknown;
        try {
          loadPlatformConfig(source);
        } catch (err) {
          thrown = err;
        }

        expect(thrown).toBeInstanceOf(StartupConfigError);
        const error = thrown as StartupConfigError;
        expect(error.code).toBe("CONFIGURATION_INVALID");

        // Every offending value is named in the emitted message — not just the
        // first. The set of reported issue names equals the offending set.
        const reported = new Set(error.issues.map((issue) => issue.name));
        for (const name of offending) {
          expect(reported.has(name)).toBe(true);
          expect(error.message).toContain(name);
        }
        expect(reported.size).toBe(offending.length);

        // The structured details carry the complete list too.
        const details = error.details as { invalidValues: string[] };
        for (const name of offending) {
          expect(details.invalidValues).toContain(name);
        }
      }),
      { numRuns: 200 }
    );
  });
});
