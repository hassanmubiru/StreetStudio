# ADR-0001: Consume StreetJS only through published public APIs

- **Status:** Accepted

## Context

StreetStudio is the flagship application built on StreetJS, but the two are
independent repositories. Coupling to framework internals — or vendoring StreetJS
source — would make StreetStudio fragile and blur the framework/product boundary.
StreetStudio must reimplement no infrastructure (HTTP, DI, auth, RBAC, database,
storage, cache, queue, events, realtime, plugins, config, scheduler, metrics,
health).

## Decision

Depend only on the **public API of published `@streetjs/* packages`**, declared as
registry-versioned dependencies. Never import framework internals or reference the
StreetJS repository by path. The dependency arrow is strictly one-way
(StreetStudio → StreetJS). If a required capability is missing, it is added to
StreetJS, published, then consumed here — never reimplemented in the product
(promotion-first). Enforced by `graph:check`, `boundary:check`, and
`streetjs:check` as required CI gates.

## Consequences

- StreetStudio and StreetJS evolve independently; upgrades are versioned.
- Missing capabilities become framework requirements (see
  `../framework-requirements/`), not product code.
- A blocked feature is recorded in the dependency register and paused, not faked.
