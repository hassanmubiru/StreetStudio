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

---

## ADR-0010: Separate `knowledge` (and `projects`, `storage`) from `media`

- **Status:** Accepted (executed)
- **Context:** A lead-architect product review observed that **knowledge and
  media evolve differently**: media is bytes, renditions, and playback;
  knowledge is the graph of transcripts, summaries, decisions, links, comments,
  and reuse that outlives any single recording (see
  [`PRODUCT.md`](../PRODUCT.md), "Engineering memory"). The review's recommended
  package layout also splits `projects` and `storage` out of `media` and adds a
  future `apps/mobile`.
- **Decision (proposed, not yet executed):**
  - Extract `@streetstudio/knowledge` from `packages/media` (currently the
    `knowledge-base` module and, over time, the knowledge-graph / search-index
    surfaces) so the engineering-memory domain evolves on its own.
  - Extract `@streetstudio/projects` (the `content` module: projects, folders,
    workspaces) and `@streetstudio/storage` (the storage abstraction +
    `StorageProvider` contract) from `packages/media`.
  - Reserve `apps/mobile` for a future client.
- **Rationale / trade-offs:** This continues the sketch-alignment already done in
  ADR-0008/0009 and reflects genuine domain seams (knowledge ≠ media). The cost
  is another boundary-graph-affecting refactor; the `storage` split in particular
  touches the six `storage-*` provider plugins that import storage types from
  `@streetstudio/media` today. As with prior extractions, no domain has external
  code importers beyond declared entry points, so the moves are contained.
- **Consequences (executed):** `@streetstudio/projects` (content hierarchy),
  `@streetstudio/storage` (StorageProvider contract + router), and
  `@streetstudio/knowledge` (transcript indexing, summaries, doc links) were
  extracted from `packages/media`. Dependency directions stay acyclic:
  `storage → {auth, shared}`; `projects`/`knowledge` → `{auth, database, shared}`;
  `media → storage` (the upload service uses the storage router). The six
  `storage-*` provider plugins and the `storage-conformance` suite were repointed
  from `@streetstudio/media` to `@streetstudio/storage` (imports, manifests, and
  project references). The full gate stayed green (build, `graph:check`,
  `boundary:check`; 161 test files, 759 passed, 1 skipped; coverage 84.91%), and
  the monorepo is now 37 packages. `apps/mobile` remains roadmap-only.

---

## ADR-0011: Consume StreetJS only as published, versioned packages (promotion-first)

- **Status:** Accepted
- **Context:** StreetStudio is StreetJS's flagship production application, but the
  strongest proof of a framework is an *independent* application that uses it the
  way any external customer would — not an example app living inside the
  framework repo. Local path references, submodules, or workspace links to
  StreetJS would blur that separation and let StreetStudio depend on unpublished
  framework changes.
- **Decision:** StreetStudio is built **exclusively on the public, versioned API
  surface of StreetJS**:
  - StreetJS is consumed only as published npm packages (`streetjs`,
    `@streetjs/*`) with registry semver ranges. **No** symlinks, git submodules,
    workspace references, `file:`/`link:`/`portal:`/`workspace:` specifiers,
    `git`/URL dependencies, `../streetjs` imports, or framework-internal
    (deep-path) imports.
  - **Promotion-first golden rule:** if StreetStudio needs a reusable capability
    StreetJS lacks (auth, storage, uploads, queues, realtime, plugin infra, etc.),
    that capability is designed and released **in StreetJS first**, then consumed
    here as a normal dependency upgrade — never implemented as a StreetStudio
    package that duplicates a framework concern.
  - **Ownership split.** *StreetJS* owns broadly-reusable infrastructure (HTTP,
    routing, auth/authz, PostgreSQL/PG-HA, Redis/Cluster, queues, WebSockets/SSE,
    uploads, object storage, plugin system, config, CLI, observability,
    resilience, scheduling, validation, security middleware, rate limiting,
    caching, OpenAPI, test utilities). *StreetStudio* owns product-specific
    concerns (recording workflows, workspace/video organization, timeline
    editing, comments/discussions, knowledge base, AI prompts/workflows, team
    collaboration, branding, pricing/billing decisions, UI/UX, and its business
    logic).
