# StreetStudio — Vision, Product Strategy & Master Development Plan

- **Version:** 1.0
- **Status:** Founding Vision / Master Plan
- **Project type:** Independent open-source product built on the StreetJS framework
- **Author:** Product & Architecture Planning
- **Date:** 2026

## Executive summary

StreetStudio is an independent, open-source developer collaboration platform
built entirely on top of the StreetJS framework. It is **not** another Loom
clone. StreetStudio transforms recordings into searchable, collaborative
engineering knowledge. Where Loom ends after recording a video, StreetStudio
begins:

```
Record → Upload → Process → Understand → Collaborate → Search → Reuse → Institutional Knowledge
```

The project also serves a second role: it is the **flagship production
application of StreetJS**. Every major StreetJS capability should be exercised by
StreetStudio in production, without compromising StreetJS' framework-first
philosophy.

- StreetStudio must never become part of StreetJS.
- StreetStudio remains an independent project that consumes only StreetJS
  public APIs.

## Vision

Create the world's best open-source platform for engineering knowledge — not
merely video hosting or screen recording, but:

- engineering communication
- asynchronous collaboration
- searchable knowledge
- AI-assisted documentation
- reusable organizational memory

## Mission

Allow engineering teams to communicate without meetings. Every recording becomes
permanent, searchable documentation. Knowledge should never disappear inside
Slack threads or Zoom calls.

## Principles

### Independent

StreetStudio lives in its own repository with its own release cycle, roadmap,
issues, contributors, and documentation. StreetJS remains a framework;
StreetStudio remains an application.

### Framework consumer

StreetStudio only imports public StreetJS packages. Never
`../../streetjs/packages/...`, never `packages/core/src/...`, never private
APIs. If StreetStudio discovers a missing framework capability, it improves
StreetJS (via an external issue) rather than bypassing it.

### Production first

Every StreetJS feature should be proven inside StreetStudio before it is called
mature. StreetStudio is the proving ground.

### Knowledge first

Video is not the product — knowledge is. Every feature should help preserve
engineering knowledge.

## Product position

> **StreetStudio is the asynchronous operating system for software teams.**

The experience-centric product strategy — the lifecycle (Capture → Explain →
Collaborate → Track → Resolve → Archive), the engineering knowledge graph,
recorder markers, whole-workflow reviews, outcome-based analytics, and the
experience-based roadmap — lives in [`docs/PRODUCT.md`](docs/PRODUCT.md).

Rather than competing with Loom feature-for-feature, StreetStudio competes
differently:

| Loom            | StreetStudio       |
| --------------- | ------------------ |
| Record videos   | Record knowledge   |

Every recording automatically becomes a transcript, a searchable document,
documentation, an issue report, an architecture discussion, onboarding material,
and reusable knowledge.

## Target users

- **Primary:** software engineers
- **Secondary:** engineering managers, DevOps teams, platform teams, security
  teams, QA, architects
- **Future:** universities, educators, enterprises

## Differentiators

- **Open source & self-hosted** — Apache-2.0 (owner decision; MIT was also on the
  table).
- **Built for developers** — code snippets, terminal recording, logs,
  architecture discussions, API demos.
- **Searchable** — transcript, comments, titles, metadata, tags, projects.
- **AI optional** — no AI vendor lock-in; everything through plugins (OpenAI,
  Anthropic, Ollama, Azure, Gemini, or anything).
- **Plugin first** — storage, AI, billing, notifications, integrations — all
  extensible.
- **Enterprise ready** — Redis Cluster, PostgreSQL HA, RBAC, audit logs, HA
  deployment, SLSA supply chain.

## Repository structure (target sketch)

```
StreetStudio/
  apps/        api/ web/ desktop/ docs/
  packages/    auth/ organizations/ media/ recorder/ processing/ player/
               comments/ notifications/ realtime/ search/ analytics/
               plugins/ ai/ integrations/ sdk/ ui/ shared/
  docker/ infrastructure/ docs/ examples/ scripts/ .github/
```

Independent. No copied StreetJS source. See the reconciliation appendix for how
this sketch maps to the current implementation.

## StreetJS usage

StreetStudio demonstrates every major StreetJS capability through supported
public APIs only:

| StreetJS       | Usage in StreetStudio          |
| -------------- | ------------------------------ |
| HTTP           | REST API                       |
| Router         | Routing                        |
| Validation     | DTO validation                 |
| Auth           | Authentication                 |
| RBAC           | Authorization                  |
| PostgreSQL     | Metadata                       |
| PG HA          | Enterprise deployments         |
| Redis          | Cache                          |
| Redis Cluster  | HA cache                       |
| Queue          | Video processing               |
| Events         | Notifications                  |
| Scheduler      | Cleanup                        |
| WebSocket      | Live collaboration             |
| Storage        | File storage                   |
| Plugin system  | AI & integrations              |
| Metrics        | Monitoring                     |
| Health         | Health endpoints               |
| OpenTelemetry  | Tracing                        |
| Resilience     | Retry & circuit breaker        |
| CLI            | Administration                 |

## Release plan

### MVP (0.1) — usable product, not maximum feature count

- **Authentication:** login, registration, sessions.
- **Organizations.**
- **Recording:** browser recording, microphone, camera, screen.
- **Upload:** chunked uploads, resume, progress.
- **Processing:** thumbnail, preview, transcoding.
- **Playback:** adaptive streaming, video player.
- **Sharing:** public links, private links, organization-only.
- **Comments:** timeline comments, replies, mentions.
- **Search:** title, description, transcript.

This is enough for a public alpha.

