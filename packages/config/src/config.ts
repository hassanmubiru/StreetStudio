/**
 * Configuration schema, loading, and startup validation (Requirement 30.3).
 *
 * The platform loads its configuration through the StreetJS configuration
 * interface, which is consumed exclusively via the `@streetjs/core` public
 * package entry point by the composition root (`apps/api`). To keep this
 * package free of a hard dependency on the optional `@streetjs/core` peer, the
 * loader is written against a minimal structural {@link ConfigSource}. The
 * composition root adapts the concrete StreetJS config object into a
 * {@link ConfigSource} with {@link streetConfigSource}.
 *
 * Startup validation collects EVERY missing or invalid required value in a
 * single pass and, when any are found, aborts by throwing a
 * {@link StartupConfigError} whose message names every offending value. It
 * never fails on the first problem — an operator sees the complete list of
 * what must be fixed (Requirement 30.3). The error reuses the shared
 * `CONFIGURATION_INVALID` code from the StreetStudio error taxonomy.
 */
import { AppError, type Uuid } from "@streetstudio/shared";

/**
 * The validated platform configuration produced by {@link loadPlatformConfig}.
 *
 * Required values must be supplied by the operator; optional values fall back
 * to secure, spec-aligned defaults when absent.
 */
export interface PlatformConfig {
  /** Stable identifier for this API_Service instance. */
  readonly instanceId: Uuid;
  /** PostgreSQL connection string (StreetJS PostgreSQL access). */
  readonly databaseUrl: string;
  /** Redis connection string (StreetJS Redis access + backplane). */
  readonly redisUrl: string;
  /** Secret used to sign/verify JWT access tokens (>= 32 chars). */
  readonly jwtSecret: string;
  /** TCP port the HTTP server binds to (1..65535). */
  readonly httpPort: number;
  /** Public base URL the service is reachable at (http/https). */
  readonly publicBaseUrl: string;
  /**
   * Validity window for signed upload targets, in seconds. Bounded to
   * 60..3600, defaulting to 900 (Requirements 9.6, 29.3).
   */
  readonly signedUploadTtlSeconds: number;
  /** Requests allowed per rate-limit window per client (default 100, R29.1). */
  readonly rateLimitPerWindow: number;
  /** Length of the rate-limit rolling window in seconds (default 60, R29.1). */
  readonly rateLimitWindowSeconds: number;
}

/**
 * Minimal structural view of a configuration source. This mirrors the shape of
 * the StreetJS configuration interface so the loader can read values without
 * importing `@streetjs/core` directly.
 */
export interface ConfigSource {
  /** Return the raw value for `key`, or `undefined` when it is not set. */
  get(key: string): unknown;
}

/**
 * The subset of the StreetJS configuration interface this package relies on.
 * The concrete object is obtained by the composition root through the
 * `@streetjs/core` public entry point and adapted with
 * {@link streetConfigSource}.
 */
export interface StreetConfigInterface {
  get(key: string): unknown;
}

/** Adapt a StreetJS configuration object into a {@link ConfigSource}. */
export function streetConfigSource(config: StreetConfigInterface): ConfigSource {
  return { get: (key: string): unknown => config.get(key) };
}

/**
 * Build a {@link ConfigSource} from a flat record keyed by the same dotted keys
 * the schema uses. Useful for tests and for non-StreetJS hosts.
 */
export function objectConfigSource(
  record: Readonly<Record<string, unknown>>
): ConfigSource {
  return {
    get: (key: string): unknown =>
      Object.prototype.hasOwnProperty.call(record, key)
        ? record[key]
        : undefined,
  };
}

/** Outcome of parsing/validating a single raw value into a typed field. */
export type ConfigFieldResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

/** Declarative descriptor for one configuration value. */
export interface ConfigField<T> {
  /** Lookup key used against the {@link ConfigSource}. */
  readonly key: string;
  /** Human-readable name reported in validation errors. */
  readonly name: string;
  /** Whether the operator must supply this value. */
  readonly required: boolean;
  /** Default applied when an optional value is absent. */
  readonly defaultValue?: T;
  /** Parse/validate a present raw value. */
  readonly parse: (raw: unknown) => ConfigFieldResult<T>;
}

/** A schema is one {@link ConfigField} per key of the target config shape. */
export type ConfigSchema<T> = {
  readonly [K in keyof T]: ConfigField<T[K]>;
};

/** Why a configuration value failed validation. */
export type ConfigIssueKind = "missing" | "invalid";

