# Roadmap

This roadmap describes the direction of StreetStudio. It is intentionally
high-level; specific work is tracked as tasks in the spec and as issues in the
repository. Dates are deliberately omitted — items move as capacity and
priorities allow.

## Guiding principles

- **Stay on the framework** — deliver capabilities on top of StreetJS through
  its public interfaces; push framework gaps upstream via external StreetJS
  issues (see the StreetJS gap register in the [README](../README.md)).
- **API-first parity** — every user capability ships on the public API and the
  SDK, not only in the Web_Client.
- **Secure and self-hostable by default** — no capability lands without its
  security defaults and a self-hosting story.

## Now (foundation)

The core platform is implemented and boundary-enforced:

- Modular monorepo with enforced StreetJS, package, and AI/billing boundaries.
- Authentication, sessions, API keys, and deny-by-default per-organization RBAC.
- Organizations, memberships, roles, invitations, projects, and folders.
- Recording, chunked/resumable uploads, and the media processing pipeline
  (thumbnails, previews, ABR renditions) with bounded retries.
- Pluggable object storage (Local, S3, R2, Azure Blob, GCS, MinIO).
- Comments, threads, reactions, playback, search, and sharing with passcode
  protection and lockout.
- Notifications and a realtime channel with a Redis backplane.
- Outbound webhooks with signed, bounded-retry delivery.
- Analytics (Administrator-scoped, org-isolated).
- The public SDK mirroring the operation catalog.
- Self-hosting via Docker Compose, with HA guidance for PostgreSQL and Redis.

## Next

- Broaden the AI capability plugins (transcription/summarization providers)
  behind the vendor-neutral router.
- Expand integration plugins (Slack, Discord, GitHub, GitLab, Jira, Linear,
  Microsoft Teams, Notion).
- Harden the media pipeline for larger workloads and additional rendition
  profiles.
- Deepen the analytics surface within organization-isolation guarantees.
- Kubernetes reference manifests to complement the Compose stack.

## Later

- Additional billing plugins behind the billing abstraction.
- Richer knowledge-base and engineering-review workflows.
- Performance and load hardening informed by benchmark and load test results.

## How to influence the roadmap

Open an issue describing the problem you want solved (not just a solution), or
start a discussion. Contributions are welcome — see
[CONTRIBUTING.md](./CONTRIBUTING.md).
