# @streetjs/plugins — plugin runtime (dynamic load, isolation, lifecycle)

- **Package:** `@streetjs/plugins`
- **Consumers (StreetStudio):** storage providers, AI providers, billing, integrations
- **Depends on:** `@streetjs/core`, `@streetjs/config`
- **Wave:** 5 (extensibility)

## Motivation

StreetStudio delivers storage/AI/billing/integrations as plugins and must not
build its own plugin runtime. Dynamic loading, isolation, and lifecycle are
generic platform infrastructure.

## Required API surface

- Plugin contract: manifest (id, version, capabilities), `activate`/`deactivate` lifecycle.
- Dynamic load/register with version-compatibility checks.
- Isolation: a failing plugin cannot crash the host or other plugins.
- Per-plugin configuration validation (via `@streetjs/config` schemas).
- Capability registry so the host resolves providers by capability.

## Acceptance criteria

- [ ] Plugins load, activate, and deactivate through a defined lifecycle.
- [ ] An activation/load failure is isolated: prior state is preserved and other plugins keep working.
- [ ] Incompatible plugin versions are rejected with a clear diagnostic.
- [ ] Invalid plugin configuration fails validation before activation.

## Non-goals

- No specific provider implementations (those are separate plugins); no billing policy.
