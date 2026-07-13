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
