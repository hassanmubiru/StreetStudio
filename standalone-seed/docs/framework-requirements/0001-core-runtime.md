# @streetjs/core + @streetjs/runtime — application container, DI, module lifecycle

- **Packages:** `@streetjs/core`, `@streetjs/runtime`
- **Consumers (StreetStudio):** every app (`apps/api`) and package; the composition root
- **Depends on:** none (kernel)
- **Wave:** 1 (kernel)

## Motivation

StreetStudio composes framework modules into an application and injects framework
services into product services. It needs a dependency-injection container and a
module lifecycle so it never hand-rolls its own DI or bootstrapping. This is
generic to any StreetJS app.

## Required API surface

- `Application` — composition root: `use(module)`, `get(token)`, `start()`, `stop()`.
- `Module` / `defineModule(...)` — declares providers and their lifecycle.
- Provider registration: class/factory/value providers, singleton + scoped lifetimes.
- Injection tokens (typed) and constructor injection.
- Lifecycle hooks: `onInit`, `onStart`, `onStop`/`onShutdown` with ordered teardown.
- Typed error base compatible with `@streetjs/security` error taxonomy.

## Acceptance criteria

- [ ] An `Application` resolves a provider graph deterministically and detects cycles.
- [ ] `start()`/`stop()` invoke lifecycle hooks in dependency order (reverse on stop).
- [ ] Scoped providers yield a fresh instance per scope (e.g. per request) and are disposed with the scope.
- [ ] Missing/duplicate provider registration fails fast with a clear diagnostic.
- [ ] Fully typed: resolving a token returns its declared type with no `any`.

## Non-goals

- No HTTP, persistence, or transport concerns (those are separate packages).