- **Enforcement:** `npm run streetjs:check`
  (`scripts/check-streetjs-consumption.mjs`) fails the build on any non-registry
  StreetJS dependency specifier or any path/URL/deep-scoped StreetJS import; it
  runs in `scripts/check.sh` and as a CI gate alongside `graph:check` and
  `boundary:check`. Today the sole StreetJS reference is `@streetjs/core` as an
  optional peer dependency (registry semver), reached only through structural
  adapter seams.
- **Repository layout (intended):** StreetJS and StreetStudio live in **separate
  repositories** (`…/streetjs`, `…/streetstudio`). The desktop and mobile clients
  may either be separate repos (`StreetStudio-Desktop`, `StreetStudio-Mobile`) or
  live in the StreetStudio monorepo if that suits the release process — but in all
  cases they consume the same published StreetJS APIs. `apps/mobile` remains
  roadmap-only (ADR-0010).
- **Consequences:** The separation stays clean and verifiable; StreetJS is forced
  to remain a genuine general-purpose framework; and "has anyone built something
  real on StreetJS?" has an honest answer — StreetStudio, on released packages
  only. The trade-off is that a capability gap requires a StreetJS release cycle
  before StreetStudio can adopt it; gaps are tracked in the README StreetJS gap
  register with external issue links until then.

---

## ADR-0012: Target framework-consumption map and promotion backlog

- **Status:** Proposed (target architecture; migration is incremental and gated
  on StreetJS publishing the corresponding packages)
- **Context:** ADR-0011 established that StreetStudio consumes StreetJS only as
  published, versioned packages (promotion-first). The lead-architect direction
  refines the *end state*: StreetStudio should consume a family of granular
  `@streetjs/*` packages for all broadly-reusable infrastructure, and own only
  product-specific concerns — mirroring Laravel→Forge/Vapor/Nova,
  Rails→GitLab, Next.js→Vercel. Two facts constrain execution today:
  1. The granular `@streetjs/*` packages do **not exist yet**; the only StreetJS
     dependency available is `@streetjs/core` (optional peer), reached through
     structural adapter seams.
  2. Consequently, some current StreetStudio packages implement framework-level
     concerns in-repo *as a pre-framework stand-in*, behind those same seams.
- **Decision (target):** As StreetJS publishes each capability, migrate
  StreetStudio to consume it and retire the in-repo stand-in. Target map:

  | Capability                    | Target package        | Today in StreetStudio                         |
  | ----------------------------- | --------------------- | --------------------------------------------- |
  | Core framework (HTTP/routing/DI/config) | `streetjs`, `@streetjs/cli` | `@streetjs/core` seam + `apps/api`, `packages/config` |
  | Authentication / sessions / JWT | `@streetjs/auth`     | `packages/auth`                               |
  | PostgreSQL (+ HA)             | `@streetjs/postgres`  | `packages/database`                           |
  | Redis (+ Cluster) / cache     | `@streetjs/redis`, `@streetjs/cache` | `packages/database` adapters       |
  | WebSockets                    | `@streetjs/websocket` | `packages/realtime` transport seam            |
  | Events                        | `@streetjs/events`    | `packages/notifications`/`realtime` contracts |
  | Background jobs / queues       | `@streetjs/jobs`      | `packages/processing` worker seam             |
  | Object storage                | `@streetjs/storage`, `@streetjs/s3`, `@streetjs/r2` | `packages/storage` + `storage-*` plugins |
  | Media utilities               | `@streetjs/media`     | `packages/processing`                         |
  | Email                         | `@streetjs/sendgrid`  | notification delivery seam                    |
  | Billing                       | `@streetjs/stripe`    | `packages/plugins` billing gateway            |
  | Rate limiting / security      | `@streetjs/rate-limit`| `apps/api/security`                           |
  | Observability / logging        | `@streetjs/otel`, `@streetjs/logger` | (seams; not yet built)         |
  | Plugin system                 | (part of `streetjs`)  | `packages/plugins`                            |

  **Stays in StreetStudio (product-specific, never promoted):** recording
  workflows, workspace/video organization (`projects`), timeline editing,
  comments/discussions, knowledge base, AI prompts/workflows, team collaboration,
  branding, pricing/billing *decisions*, UI/UX, and StreetStudio business logic.

