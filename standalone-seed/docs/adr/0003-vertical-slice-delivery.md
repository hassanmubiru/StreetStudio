# ADR-0003: Vertical-slice delivery

- **Status:** Accepted

## Context

Empty packages and "for later" scaffolds make a codebase look generated and hide
whether anything actually works. Broad horizontal layers (all models, then all
services, then all endpoints) defer proof of end-to-end correctness.

## Decision

Deliver in **complete vertical slices**. A slice spans domain → persistence →
API → SDK → tests and must be functional end-to-end before the next begins.
Delivery order: Recordings, Uploads, Playback, Review comments, Sharing,
Workspaces, Search, Notifications. A slice may be **gated** on a `@streetjs/*`
package; if so, the dependency is recorded and the slice paused — no placeholder
implementation is written. Each slice meets the definition of done in
`../ENGINEERING_PRINCIPLES.md` (real persistence, feature-oriented use cases,
SDK/contract parity, tests, all gates green, no fakes).

## Consequences

- Every merged slice is demonstrably working, not a stub.
- Progress is honest and measurable slice by slice.
- Dependencies on unpublished framework packages surface early and explicitly,
  rather than being papered over with mocks.
