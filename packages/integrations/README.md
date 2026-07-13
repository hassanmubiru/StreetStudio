# @streetstudio/integrations

The integration framework for StreetStudio.

Integrations (Slack, Discord, Teams, GitHub, GitLab, Jira, Linear, Notion) are
delivered as plugins of `@streetstudio/plugins`. This package adds the typed
contract and registry that make the integration domain first-class over the
plugin system — with **no vendor code in core**.

## Public surface

- `IntegrationPlugin` — a `Plugin` narrowed to `type: "integration"` with
  `integration: { provider, category }` metadata.
- `IntegrationRegistry` — register / `has` / `get` / `list` / `ids` /
  `byCategory`; enforces unique ids and the integration type.
- `IntegrationCategory` — `"chat" | "issue_tracker" | "knowledge_base"`.
- `BUILT_IN_INTEGRATIONS` — catalog of the first-party integrations, with ids
  matching the `*_PLUGIN_ID` constants exported by the
  `@streetstudio/integration-*` packages.

## Dependencies

`@streetstudio/shared`, `@streetstudio/plugins`. Concrete integrations depend on
this framework (or the plugin system) — never the reverse — keeping platform
core vendor-neutral.