- **Refined layout (target).** Apps: `api`, `dashboard` (today `web`), `desktop`,
  `recorder-extension`, `docs`. Product packages: `sdk`, `ui`, `player`,
  `editor`, `timeline`, `shared`, `types`. A root `street.config.ts` assembles the
  StreetJS building blocks. `apps/mobile` remains roadmap-only (ADR-0010).
- **Release strategy.** StreetJS and StreetStudio keep independent version lines;
  StreetStudio pins compatible StreetJS versions and upgrades deliberately after
  testing (`npm update` → build → test → deploy), never depending on unpublished
  framework changes.
- **Why the seams matter now.** Because every framework touchpoint is already a
  narrow structural adapter seam (not a hard `@streetjs/core` import), each future
  migration is a localized swap: point the seam at the real `@streetjs/*` package
  and delete the stand-in — with `streetjs:check`, `boundary:check`, and
  `graph:check` guarding every step.
- **Consequences:** This ADR is the migration backlog, not an immediate refactor.
  Executing any row requires the corresponding `@streetjs/*` package to be
  published first (ADR-0011 promotion-first). Until then the in-repo stand-ins
  remain and are recorded in the README StreetJS gap register. No code changes
  accompany this ADR.

---

## ADR-0013: Freeze the reference build; move product development to a standalone repository

- **Status:** Superseded by ADR-0014
- **Context:** The reference implementation has served its purpose — it validated
  the domain model, API surface, package boundaries, plugin architecture, and the
  correctness properties, all measured by the build/test/analysis pipeline.
  Adding more specification documents now yields diminishing returns; the
  remaining work (dashboard, clients, real infrastructure, published-`@streetjs/*`
  integration, UX) is **product engineering**, and ADR-0011/0012 require it to
  happen against published StreetJS packages in an independent repository.
- **Decision:** Freeze this repository as the **reference build**. It is a
  historical engineering reference documenting the verified domain model and
  tests. New feature development happens in a **separate, independent
  `streetstudio` repository** (its own layout with `pnpm`/`turbo`, apps
  `api`/`dashboard`/`desktop`/`recorder-extension`/`docs`/`mobile`, and packages),
  which references this workspace only through **published npm packages** — never
  by path, submodule, or copied source.
  - Changes to this reference repo are limited to: keeping it building, and
    updates required as StreetJS evolves. No new product features are added here.
  - The productionization sequence lives in
    [`../IMPLEMENTATION-PLAN.md`](../IMPLEMENTATION-PLAN.md); the governing rule
    (no new backend work unless driven by real usage or StreetJS evolution) stays
    in force.
- **Consequences:** Three clean, independent artifacts:
  - **StreetJS** — the reusable framework (separate repository).
  - **StreetStudio** — the real application built on published StreetJS packages
    (new, active repository).
  - **Reference build** — this repository: the archived, specification-driven
    implementation that validated the design (frozen).

  The measured state at freeze: 5 apps / 40 packages, 184 specification tasks
  implemented & verified, 88 correctness properties, 773 passing tests (1
  skipped), 84.99% line coverage — all gates green.

---

## ADR-0014: Lift the freeze — continue feasible client-side implementation in this workspace

