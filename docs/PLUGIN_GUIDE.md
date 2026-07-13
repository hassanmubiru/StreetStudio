# Plugin Guide

StreetStudio is plugin-first: storage providers, AI capabilities, integrations,
and billing are all delivered as plugins with **no hardcoded vendors** in
platform core (Requirements 21, 22, 27). This guide explains the plugin model,
the contracts a plugin implements, isolation guarantees, and how to build one.

## Why plugins

Platform core must not reference any specific AI or billing vendor. A build-time
boundary check (`DISALLOWED_AI_VENDOR`) fails the build if core code imports or
references a specific vendor implementation. Vendors therefore live behind
plugin contracts, keeping core vendor-neutral and letting operators choose their
own providers. See [ARCHITECTURE](./ARCHITECTURE.md) and
[DECISIONS](./DECISIONS.md) ADR-0001.

## Plugin_Manager (`packages/plugins`)

The Plugin_Manager loads, registers, activates, and isolates plugins through the
StreetJS plugin-loading interface.

- **Isolation** — plugins run in an isolated context with **no write access to
  core code**. Attempts to modify core are denied and recorded (R21.6, R21.7).
- **Load failure** — a plugin that fails to load is recorded and excluded; other
  plugins continue to load and run (R21.5).
- **Activation failure** — a failed activation leaves the plugin deactivated
  with its prior registration state intact (R21.3), so a bad activation never
  corrupts existing state.

## Plugin categories

### Storage providers (`packages/media` interface)

All media persistence flows through the Storage_Provider interface (R9.1).
Providers for Local, S3, R2, Azure Blob, GCS, and MinIO ship as plugins (R9.2).
Activating a provider validates its configuration and runs a connectivity check;
on failure the activation is rejected and the prior provider is retained
(`STORAGE_CONFIG_INVALID`, R9.4). A conforming provider must guarantee a byte-
exact round-trip (R9.1) and support signed upload targets bounded to ≤ 15
minutes for direct-to-storage credentials (R9.6, R29.3).

### AI capabilities (AI capability router)

AI features — transcription, summarization, and similar — are routed through the
AI capability router, which selects an available AI plugin. When no provider is
available for a capability, the request returns `AI_UNAVAILABLE` (503) and
non-AI features continue unaffected (R22.3, R22.5). Core never imports a
specific AI vendor.

### Integrations

Integration plugins connect StreetStudio to external tools. Supported
integrations include Slack, Discord, GitHub, GitLab, Jira, Linear, Microsoft
Teams, and Notion (R21.8).

### Billing

Billing is abstracted behind a plugin contract with no hardcoded provider. When
billing is not configured, billing-dependent operations return
`BILLING_NOT_CONFIGURED` (503) and the rest of the platform continues to
function (R27.3, R27.5).

## Plugin contract

A plugin declares its identity and capability and implements the lifecycle hooks
the Plugin_Manager invokes. The conceptual shape:

```typescript
interface Plugin {
  readonly id: string;                 // stable unique identifier
  readonly kind: "storage" | "ai" | "integration" | "billing";
  register(ctx: PluginContext): void;  // declare what the plugin provides
  activate(ctx: PluginContext): Promise<void>;   // validate config + connectivity
  deactivate(): Promise<void>;
}
```

- `register` declares the capability the plugin provides; it must not perform
  side effects on core state.
- `activate` validates configuration and performs any connectivity check. Throw
  to reject activation — the manager keeps the plugin deactivated with prior
  registration intact.
- The `PluginContext` grants read access to the capabilities a plugin needs and
  denies write access to core.

## Building a plugin

1. Create a package (or module) that implements the appropriate contract for its
   `kind`. Keep vendor SDK imports inside the plugin — never in platform core.
2. Implement `register` and `activate`. For storage, implement the byte-exact
   round-trip and signed-target behavior. For AI, implement the capability the
   router expects and fail cleanly so the router can fall back to
   `AI_UNAVAILABLE`.
3. Validate configuration in `activate` and reject on missing/invalid values so
   activation failures never leave partial state.
4. Register the plugin with the Plugin_Manager so it is discovered at load time.

## Isolation and safety guarantees

- No plugin can write to core code; violations are denied and recorded.
- A failed plugin (load or activation) never takes down the platform or other
  plugins.
- The AI/billing vendor boundary check keeps vendor code out of core at build
  time.

See [SECURITY](./SECURITY.md) for the platform-wide security model and
[MEDIA_PIPELINE](./MEDIA_PIPELINE.md) for how storage and AI plugins participate
in the media path.
