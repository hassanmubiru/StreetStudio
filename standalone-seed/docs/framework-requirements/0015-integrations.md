# @streetjs/integrations — integration framework

- **Package:** `@streetjs/integrations`
- **Consumers (StreetStudio):** Slack, Discord, GitHub, GitLab, Jira, Linear, Notion, Teams integrations
- **Depends on:** `@streetjs/core`, `@streetjs/plugins`, `@streetjs/security` (credentials)
- **Wave:** 5 (extensibility)

## Motivation

StreetStudio connects to external providers through a consistent integration
framework (contract, registry, credential handling, outbound calls). The
framework is generic; each provider is a plugin.

## Required API surface

- Integration contract: metadata, required credentials/scopes, capability declarations.
- Registry to list/resolve available integrations.
- Secure credential storage/retrieval via `@streetjs/security`.
- Outbound request helper with retries/backoff and error normalization.
- Optional inbound webhook verification helper.

## Acceptance criteria

- [ ] Integrations register and are discoverable via the registry.
- [ ] Credentials are stored encrypted and never logged in plaintext.
- [ ] Outbound calls retry with backoff and surface normalized errors.
- [ ] A failing integration is isolated (does not affect others), per the plugin runtime.

## Non-goals

- No provider-specific business logic in the framework (each provider is its own plugin).