- **Status:** Accepted (supersedes ADR-0013)
- **Context:** ADR-0013 froze this repository pending a standalone product repo.
  The owner then chose to continue building the parts of the product that are
  genuinely implementable in this workspace now — without external infrastructure
  or unpublished `@streetjs/*` packages — rather than wait. Creating the
  standalone repo, publishing packages, deploying infrastructure, and building
  native/UI runtimes remain outside this workspace.
- **Decision:** Lift the freeze for **client-side domain/model logic** only.
  Permitted here: SDK-driven application logic (over an injectable/in-memory
  transport), `editor`/`timeline`/`player` client models, and SDK-level tests.
  Still out of scope (per ADR-0011/0012 and the governing rule): new backend
  work, real infrastructure, native desktop/mobile runtimes, and consuming
  unpublished `@streetjs/*` packages.
- **Consequences:** The README/STATUS freeze banners are replaced with an
  "active — client-side implementation" note. The three-artifact separation
  (StreetJS framework / future StreetStudio product repo / this reference build)
  still holds; this repo simply continues to host tested client-side logic until
  the standalone repo exists. The governing rule (no new backend work unless
  driven by real usage or StreetJS evolution) remains in force.

---

## ADR-0015: Adopt the StreetStudio production charter as the governing standard

- **Status:** Accepted
- **Context:** The owner has set a production charter for StreetStudio: the
  product must be built with real infrastructure and real persisted data, with
  no mock data, placeholder implementations, stub services, or simulated
  infrastructure outside isolated automated tests. This raises the bar for all
  future work. A factual clarification accompanies the decision: this workspace
  (`/StreetStudio`) is still, physically, the reference build — the standalone
  product repository has **not** been created here, `@streetjs/*` runtime
  packages are **not** published, and no live PostgreSQL/Redis/object-storage/
  FFmpeg/WebSocket or UI/native runtimes are provisioned in this workspace.
  Declaring the mission does not, by itself, change those facts.
- **Decision:** Adopt the production charter as the governing standard against
  which all new work is evaluated, with two owner amendments:
  1. **In-memory implementations are allowed only inside automated tests.**
     Production code must use real infrastructure (PostgreSQL, Redis, S3/R2/GCS/
     Azure/MinIO, FFmpeg, WebSockets, SMTP, OpenTelemetry/Prometheus).
  2. **Never recreate StreetJS inside StreetStudio.** If a required framework
     capability is not yet published as a `@streetjs/*` package, **pause that
     feature and record the missing dependency** — do not implement framework
     functionality in the product repository (promotion-first, per ADR-0011).

  Two boundaries are held explicitly, because the charter itself requires them:
  - Where a real implementation needs a dependency that is not present
    (published package, provisioned service, UI runtime), **stop and name the
    dependency** instead of inventing an implementation or fabricating data.
  - The charter's "only document implemented functionality; do not exaggerate
    implementation status" rule is binding. The existing **measured**
    reference-build artifacts (the report, `STATUS.md`, metrics) are accurate and
    will **not** be relabeled as production/shipped. Progress is reported from
    real build/test/coverage outputs, never hand-edited.
