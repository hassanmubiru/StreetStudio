# Architecture Decision Records (StreetStudio product repo)

Append-only records of significant architectural decisions for the standalone
StreetStudio product repository. Each states **status**, **context**,
**decision**, and **consequences**. When a decision is superseded, add a new
record and update the old one's status — never rewrite history.

Status values: `Proposed`, `Accepted`, `Superseded by ADR-NNNN`, `Deprecated`.

## Records

- [ADR-0001 — Consume StreetJS only through published public APIs](0001-consume-streetjs-public-only.md)
- [ADR-0002 — Domain-first architecture](0002-domain-first-architecture.md)
- [ADR-0003 — Vertical-slice delivery](0003-vertical-slice-delivery.md)

> These seed the new repo's ADR log. Carry forward the relevant reference-build
> ADRs (notably ADR-0011 promotion-first) during migration.
