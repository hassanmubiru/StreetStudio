# ADR-0002: Domain-first architecture

- **Status:** Accepted

## Context

A flagship reference application must read as an intentionally designed product,
not a technology-layered scaffold. Organizing by technical layer (`controllers/`,
`services/`, `models/`) scatters business rules and obscures each module's
purpose.

## Decision

Organize by **business domain**. Each domain is its own package
(`recordings`, `reviews`, `sharing`, `projects`, `organizations`, `comments`,
`notifications`, `search`, `analytics`, `billing`, `knowledge`) and owns its API
surface, application/use-case logic, rich domain model, persistence, events, and
tests. Each package's `README.md` answers: why it exists, what problem it solves,
what it exposes publicly, and what it depends on. Business rules live on domain
objects (e.g. `Recording.publish()`, `canEdit()`), not in the API layer. The
public surface is `index.ts` only; cross-domain access goes through published
surfaces, never deep imports.

## Consequences

- Clear ownership and testability per domain; rules are centralized.
- The API expresses feature-oriented use cases, not generic CRUD.
- Product vocabulary (`Recording`, `Review`, `Share`) stays out of framework
  plumbing terms; framework names remain inside `@streetjs/*`.
- Mis-scoped packages are visible (their README can't answer the four questions)
  and get reorganized.
