import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { objectConfigSource, StartupConfigError } from "@streetstudio/config";
import { startApiService, type ActivateDependencies } from "./startup.js";

/**
 * Property 88: Startup validation names every invalid configuration value.
 *
 * Feature: streetstudio, Property 88: Startup validation names every invalid configuration value
 *
 * Validates: Requirements 30.3
 *
 * For any startup configuration with one or more required values missing or
 * invalid, startup is aborted, no requests are served, and every offending
 * configuration value is named in the emitted error.
 *
 * The property fuzzes the six required platform-config values independently —
 * each is either present-and-valid, present-but-invalid, or absent (omitted or
 * empty) — while forcing at least one offender per case. It then asserts that
 * {@link startApiService}:
 *   1. aborts by rejecting with a {@link StartupConfigError};
 *   2. never invokes dependency activation (no requests served);
 *   3. names exactly the set of offending values, both in the structured
 *      `issues` list and verbatim in the human-readable error message.
 */

/** Descriptor for one required configuration value and how to make it (in)valid. */
interface RequiredField {
  readonly name: string;
  readonly key: string;
  readonly valid: fc.Arbitrary<unknown>;
  readonly invalid: fc.Arbitrary<unknown>;
}

const REQUIRED_FIELDS: readonly RequiredField[] = [
  {
    name: "instanceId",
    key: "instanceId",
    valid: fc.constant("11111111-1111-1111-1111-111111111111"),
    // Non-empty strings that are not valid UUIDs.
    invalid: fc.constantFrom(
      "not-a-uuid",
      "123456",
      "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz",
      "11111111-1111-1111-1111",
    ),
  },
  {
    name: "database.url",
    key: "database.url",
    valid: fc.constantFrom(
      "postgres://user:pass@localhost:5432/streetstudio",
      "postgresql://localhost/db",
    ),
    // Non-empty strings that do not start with postgres:// or postgresql://.
    invalid: fc.constantFrom("http://db", "mysql://db", "not-a-url", "redis://db"),
  },
  {
    name: "redis.url",
    key: "redis.url",
    valid: fc.constantFrom("redis://localhost:6379", "rediss://localhost:6380"),
    // Non-empty strings that do not start with redis:// or rediss://.
    invalid: fc.constantFrom("http://r", "amqp://r", "not-a-url", "postgres://r"),
  },
  {
    name: "auth.jwtSecret",
    key: "auth.jwtSecret",
    valid: fc.string({ minLength: 32, maxLength: 48 }),
    // Present (non-empty) but shorter than the 32-char minimum.
    invalid: fc.string({ minLength: 1, maxLength: 31 }),
  },
  {
    name: "http.port",
    key: "http.port",
    valid: fc.integer({ min: 1, max: 65535 }),
    // Integers outside the 1..65535 range (still present, so "invalid" not "missing").
    invalid: fc.oneof(
      fc.integer({ min: -10000, max: 0 }),
      fc.integer({ min: 65536, max: 200000 }),
    ),
  },
  {
    name: "http.publicBaseUrl",
    key: "http.publicBaseUrl",
    valid: fc.constantFrom("https://studio.example.com", "http://localhost:8080"),
    // Non-empty strings that do not start with http:// or https://.
    invalid: fc.constantFrom("ftp://x", "not-a-url", "www.example.com"),
  },
];

type Disposition = "valid" | "invalid" | "missing";

interface Cell {
  readonly disposition: Disposition;
  readonly value: unknown;
}

/** Arbitrary for one field's disposition and (when present) its raw value. */
function cellArb(field: RequiredField): fc.Arbitrary<Cell> {
  return fc.oneof(
    field.valid.map((value) => ({ disposition: "valid" as const, value })),
    field.invalid.map((value) => ({ disposition: "invalid" as const, value })),
    fc.constant<Cell>({ disposition: "missing", value: undefined }),
  );
}

interface Scenario {
  readonly cells: readonly Cell[];
  /** Index of a field forced to be an offender so every case has ≥1 offender. */
  readonly forcedIndex: number;
  /** Whether the forced offender is missing or present-but-invalid. */
  readonly forcedKind: "invalid" | "missing";
  /** The forced offender's invalid value (used only when forcedKind === "invalid"). */
  readonly forcedInvalidValue: unknown;
  /** Represent "missing" as an omitted key (false) or an empty string (true). */
  readonly missingAsEmpty: boolean;
}

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    cells: fc.tuple(...REQUIRED_FIELDS.map(cellArb)),
    forcedIndex: fc.integer({ min: 0, max: REQUIRED_FIELDS.length - 1 }),
    forcedKind: fc.constantFrom<"invalid" | "missing">("invalid", "missing"),
    missingAsEmpty: fc.boolean(),
  })
  .chain((base) =>
    REQUIRED_FIELDS[base.forcedIndex]!.invalid.map((forcedInvalidValue) => ({
      ...base,
      forcedInvalidValue,
    })),
  );

/** Materialise a scenario into a config record and the set of offender names. */
function buildScenario(scenario: Scenario): {
  record: Record<string, unknown>;
  offenders: Set<string>;
} {
  const record: Record<string, unknown> = {};
  const offenders = new Set<string>();

  REQUIRED_FIELDS.forEach((field, index) => {
    let disposition = scenario.cells[index]!.disposition;
    let value = scenario.cells[index]!.value;

    // Force the chosen index to be an offender so at least one value is bad.
    if (index === scenario.forcedIndex) {
      disposition = scenario.forcedKind;
      value = scenario.forcedKind === "invalid" ? scenario.forcedInvalidValue : undefined;
    }

    switch (disposition) {
      case "valid":
        record[field.key] = value;
        break;
      case "invalid":
        record[field.key] = value;
        offenders.add(field.name);
        break;
      case "missing":
        // Absent values are undefined/null/empty string; exercise both an
        // omitted key and an explicit empty string.
        if (scenario.missingAsEmpty) {
          record[field.key] = "";
        }
        offenders.add(field.name);
        break;
    }
  });

  return { record, offenders };
}

describe("Feature: streetstudio, Property 88: Startup validation names every invalid configuration value", () => {
  it("aborts startup, serves no requests, and names every offending value (R30.3)", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const { record, offenders } = buildScenario(scenario);
        // Every generated scenario has at least one offender.
        expect(offenders.size).toBeGreaterThan(0);

        const activate: ActivateDependencies = vi.fn(async () => {});

        const error = await startApiService({
          configSource: objectConfigSource(record),
          activate,
        }).catch((e: unknown) => e);

        // 1. Startup aborts with a StartupConfigError.
        expect(error).toBeInstanceOf(StartupConfigError);
        const configError = error as StartupConfigError;

        // 2. No dependency activation occurred → no requests served.
        expect(activate).not.toHaveBeenCalled();

        // 3. The structured issue list names exactly the offending values...
        const named = new Set(configError.issues.map((issue) => issue.name));
        expect(named).toEqual(offenders);

        // ...and each offender is named verbatim in the emitted message.
        for (const name of offenders) {
          expect(configError.message).toContain(name);
        }
        expect(configError.code).toBe("CONFIGURATION_INVALID");
      }),
      { numRuns: 200 },
    );
  });
});
