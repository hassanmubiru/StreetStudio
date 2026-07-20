# @streetjs/config — typed configuration loading & startup validation

- **Package:** `@streetjs/config`
- **Consumers (StreetStudio):** every app/package that reads configuration
- **Depends on:** `@streetjs/core`
- **Wave:** 1 (kernel)

## Motivation

StreetStudio must load configuration from the environment and validate it at
startup, aborting with a message that names every invalid value. This is generic
platform behavior, not product logic.

## Required API surface

- `defineConfig(schema)` — declare a typed schema (types, required/optional, defaults, constraints).
- `loadConfig(schema, source?)` — load + validate from env/file; returns a fully typed config object.
- `ConfigModule` — provides the resolved config to the DI container.
- Validation error type listing **all** offending keys with reasons (not just the first).
- Secret-aware fields (never logged in plaintext; integrates with `@streetjs/security`).

## Acceptance criteria

- [ ] Invalid/missing required values cause `loadConfig` to throw before the app starts.
- [ ] The thrown error enumerates every invalid key and why (aggregated, not fail-on-first).
- [ ] Valid config resolves to a strongly typed object; unknown keys are rejected or reported.
- [ ] Defaults apply only when a value is absent; provided values always win.
- [ ] Secret fields are redacted in any diagnostic output.

## Non-goals

- No runtime reconfiguration/hot-reload in v1 (can be a later capability).