### 0.2

- Folders, projects, teams.
- Notifications, realtime, presence, activity.

### 0.3

- Desktop recorder, offline queue, native capture, keyboard shortcuts,
  auto-updates.

### 0.4

- AI: transcript, summary, action items, meeting notes, chapters, smart titles,
  knowledge extraction.

### 0.5

- Integrations: GitHub, GitLab, Slack, Discord, Teams, Jira, Linear, Notion.
- Webhook engine.

### 1.0

- Stable, enterprise, HA, plugin marketplace, SDK, CLI, production
  documentation, self-hosted installer.

## Future vision

StreetStudio becomes more than recording:

```
Record Bug → Transcript → AI Summary → GitHub Issue → Architecture Decision → Knowledge Base → Searchable forever
```

```
Record Deployment → AI detects commands → Creates documentation → Indexes logs → Adds diagrams → Links pull requests
```

Every recording becomes structured knowledge.

## AI philosophy

AI is optional. StreetStudio must always work offline with no AI provider
required. AI is simply another plugin.

## Plugins

Storage, AI, billing, integrations, authentication, analytics, notifications —
anything replaceable.

## Security

RBAC, organizations, audit logs, signed plugins, encrypted secrets, API keys,
webhooks, rate limiting, supply-chain verification.

## Deployment

Docker, Docker Compose, Kubernetes, HA, single-node, enterprise, cloud,
self-hosted.

## Documentation

Installation, architecture, developer guide, plugin guide, API, deployment,
examples, tutorials, migration, troubleshooting.

## Success metrics

- **Technical:** stable releases, high test coverage, fast builds, zero critical
  vulnerabilities, verified supply chain.
- **Community:** contributors, stars, issues, discussions, plugin authors.
- **Product:** active installations, monthly downloads, organizations using it,
  videos created, community plugins.

## What not to build

- Do not become another general video platform.
- Do not chase every Loom feature.
- Do not add unnecessary complexity.
- Do not tightly couple to any cloud vendor.
- Do not lock users into AI.
- Do not compromise StreetJS architecture.

## Relationship with StreetJS

StreetStudio exists to prove StreetJS; StreetJS exists to power StreetStudio.
Neither depends on the other's internal implementation.

```
StreetJS
├── Framework
├── Runtime
├── Libraries
├── Plugins
└── Tooling
        ▲
        │  Public APIs only
        ▼
StreetStudio
├── Browser Recorder
├── Desktop Recorder
├── API
├── Web UI
├── Processing
├── AI
├── Collaboration
├── Search
└── Knowledge Platform
```

This separation keeps StreetJS a clean, reusable framework while StreetStudio
evolves rapidly as a real-world application.

## Long-term vision

Within three to five years, StreetStudio should be recognized not simply as an
open-source alternative to Loom, but as the leading developer knowledge
platform. Its defining capability is that every recording becomes durable,
searchable engineering knowledge. Organizations should be able to build an
internal, living knowledge base from videos, transcripts, comments, architecture
discussions, code walkthroughs, and AI-assisted summaries. As StreetStudio
grows, it continuously validates and strengthens StreetJS through real
production use — a feedback loop that improves the framework without coupling the
two projects.

Success is not measured by matching Loom feature-for-feature. It is measured by
enabling engineering teams to communicate asynchronously, preserve institutional
knowledge, and self-host a secure, extensible, vendor-neutral platform built on
open standards.

---

## Appendix: current implementation vs this vision

This vision is the north star. The repository already implements most of the
backend on StreetJS (via adapter seams); the package **sketch** above differs in
naming/granularity from the **implemented** layout. The capabilities exist today
— they are organized differently. No speculative empty packages have been created
to match the sketch; alignment is an optional, owner-approved refactor.

| Vision package        | Where it lives today                                             |
| --------------------- | ---------------------------------------------------------------- |
| `auth`                | `packages/auth` (auth, sessions, RBAC, API keys)                 |
| `organizations`       | `packages/organizations`                                         |
| `media`               | `packages/media`                                                 |
| `recorder`            | `packages/recorder`                                              |
| `processing`          | `packages/processing`                                            |
| `player`              | `packages/player`                                                |
| `comments`            | `packages/comments`                                              |
| `notifications`       | `packages/notifications`                                         |
| `realtime`            | `packages/realtime`                                              |
| `search`              | `packages/search`                                                |
| `analytics`           | `packages/analytics`                                             |
| `plugins`             | `packages/plugins`                                               |
| `ai`                  | `packages/ai` (capability router) + AI provider plugins          |
| `integrations`        | `packages/integrations` (framework) + `packages/integration-*` plugins |
| `sdk`                 | `packages/sdk`                                                   |
| `ui`                  | `packages/ui`                                                    |
| `shared`              | `packages/shared`                                                |

Not in the sketch but present (and required): `packages/config` (config +
boundary/graph tooling), `packages/database` (schema, repositories, audit log),
and the `storage-*` provider plugins.

The top-level `examples/` directory from the sketch is now present
([`examples/`](examples/)) with an SDK quickstart and a self-hosting guide.

**Licensing:** the sketch left MIT/Apache to owner decision; the repository ships
**Apache-2.0** (`LICENSE`, and every `package.json`).

The package layout now matches the sketch one-to-one: `organizations`,
`comments`, `search`, `realtime`, `ai`, and `integrations` were extracted into
standalone packages (ADR-0009), and `examples/` was added. Each extraction was
done incrementally with the full gate (`scripts/check.sh`) green at every step,
as with the `recorder`/`player` work (ADR-0008).
