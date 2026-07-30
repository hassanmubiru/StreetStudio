/**
 * `process.env`-backed {@link ConfigSource}.
 *
 * `@streetstudio/config` validates configuration against DOTTED keys
 * (`instanceId`, `database.url`, `auth.jwtSecret`, ...). Operators supply values
 * through conventional environment variables, so this source maps each dotted
 * schema key to its `SCREAMING_SNAKE_CASE` environment variable. Keys absent
 * from the map (e.g. optional `storage.signedUploadTtlSeconds`,
 * `rateLimit.perWindow`) return `undefined` so the schema's secure defaults
 * apply.
 */
import type { ConfigSource } from "@streetstudio/config";

/** Dotted schema key → environment variable name. */
const KEY_TO_ENV: Readonly<Record<string, string>> = {
  instanceId: "INSTANCE_ID",
  "database.url": "DATABASE_URL",
  "redis.url": "REDIS_URL",
  "auth.jwtSecret": "AUTH_JWT_SECRET",
  "http.port": "HTTP_PORT",
  "http.publicBaseUrl": "HTTP_PUBLIC_BASE_URL",
};

/**
 * Build a {@link ConfigSource} that reads dotted schema keys from `env`
 * (defaults to `process.env`).
 */
export function envConfigSource(
  env: NodeJS.ProcessEnv = process.env,
): ConfigSource {
  return {
    get(key: string): unknown {
      const envKey = KEY_TO_ENV[key];
      if (envKey === undefined) {
        return undefined;
      }
      return env[envKey];
    },
  };
}