/** A single validation problem, naming the offending value. */
export interface ConfigIssue {
  /** Human-readable name of the value (as named in the emitted error). */
  readonly name: string;
  /** Lookup key of the value in the configuration source. */
  readonly key: string;
  /** Whether the value was absent or present-but-invalid. */
  readonly kind: ConfigIssueKind;
  /** Non-disclosing explanation of the requirement that was not met. */
  readonly reason: string;
}

/** Result of validating a configuration source against a schema. */
export interface ConfigValidationResult<T> {
  /** True when there are no issues. */
  readonly valid: boolean;
  /** The fully-typed config when {@link valid} is true; otherwise `undefined`. */
  readonly config?: T;
  /** Every missing/invalid value found, in schema order. */
  readonly issues: readonly ConfigIssue[];
}

/** A raw value is considered absent when it is null/undefined or an empty string. */
function isAbsent(raw: unknown): boolean {
  return raw === undefined || raw === null || raw === "";
}

/**
 * Validate a configuration source against a schema, collecting EVERY missing or
 * invalid value rather than stopping at the first. Returns the typed config
 * when there are no issues.
 */
export function validateConfig<T>(
  source: ConfigSource,
  schema: ConfigSchema<T>
): ConfigValidationResult<T> {
  const issues: ConfigIssue[] = [];
  const assembled: Record<string, unknown> = {};

  // Iterate in schema declaration order for stable, predictable reporting.
  for (const key of Object.keys(schema) as (keyof T)[]) {
    const field = schema[key];
    const raw = source.get(field.key);

    if (isAbsent(raw)) {
      if (field.required) {
        issues.push({
          name: field.name,
          key: field.key,
          kind: "missing",
          reason: "is required but was not provided",
        });
      } else {
        assembled[key as string] = field.defaultValue;
      }
      continue;
    }

    const result = field.parse(raw);
    if (result.ok) {
      assembled[key as string] = result.value;
    } else {
      issues.push({
        name: field.name,
        key: field.key,
        kind: "invalid",
        reason: result.reason,
      });
    }
  }

  if (issues.length > 0) {
    return { valid: false, issues };
  }
  return { valid: true, config: assembled as T, issues: [] };
}

/**
 * Compose a startup error message that names every missing/invalid value.
 * Reasons are generic and never echo the offending value, so the message is
 * safe to log without leaking secrets.
 */
export function formatConfigIssues(issues: readonly ConfigIssue[]): string {
  const parts = issues.map((issue) =>
    issue.kind === "missing"
      ? `${issue.name} (missing: ${issue.reason})`
      : `${issue.name} (invalid: ${issue.reason})`
  );
  return `Configuration validation failed for ${issues.length} value(s): ${parts.join(
    ", "
  )}.`;
}

/**
 * Raised when startup configuration validation fails. Carries the shared
 * `CONFIGURATION_INVALID` code and a message naming every offending value so
 * the operator can fix them all at once (Requirement 30.3). The complete,
 * structured issue list is available on {@link issues} and in the serialized
 * `details.issues`.
 */
export class StartupConfigError extends AppError {
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    super("CONFIGURATION_INVALID", {
      details: {
        invalidValues: issues.map((issue) => issue.name),
        issues: issues.map((issue) => ({ ...issue })),
      },
    });
    this.name = "StartupConfigError";
    this.issues = issues;
    // Override the generic catalog message with one that names every value.
    // This error aborts startup and is only ever surfaced to the operator, so
    // naming the offending values (never their contents) is safe.
    this.message = formatConfigIssues(issues);
    Object.setPrototypeOf(this, StartupConfigError.prototype);
  }
}

/**
 * Load and validate configuration against a schema, aborting on any problem.
 *
 * On success, returns the fully-typed configuration. On failure, throws a
 * {@link StartupConfigError} naming every missing or invalid value — the caller
 * (the API_Service composition root) must refrain from serving requests
 * (Requirement 30.3).
 */
export function loadConfig<T>(
  source: ConfigSource,
  schema: ConfigSchema<T>
): T {
  const result = validateConfig(source, schema);
  if (!result.valid || result.config === undefined) {
    throw new StartupConfigError(result.issues);
  }
  return result.config;
}

// --- field validators -------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asString(raw: unknown): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

