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

---

## ADR-0006: Desktop client runtime — Tauri over Electron (provisional)

- **Status:** Proposed
- **Context:** The Desktop_Client (`apps/desktop`) wraps the web client and adds
  native capture (screen/window/region, system audio, global shortcuts). The
  brief explicitly requires that Electron not be assumed by default and that the
  runtime choice be justified on performance, security, maintenance, and
  platform support.
- **Decision:** Adopt **Tauri** as the provisional desktop runtime, pending a
  capture-capability spike (below). Rationale:
  - **Performance / footprint:** Tauri uses the OS WebView (WebView2 / WKWebView
    / WebKitGTK) and a Rust core, yielding much smaller binaries and lower memory
    than bundling Chromium + Node with Electron.
  - **Security:** Tauri's capability/allowlist model and Rust core present a
    smaller, more constrained attack surface; the web layer has no ambient Node
    access by default.
  - **Maintenance:** A thin native shell keeps most logic in the shared web/SDK
    packages; the Rust surface is limited to capture and OS integration.
  - **Platform support:** Windows/macOS/Linux are covered. The main risk is
    WebView engine variance across platforms.
- **Trade-offs / risks:** Electron offers a single bundled Chromium (uniform
  rendering, mature `desktopCapturer`/screen APIs) and a larger ecosystem, at the
  cost of size, memory, and a broader attack surface. Tauri's chief risk is the
  maturity/uniformity of **native capture** (system audio, per-monitor/region
  capture, global hotkeys) across WebView engines — this must be validated.
- **Consequences:** Before committing, run a capture spike proving screen +
  system-audio + region capture and global shortcuts on all three platforms via
  Tauri (falling back to Electron only if a hard capability gap is found). Record
  the spike outcome by superseding this ADR. Capture that cannot be done in the
  WebView is exposed through a narrow native command surface, keeping the domain
  logic in shared packages either way so the runtime remains swappable.

---

## ADR-0007: Recorder and player packaging — `recording` + `media`, not separate `recorder`/`player`

- **Status:** Superseded by ADR-0008
- **Context:** The product brief sketches `packages/recorder` and
  `packages/player`. The implemented monorepo already ships the same
  capabilities under different names: capture + chunked/resumable/offline upload
  live in **`packages/recording`**, and streaming/playback (manifest generation,
  ABR, share-credential gating) lives inside **`packages/media`** alongside the
  video/asset/storage/sharing domain it is tightly coupled to. The full suite
  (753 tests) is green against this layout, with build-time boundary and acyclic
  -graph enforcement.
- **Decision:** Keep `packages/recording` as the recorder package and keep
  playback within `packages/media` rather than renaming to `recorder` and
  extracting a standalone `player` package. The names map one-to-one:
  `recorder → packages/recording`, `player → packages/media` (playback module).
