# Roadmap

StreetStudio is developed in phases. The founding vision and versioned release
plan (0.1 → 1.0) live in [**VISION.md**](VISION.md); the detailed engineering
roadmap lives at **[`docs/ROADMAP.md`](docs/ROADMAP.md)**; this root file is the
top-level summary.

## Phase status

| Phase | Focus | Status |
| ----- | ----- | ------ |
| 1 | Research, architecture, requirements, decision records | Done — see `.kiro/specs/streetstudio/{requirements,design}.md` and `docs/DECISIONS.md` |
| 2 | Repository, infrastructure, CI, shared libraries | Done — monorepo, `docker/`, `infrastructure/`, `.github/workflows/ci.yml`, `packages/{shared,config}` |
| 3 | Auth, database, storage, recording pipeline | Done — `packages/{auth,database,media,recorder,player,processing}` |
| 4 | Editing, collaboration, AI | Backend done (comments, notifications, realtime, search, sharing, AI router); browser editor UI is future work |
| 5 | Enterprise, scaling, plugins, API, SDK | Done — plugins, storage/integration plugins, webhooks, public API + SDK, HA operation |

See [`docs/IMPLEMENTATION_REPORT.md`](docs/IMPLEMENTATION_REPORT.md) for the
current verified state (tasks complete, tests passing, gates green).

## Near-term priorities

- Browser editor front-end build-out (trim/split/merge/crop/speed/captions/annotations).
- Desktop client runtime (see the Electron-vs-Tauri ADR in `docs/DECISIONS.md`).
- Knowledge-base embeddable pages and public documentation surfaces.
- Broaden real-dependency integration coverage as live environments are provisioned.
