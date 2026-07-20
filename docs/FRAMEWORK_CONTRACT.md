# StreetStudio ⇄ StreetJS — framework contract & composition doctrine

> **Doctrine.** StreetJS provides the platform; StreetStudio provides the
> product. StreetStudio consumes StreetJS exactly like any third-party
> application and **never** reimplements framework infrastructure. This document
> is (1) the composition doctrine and (2) the concrete contract — which
> `@streetjs/*` packages StreetStudio must consume and the API surface each must
> expose — so StreetJS can be built/published against it (promotion-first,
> ADR-0011).

> **Status (factual).** As of writing, the only published/referenced StreetJS
> package is `@streetjs/core@^0.1.0`, declared as an *optional* peer. Every other
> package below is **not yet published**. Per the doctrine's own rule, the
> capabilities that depend on them are **paused and recorded here**, not
> reimplemented in StreetStudio. The composition examples are the *target*
> wiring; they are intentionally not runnable until the packages exist.

## Never duplicate (build in StreetJS, consume here)

StreetStudio must not implement any of: HTTP framework, router, DI container,
authentication, authorization, database abstraction, storage abstraction, cache,
queue, realtime runtime, plugin runtime, configuration framework, scheduler,
metrics, health, events. If one is missing from StreetJS → stop, record the
package below, and wait.

## Target composition (once packages are published)

```ts
// apps/api — product composition of framework modules.
const app = new Application();          // @streetjs/core / @streetjs/runtime
app.use(ConfigModule);                  // @streetjs/config
app.use(HttpModule);                    // @streetjs/http
app.use(DatabaseModule);                // @streetjs/database
app.use(CacheModule);                   // @streetjs/cache
app.use(AuthModule);                    // @streetjs/auth
app.use(RbacModule);                    // @streetjs/rbac
app.use(StorageModule);                 // @streetjs/storage
app.use(QueueModule);                   // @streetjs/queue
app.use(EventsModule);                  // @streetjs/events
app.use(MediaModule);                   // @streetjs/media
app.use(RealtimeModule);                // @streetjs/realtime
app.use(SearchModule);                  // @streetjs/search
app.use(PluginsModule);                 // @streetjs/plugins
app.use(MetricsModule);                 // @streetjs/metrics
app.use(HealthModule);                  // @streetjs/health

// Product services depend on framework services (constructor injection).
class RecordingService {
  constructor(
    private readonly storage: StorageService,     // @streetjs/storage
    private readonly media: MediaService,          // @streetjs/media
    private readonly database: DatabaseService,    // @streetjs/database
    private readonly realtime: RealtimeService,    // @streetjs/realtime
  ) {}
}
```

## Required packages & the API surface StreetStudio consumes

Each row is a promotion target: the capability StreetStudio needs, the package
that must provide it, and the specific surface. "Status" tracks publication.

| `@streetjs/*` package | Capability StreetStudio composes | Required API surface (minimum) | Status |
| --------------------- | -------------------------------- | ------------------------------ | ------ |
| `core` / `runtime` | Application container + DI + module lifecycle | `Application`, `Module`, provider registration, lifecycle hooks | `core@^0.1.0` (optional peer); runtime not published |
| `config` | Typed config loading + startup validation | schema-validated load; fail-fast naming every invalid value | Not published |
| `http` | HTTP server, routing, middleware pipeline | router, request/response, middleware ordering, error mapping | Not published |
| `auth` | Sessions, tokens, password hashing, API keys | Argon2id hashing, session issue/verify/invalidate, JWT, hashed API keys, refresh tokens | Not published |
| `rbac` | Authorization decisions | role/permission model, deny-by-default `authorize(subject, action, resource)` | Not published |
| `database` | PostgreSQL access, migrations, transactions | connection, migrations, transactional unit-of-work, typed queries/repos | Not published |
| `cache` | Redis-backed cache | get/set/ttl/invalidate, namespacing | Not published |
| `queue` | Background jobs | enqueue, worker, retry/backoff, dead-letter | Not published |
| `events` | In-process / distributed events | publish/subscribe, typed event contracts | Not published |
| `storage` | Object storage abstraction | `StorageProvider` (put/get/delete/signed URLs), multi-provider | Not published |
| `media` | Transcode / thumbnails / previews / HLS | FFmpeg-backed pipeline, rendition outputs, metadata | Not published |
| `realtime` | WebSocket runtime | connection lifecycle, presence, rooms/fan-out, typing | Not published |
| `search` | Indexing + query | index documents, authorized query, transcript search | Not published |
| `plugins` | Plugin runtime | dynamic load, isolation, lifecycle, config validation | Not published |
| `integrations` | Integration framework | provider contract, registry, credential handling | Not published |
| `metrics` | Metrics/telemetry | counters/gauges/histograms, OpenTelemetry/Prometheus export | Not published |
| `security` | Security defaults | rate limiting, secret encryption, non-disclosing errors | Not published |
| `health` | Health/readiness | dependency-reachability checks, health endpoints | Not published |

## StreetStudio's own responsibilities (product, not framework)

These compose the packages above and are where StreetStudio adds value:
organizations, teams, projects, folders, workspaces, recordings, uploads, media
library, comments, reactions, mentions, sharing, permissions (product policy on
top of `rbac`), notifications, dashboard, recorder, browser extension, desktop
app, timeline, editor, player, SDK composition, UI, and workflows.

## Decision rule

- Could any StreetJS app benefit from it? → It belongs in **StreetJS**; add/extend
  a `@streetjs/*` package, publish, then consume.
- Is it specific to the StreetStudio product/UX? → It belongs in **StreetStudio**.
- Is the needed `@streetjs/*` package unpublished? → **Stop, record it in the
  table above, and pause that feature.** Do not reimplement it here.