- **Rationale / trade-offs:** A rename/extraction is a destructive change to a
  fully-working, fully-tested build — it touches TypeScript project references,
  cross-package imports, the dependency graph, and every affected test — for
  purely cosmetic alignment with the sketch. Playback also shares types and
  authorization with the rest of the media domain, so extracting it would add a
  package boundary (and an extra edge in the graph) without a domain benefit.
  Measured against the engineering principles (avoid unnecessary abstractions,
  don't churn without justification, protect backward compatibility), the cost
  outweighs the benefit today.
- **Consequences:** Documentation refers to the recorder as `packages/recording`
  and the player as the playback module of `packages/media`. If a standalone,
  independently-consumable player (e.g. an embeddable player SDK) becomes a real
  requirement, extract `packages/player` at that point behind its current
  public types, and supersede this ADR.

---

## ADR-0008: Align package names with the product sketch — `recorder` and standalone `player`

- **Status:** Accepted (supersedes ADR-0007)
- **Context:** ADR-0007 kept the recorder as `packages/recording` and playback
  inside `packages/media`, arguing a rename/extraction was churn without benefit.
  The project owner subsequently asked to align the package layout with the
  product sketch (`packages/recorder`, `packages/player`) so the repository
  structure matches the documented architecture and an independently-consumable
  player package exists (e.g. for an embeddable player surface).
- **Decision:** Perform both changes:
  1. Rename `packages/recording` → `packages/recorder`
     (`@streetstudio/recording` → `@streetstudio/recorder`). It had **no code
     importers**; only `apps/web` and `apps/desktop` referenced it via project
     references and manifests, which were updated.
  2. Extract streaming/playback from `packages/media` into a new
     **`packages/player`** (`@streetstudio/player`) exposing `PlaybackService`
     and its ports. The `VIEW_VIDEO_PERMISSION` contract **stays in the media
     domain** (it also gates comments and search) in a new
     `packages/media/src/permissions.ts`, and `player` depends on `media` for it
     and re-exports it for player consumers. Direction is
     `player → media → {database, auth, plugins, shared}` — acyclic.
- **Rationale / trade-offs:** The extraction was contained: no external package
  imports playback symbols (the storage plugins consume only storage types from
  `media`, and `apps/api` imports only `DOMAIN`), so the only coupling to resolve
  was the `VIEW_VIDEO_PERMISSION` constant. Keeping that constant in the media
  domain avoids a backwards `media → player` dependency. The alternative (leaving
  the layout as-is) was rejected in favour of matching the documented structure.
- **Consequences:** The monorepo now has `packages/recorder` and
  `packages/player`. Playback tests moved with the code into `packages/player`.
  The full gate remains green after the change (build, `graph:check`,
  `boundary:check`, and the whole test suite — 160 files, 753 passed, 1 skipped;
  coverage 84.85%). Documentation (`README.md`, `docs/ARCHITECTURE.md`,
  `docs/MEDIA_PIPELINE.md`, `docs/IMPLEMENTATION_REPORT.md`, `ROADMAP.md`) was
  updated to the new names.

---

## ADR-0009: Extract standalone domain packages to match the vision sketch

- **Status:** Accepted
- **Context:** The founding vision ([`VISION.md`](../VISION.md)) sketches
  standalone `organizations`, `comments`, `search`, `realtime`, `ai`, and
  `integrations` packages. After ADR-0008 (recorder/player), the owner asked to
  align the full package layout with the sketch.
- **Decision:** Extract six packages, each depending on its source domain so the
  graph stays acyclic:
  - `@streetstudio/organizations` ← `packages/auth` (`org-service`); depends on
    `auth`, `database`, `shared`.
  - `@streetstudio/comments` ← `packages/media` (`comment`); depends on `media`,
    `auth`, `database`, `shared`.
  - `@streetstudio/search` ← `packages/media` (`search`); depends on `media`,
    `auth`, `shared`.
  - `@streetstudio/realtime` ← `packages/notifications` (`realtime`); depends on
    `notifications`, `auth`, `shared`.
  - `@streetstudio/ai` ← `packages/plugins` (`ai-router`); depends on `shared`.
  - `@streetstudio/integrations` — a **new** integration framework (typed
    integration-plugin contract, registry, and built-in catalog) over the plugin
    system; depends on `plugins`, `shared`. The existing `integration-*` plugins
    are unchanged (they already implement the generic `Plugin` contract).
- **Rationale / trade-offs:** Each moved domain had **no external code
  importers** (they were wired through the DI container / SDK), so the moves were
  contained — only shared constants (`VIEW_VIDEO_PERMISSION`) and one test import
  (`RealtimeGateway`) needed repointing. Keeping shared permission contracts in
  the media domain preserved acyclicity (`comments`/`search`/`player` → `media`;
  `organizations` → `auth`; `realtime` → `notifications`). The `integrations`
  package was purpose-built rather than faked, giving the domain a real contract
  and registry without rewriting the eight integration plugins.
- **Consequences:** The monorepo now exposes all vision-sketch packages as
  first-class entry points (34 packages total). The full gate stayed green at
  every step (build, `graph:check`, `boundary:check`; 161 test files, 759
  passed, 1 skipped; coverage 84.84%). Source that previously imported these from
  their old homes now imports the dedicated packages. Docs (`README.md`,
  `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_REPORT.md`, `VISION.md`) were
  updated to the new layout.
