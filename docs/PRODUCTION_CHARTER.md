# StreetStudio Production Charter

> **Status of this document.** This is the governing standard for StreetStudio
> as a **production product** (adopted via [`DECISIONS.md`](DECISIONS.md),
> ADR-0015). It states the bar all new work is measured against. It is a
> *standard*, not a status claim: adopting it does not assert that the product is
> shipped, that real infrastructure is provisioned in this workspace, or that the
> standalone product repository exists yet. Where a rule below cannot be
> satisfied because a dependency is missing, the required action is to **stop and
> record the dependency** (see "Missing-dependency rule").

## Mission

Build the real StreetStudio product on top of the StreetJS framework. Every
change should move the product closer to a production-ready release that users
can deploy against real infrastructure, with real persistence, real
integrations, and real functionality.

## Core principles

Build production-quality software only. Do not produce:

- placeholder implementations,
- mock data or fake APIs,
- stub services or TODO implementations,
- simulated infrastructure,
- hardcoded responses where a real implementation belongs,
- demo-only features.

If a feature cannot be completed because a dependency is missing, **stop and
explain exactly what is required** rather than inventing an implementation.

## Real infrastructure only

Every feature integrates with actual infrastructure: PostgreSQL, Redis,
S3-compatible object storage, Cloudflare R2, Azure Blob Storage, Google Cloud
Storage, MinIO, WebSockets, HTTP, OAuth providers, SMTP, OpenTelemetry,
Prometheus, Docker, Kubernetes.

**In-memory implementations are allowed only inside automated tests.** Production
code must use real implementations.

## Data policy

Never generate fake data — no seeded organizations, fake users, lorem ipsum,
placeholder videos, random analytics, or invented IDs. Every endpoint operates
on real persisted data.

## Subsystem standards

- **Database.** PostgreSQL. All data persisted. Migrations, transactions where
  appropriate, foreign keys and constraints respected. No in-memory repositories
  in production code.
- **Authentication.** Argon2id password hashing; sessions via secure cookies or
  JWT; API keys securely hashed; persistent refresh tokens; session invalidation
  implemented.
- **Storage.** Real file storage across local/S3/R2/Azure/GCS/MinIO. Chunked
  uploads assemble actual files; streaming streams actual media.
- **Processing.** Real FFmpeg: thumbnails, previews, HLS renditions, metadata.
  Outputs persisted.
- **Realtime.** Actual WebSockets: live presence, live typing indicators,
  delivered notifications. No simulated events.
- **Search.** Indexes actual persisted content; transcript search uses stored
  transcript data; authorization enforced.
- **AI.** Requests sent to configured providers via plugins; no fake responses;
  no provider-specific code in core.
- **Plugins.** Dynamically loaded; failures isolated; lifecycle implemented;
  configuration validated.
- **Dashboard / Desktop / Extension / Mobile.** Build the actual applications —
  no wireframes, placeholder pages, empty components, or "Coming Soon."
- **API.** Every endpoint validates input, authenticates, authorizes, performs
  business logic, persists changes, audits actions, and returns correct
  responses. No endpoint returns placeholder data.
- **SDK.** Calls the real API. No mocked transport or fake responses in
  production code.

## StreetJS boundary (non-negotiable)

**Do not recreate StreetJS inside StreetStudio.** If a required framework
capability is not yet published as a `@streetjs/*` package, pause that feature
and record the missing dependency instead of implementing framework
functionality in the product repository. Compatibility adapters are permitted
only as temporary wrappers around published packages, and are removed as the
corresponding packages are published (promotion-first — ADR-0011/0012).

## Missing-dependency rule

When a real implementation needs a dependency that is not present, do not fake
it. Stop and record the blocker with enough detail to act on it:

- what is needed (published package name, provisioned service, UI/native
  runtime),
- why it is required for the feature,
- what unblocks it.

## Documentation honesty

Only document implemented functionality. Do not describe planned features as
complete or exaggerate implementation status. Report progress from real build,
test, and coverage outputs — never hand-edited or invented metrics.

## Quality gates

Every contribution must compile, pass tests, satisfy linting and type checking,
maintain architecture boundaries (`graph:check`, `boundary:check`,
`streetjs:check`), maintain security and performance, and avoid duplication.

## Known blocking dependencies (as of adoption)

Recorded per the missing-dependency rule. These gate production execution and
must be resolved (elsewhere) before the corresponding work can proceed honestly:

1. **Published `@streetjs/*` runtime packages.** Real HTTP host, auth runtime,
   storage drivers, realtime, jobs, metrics, and health depend on these. Only
   `@streetjs/core ^0.1.0` is currently referenced (optional peer, behind seams).
2. **Provisioned infrastructure.** No live PostgreSQL/Redis/object-storage/FFmpeg
   /SMTP endpoints are available in this workspace; production code cannot run
   against real services here. (CI exercises services opportunistically via
   containers and skips otherwise.)
3. **UI and native runtimes/toolchains.** No web app runtime, Tauri toolchain,
   browser-extension build target, or iOS/Android toolchains are set up here, so
   the real client applications cannot be built in this workspace.
4. **The standalone product repository.** It has not been created; this workspace
   physically remains the reference build. Repo creation, git-history migration,
   npm publishing, and independent CI/CD happen outside this workspace.
