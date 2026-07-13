# Architecture Decision Records

This file records the significant architectural decisions made for StreetStudio
(Requirement 31.2). Each record states the **title**, **status**, **context**
that motivated the decision, the **decision** made, and the resulting
**consequences**. Records are append-only; when a decision is superseded, add a
new record and update the status of the old one rather than rewriting history.

Status values: `Proposed`, `Accepted`, `Superseded by ADR-NNNN`, `Deprecated`.

---

## ADR-0001: Adapter-seam boundary policy for StreetJS

- **Status:** Accepted
- **Context:** StreetStudio is the flagship application on the StreetJS
  framework, but the two must remain independent repositories. Coupling to
  StreetJS internals — or vendoring StreetJS source — would make StreetStudio
  fragile to framework changes and violate Requirement 1 (repository
  independence).
- **Decision:** Treat StreetJS as a black box consumed **only** through its
  public package entry points, declared as published-version/local-link
  dependencies in package manifests. No StreetJS source lives in this repo, and
  no import may resolve to a StreetJS internal module or a filesystem path inside
  the StreetJS repository. A build-time boundary check enforces this and fails
  the build with `DISALLOWED_STREETJS_IMPORT` on violation. The same mechanism
  enforces an **AI/billing vendor boundary** (`DISALLOWED_AI_VENDOR`): platform
  core may not reference a specific vendor.
- **Consequences:** StreetStudio and StreetJS evolve independently. Missing
  framework capabilities are implemented inside StreetStudio packages (never by
  patching StreetJS) and recorded in the StreetJS gap register in the
  [README](../README.md) with an external issue reference. Vendor code is
  confined to plugins. The boundary check adds a required CI gate
  (`npm run boundary:check`).

---

## ADR-0002: Deny-by-default RBAC scoped per organization

- **Status:** Accepted
- **Context:** StreetStudio is multi-tenant. Members belong to organizations via
  roles, and no data may leak across organizations. An allow-by-default or
  ambient-permission model would risk cross-tenant exposure and make
  authorization hard to reason about.
- **Decision:** Every authenticated read/modify request is evaluated by the RBAC
  evaluator against the requesting Member's Role permissions **in the owning
  Organization's scope** before the action runs. Access is denied unless a Role
  explicitly grants the required action. Roles never cross organization
  boundaries. On denial the request performs no state change, returns
  `AUTHORIZATION_DENIED`, and an audit entry is appended.
- **Consequences:** Authorization is uniform and predictable; adding a new
  capability means adding an RBAC action string to the operation catalog. The
  same policy applies regardless of channel (Web_Client, SDK, direct API), which
  is what makes API↔UI parity safe (see ADR-0003). Every mutating operation must
  declare its required action.

---

## ADR-0003: Catalog-as-source-of-truth for API/SDK parity

- **Status:** Accepted
- **Context:** Requirement 20 demands full UI/API parity: no Web_Client
  capability may be reachable only through the Web_Client, and the SDK must
  cover the whole public surface. Expressing this across scattered controllers
  and a hand-written SDK would let the surfaces drift.
- **Decision:** Maintain a single public operation catalog,
  `apps/api/src/http/operations.ts` (`PUBLIC_OPERATIONS`), that names every
  public capability with its channel, method/path, and authorization policy. The
  SDK mirrors the catalog one-for-one, and a contract test diffs the two
  surfaces. The API reference ([API.md](./API.md)) is generated/maintained from
  the same catalog.
- **Consequences:** Parity is expressed as data and checked mechanically, not by
  convention. Adding, removing, or changing a public endpoint requires updating
  the catalog, which flows to the SDK, the parity test, and the API docs (R31.4).
  The catalog also encodes the public (no-auth) allow-list consumed by
  [SECURITY.md](./SECURITY.md) and [API.md](./API.md) (R29.5).

---

## ADR-0004: Bounded-retry resilience for unreliable operations

- **Status:** Accepted
- **Context:** Several operations touch unreliable resources — offline recording
  uploads, chunk transfers, media processing, and outbound webhook deliveries.
  Unbounded retries risk resource exhaustion, duplicate side effects, and
  indefinite hangs; no retries make transient failures fatal.
- **Decision:** Apply explicit, bounded retry limits per operation, using the
  StreetJS resilience interfaces where applicable:
  - Offline recording uploads: at most **5** retries (R6.11).
  - Upload chunk integrity failures: at most **3** retransmissions, then abort
    the session and discard partial chunks (R7.4, R7.5).
  - Media processing: at most **3** retries; on exhaustion record failure,
    **retain the original source**, and emit a failure event (R8.6).
  - Webhook delivery: 10s response timeout, then at most **5** additional
    retries with non-decreasing (exponential) backoff before recording the
    delivery as failed (R19.5, R19.6).
- **Consequences:** Failure modes are predictable and observable; each bound is
  covered by a property-based test asserting the cap is never exceeded. Sources
  and prior state are preserved on exhaustion, so no data is lost. See
  [MEDIA_PIPELINE.md](./MEDIA_PIPELINE.md).

---

## ADR-0005: Single shared error taxonomy across all surfaces

- **Status:** Accepted
- **Context:** The REST API, the WebSocket gateway, and the SDK must present
  uniform, non-disclosing error behavior (R2.4, R29). Divergent error shapes or
  messages that leak internal state would harm both DX and security.
- **Decision:** Define one error taxonomy in `packages/shared/src/errors.ts`:
  stable machine-readable `code`s, a `category`, an HTTP `status`, and a
  deliberately generic `message`. All surfaces serialize the same `ErrorDto`.
  Sensitive `cause` data is retained for server-side logging only and is never
  serialized. Rate-limit errors carry `retryAfterSeconds`.
- **Consequences:** Clients can branch on stable codes that never change once
  published. Error handling is consistent and safe by construction. New error
  conditions must be added to the catalog rather than invented ad hoc, and the
  taxonomy is documented in [API.md](./API.md).