- **Consequences:** Future contributions are judged against the production
  charter rather than reference-build goals. In practice, until the standalone
  repository exists, `@streetjs/*` runtime packages are published, and real
  infrastructure/UI runtimes are provisioned, most production **feature** work is
  gated: the correct action is to stop and record the blocking dependency (per
  the charter's own rule) rather than produce production-shaped code that is
  actually a fake. The full charter is recorded in
  [`PRODUCTION_CHARTER.md`](PRODUCTION_CHARTER.md). This ADR governs alongside —
  and where stricter, above — the prior "governing rule"; it does not retroactively
  reclassify completed reference-build work.

---

## ADR-0016: Domain-first architecture for the product

- **Status:** Accepted
- **Context:** As the flagship StreetJS application, StreetStudio should read as
  an intentionally designed product, not a technology-layered scaffold.
  Organizing by technical layer (`controllers/`, `services/`, `models/`) scatters
  business rules and hides each module's purpose.
- **Decision:** Organize by **business domain**. Each domain is its own package
  (`recordings`, `reviews`, `sharing`, `projects`, `organizations`, `comments`,
  `notifications`, `search`, `analytics`, `billing`, `knowledge`) owning its API,
  application/use-case logic, rich domain model, persistence, events, and tests.
  Each package `README.md` answers: why it exists, what problem it solves, what it
  exposes publicly, and what it depends on. Business rules live on domain objects
  (e.g. `Recording.publish()`, `canEdit()`), not in the API layer. Public surface
  is `index.ts` only. Full rationale in
  [`ENGINEERING_PRINCIPLES.md`](ENGINEERING_PRINCIPLES.md).
- **Consequences:** Clear per-domain ownership and testability; feature-oriented
  APIs instead of generic CRUD; product vocabulary (`Recording`, `Review`,
  `Share`) kept separate from framework plumbing terms. The existing packages are
  reshaped toward this layout as they are productionized (ADR-0017), not in a
  single rewrite.

---

## ADR-0017: Vertical-slice delivery

- **Status:** Accepted
- **Context:** Empty packages and "for later" scaffolds make a codebase look
  generated and defer proof that anything works end-to-end.
- **Decision:** Deliver in **complete vertical slices** (domain → persistence →
  API → SDK → tests), each functional end-to-end before the next begins. Order:
  Recordings, Uploads, Playback, Review comments, Sharing, Workspaces, Search,
  Notifications. A slice may be **gated** on an unpublished `@streetjs/*` package;
  if so, record the dependency and pause it — never write a placeholder. Each
  slice meets the definition of done in
  [`ENGINEERING_PRINCIPLES.md`](ENGINEERING_PRINCIPLES.md).
- **Consequences:** Every merged slice is demonstrably working; progress is honest
  and measurable; framework dependencies surface early and explicitly rather than
  being mocked over.

---

## ADR-0018: This repository is the StreetStudio product repository

- **Status:** Accepted (clarifies ADR-0013/0014)
- **Context:** Earlier ADRs (0013 freeze, 0014 lift) spoke of a *separate*
  "standalone StreetStudio product repository" to be created later, and a
  `standalone-seed/` directory was built on that assumption. In fact this
  repository's git remote is `github.com/hassanmubiru/StreetStudio` on `main` —
  it **is** the StreetStudio product repo. There is no separate repo to create.
- **Decision:** Treat this repository as the StreetStudio product repo. Consolidate
  the seed's governance into the real `docs/` tree: `PRODUCTION_CHARTER.md`,
  `ENGINEERING_PRINCIPLES.md`, `FRAMEWORK_CONTRACT.md`,
  `framework-requirements/`, `PRODUCTIONIZATION.md`, and `examples/`; retire the
  `standalone-seed/` directory. The current npm + `tsc` toolchain and CI are kept;
  a pnpm + Turborepo move is optional and deferred (see `PRODUCTIONIZATION.md`).
- **Consequences:** The three-artifact separation collapses to two — StreetJS
  (framework) and StreetStudio (this product repo). The measured **reference-build
  report** remains accurate for what is still in-memory-seam vs. real; it is not
  relabeled as production. Physical blockers are unchanged: `@streetjs/*` runtime
  packages are still unpublished and no live infra/UI runtime exists here, so real
  feature work stays gated (record-and-pause) until those land.

---

## ADR-0019: StreetJS is published; adopt the real framework API

- **Status:** Accepted (supersedes the speculative framework-requirements)
- **Context:** Earlier planning assumed StreetJS was unpublished and that
  StreetStudio would consume a granular package map (`@streetjs/http`,
  `@streetjs/auth`, `@streetjs/rbac`, `@streetjs/runtime`, `@streetjs/plugins`),
  captured in `docs/framework-requirements/` and an issue-filing script. A check
  against npm disproved this: `streetjs@1.2.7` (MIT,
  `github.com/hassanmubiru/StreetJS`) is published and batteries-included, with
  `@streetjs/*` meta-packages (`database`, `storage`, `media`, `realtime`,
  `queue`, `cache`, `events`, `search`, `config`, `metrics`, `security`,
  `health`, `integrations`, `orm`, `cli`). `@streetjs/core` is a deprecated shim
  for `streetjs`. The assumed `@streetjs/http`/`auth`/`rbac`/`runtime`/`plugins`
  packages **do not exist** — those capabilities live inside `streetjs`
  (`streetApp`, `@Controller`/`@Injectable`/`container`, `streetjs/security` with
  `JwtService`/`authMiddleware`/`requireRoles`, `streetjs/pool`·`/repository`·
  `/migrations`, `streetjs/websocket`, etc.).
- **Decision:** Adopt the **real published framework API**. Retire the speculative
  `docs/framework-requirements/` specs and `scripts/file-framework-issues.sh`
  (they described a taxonomy that does not exist). Rewrite
  [`FRAMEWORK_CONTRACT.md`](FRAMEWORK_CONTRACT.md) to the real surface and update
  the dependency register in [`PRODUCTIONIZATION.md`](PRODUCTIONIZATION.md) and the
  charter's blocker list to reflect that the framework is published.
- **Consequences:** Real backend work is **unblocked** and no longer gated on
  "publishing packages." Productionization becomes: enable decorator metadata in
  tsconfig; provision real Postgres/Redis/object storage/FFmpeg (via `docker/`);
  and replace the in-memory adapter seams with `streetjs` + `@streetjs/*`, one
  vertical slice at a time (ADR-0017), with integration tests against real infra.
  The measured reference-build report remains accurate for what is still
  seam-backed vs. adopted.

---

## ADR-0020: De-seam the legacy `packages/auth` onto real StreetJS + `@streetstudio/identity`

- **Status:** Proposed (incremental migration; foundation in place)
- **Context:** The reference-build `packages/auth` implements authentication,
  sessions, RBAC, and API keys behind in-memory adapter seams. With StreetJS
  published, real auth now exists two ways: the framework's own
  `streetjs/security` + `auth/*` (JWT, sessions, RBAC, API keys, refresh tokens)
  and the product's `@streetstudio/identity` (real Argon2id registration/login,
  JWT issuance, and the shared `requireADtor`/`jwtAuth` helpers, backed by real
  PostgreSQL). The new real slices (recordings, uploads, playback) already
  authenticate through `@streetstudio/identity` — they never touch the legacy
  seam-based `packages/auth`.
- **Decision:** De-seam `packages/auth` **incrementally**, keeping all gates green
  at every step, rather than in one high-risk rewrite:
  1. Point new/authenticated product surfaces at `@streetstudio/identity` (done
     for recordings/uploads/playback).
  2. Migrate the member/session/API-key stores from in-memory to real PostgreSQL
     (reuse `@streetstudio/identity`'s member store; add real session + API-key
     stores over `streetjs` `auth/session-store` and `auth/api-keys`).
  3. Rewire the remaining `packages/auth` consumers (e.g. `apps/api`) onto the
     real implementation one dependent at a time, updating each dependent's tests
     to run against real Postgres.
  4. Retire the in-memory auth seams once no consumer depends on them.
- **Consequences:** This is a **wide-blast-radius migration** (auth is consumed
  across the reference build), so it is executed as its own sequence of small,
  independently-verifiable slices — not appended to unrelated work — to avoid
  destabilizing the suite. Until it completes, the legacy `packages/auth` remains
  the reference implementation for its consumers, while all *new* product auth is
  real (`@streetstudio/identity`). Tracked in
  [`PRODUCTIONIZATION.md`](PRODUCTIONIZATION.md).