/** Coerce a raw value to an integer, accepting integral numbers or numeric strings. */
function asInteger(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isInteger(raw)) {
    return raw;
  }
  if (typeof raw === "string" && /^-?\d+$/.test(raw.trim())) {
    return Number.parseInt(raw.trim(), 10);
  }
  return undefined;
}

function uuidField(config: {
  key: string;
  name: string;
}): ConfigField<string> {
  return {
    ...config,
    required: true,
    parse: (raw) => {
      const value = asString(raw);
      if (value !== undefined && UUID_RE.test(value)) {
        return { ok: true, value };
      }
      return { ok: false, reason: "must be a valid UUID" };
    },
  };
}

function urlField(config: {
  key: string;
  name: string;
  schemes: readonly string[];
}): ConfigField<string> {
  const { schemes, ...rest } = config;
  return {
    ...rest,
    required: true,
    parse: (raw) => {
      const value = asString(raw);
      if (value !== undefined && schemes.some((s) => value.startsWith(s))) {
        return { ok: true, value };
      }
      return {
        ok: false,
        reason: `must be a URL starting with ${schemes.join(" or ")}`,
      };
    },
  };
}

function secretField(config: {
  key: string;
  name: string;
  minLength: number;
}): ConfigField<string> {
  const { minLength, ...rest } = config;
  return {
    ...rest,
    required: true,
    parse: (raw) => {
      const value = asString(raw);
      if (value !== undefined && value.length >= minLength) {
        return { ok: true, value };
      }
      return {
        ok: false,
        reason: `must be at least ${minLength} characters`,
      };
    },
  };
}

function intRangeField(config: {
  key: string;
  name: string;
  min: number;
  max: number;
  required: boolean;
  defaultValue?: number;
}): ConfigField<number> {
  const { min, max, ...rest } = config;
  return {
    ...rest,
    parse: (raw) => {
      const value = asInteger(raw);
      if (value !== undefined && value >= min && value <= max) {
        return { ok: true, value };
      }
      return {
        ok: false,
        reason: `must be an integer between ${min} and ${max}`,
      };
    },
  };
}

/**
 * The default platform configuration schema. Required values must be provided
 * by the operator; optional values carry secure, spec-aligned defaults.
 */
export const DEFAULT_CONFIG_SCHEMA: ConfigSchema<PlatformConfig> = {
  instanceId: uuidField({ key: "instanceId", name: "instanceId" }),
  databaseUrl: urlField({
    key: "database.url",
    name: "database.url",
    schemes: ["postgres://", "postgresql://"],
  }),
  redisUrl: urlField({
    key: "redis.url",
    name: "redis.url",
    schemes: ["redis://", "rediss://"],
  }),
  jwtSecret: secretField({
    key: "auth.jwtSecret",
    name: "auth.jwtSecret",
    minLength: 32,
  }),
  httpPort: intRangeField({
    key: "http.port",
    name: "http.port",
    min: 1,
    max: 65535,
    required: true,
  }),
  publicBaseUrl: urlField({
    key: "http.publicBaseUrl",
    name: "http.publicBaseUrl",
    schemes: ["http://", "https://"],
  }),
  signedUploadTtlSeconds: intRangeField({
    key: "storage.signedUploadTtlSeconds",
    name: "storage.signedUploadTtlSeconds",
    min: 60,
    max: 3600,
    required: false,
    defaultValue: 900,
  }),
  rateLimitPerWindow: intRangeField({
    key: "rateLimit.perWindow",
    name: "rateLimit.perWindow",
    min: 1,
    max: 1_000_000,
    required: false,
    defaultValue: 100,
  }),
  rateLimitWindowSeconds: intRangeField({
    key: "rateLimit.windowSeconds",
    name: "rateLimit.windowSeconds",
    min: 1,
    max: 86_400,
    required: false,
    defaultValue: 60,
  }),
};

/**
 * Validate a source against the default platform schema without throwing,
 * returning every missing/invalid value. Useful for health/diagnostics.
 */
export function validatePlatformConfig(
  source: ConfigSource
): ConfigValidationResult<PlatformConfig> {
  return validateConfig(source, DEFAULT_CONFIG_SCHEMA);
}

/**
 * Load and validate the platform configuration from a {@link ConfigSource},
 * aborting startup (by throwing {@link StartupConfigError}) when any required
 * value is missing or invalid, with every offending value named in the error
 * (Requirement 30.3).
 */
export function loadPlatformConfig(source: ConfigSource): PlatformConfig {
  return loadConfig(source, DEFAULT_CONFIG_SCHEMA);
}
