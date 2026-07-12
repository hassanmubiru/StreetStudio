# StreetStudio

Open-source asynchronous collaboration platform for video/screen recording, review, and knowledge sharing. StreetStudio is the flagship application built on the **StreetJS** framework.

## StreetJS consumption policy

StreetStudio consumes StreetJS **exclusively** through published package versions or local package links. It never modifies StreetJS source, contains no StreetJS source in this repository, and never imports StreetJS internals — only StreetJS public package entry points. StreetJS references are declared in package manifests as published-version dependencies (`@streetjs/core`); there are zero filesystem references into the StreetJS repository.

## Monorepo layout

```
apps/
  api/       API_Service: REST + WebSocket + Webhook host (StreetJS app)
  web/       Web_Client (browser SPA)
  desktop/   Desktop_Client (wraps web + native capture)
  docs/      Documentation site
packages/
  ui/            Shared UI components (web + desktop)
  sdk/           Public client library (REST + WebSocket)
  shared/        Cross-cutting types, DTOs, errors, constants
  config/        Config schema + loading via StreetJS config
  database/      Schema, migrations, repositories, audit log
  auth/          Authentication, sessions, RBAC, API keys
  media/         Videos, assets, storage abstraction, comments, sharing, playback, search
  recording/     Recorder capture + chunked/resumable upload client
  processing/    Media pipeline: transcode, thumbnail, preview
  notifications/ Notifications + realtime event contracts
  plugins/       Plugin_Manager, plugin contracts, isolation
  analytics/     View events + aggregation
```

Each package declares a single primary domain responsibility (`streetstudio.domain` in its manifest) and exposes a public surface **only** through its declared entry point (`exports["."]`). Cross-package imports must target entry points, never internal modules. The dependency graph is acyclic.

## Development

```bash
npm install       # install workspaces + dev tooling
npm run build     # tsc -b across all project references
npm test          # vitest run (property tests use fast-check, >=100 iterations)
```

Requires Node.js >= 20.
