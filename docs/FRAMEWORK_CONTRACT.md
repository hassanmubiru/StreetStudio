# StreetStudio ⇄ StreetJS — framework contract & composition doctrine

> **Doctrine.** StreetJS provides the platform; StreetStudio provides the
> product. StreetStudio consumes StreetJS's public API and **never** reimplements
> framework infrastructure (HTTP, DI, routing, auth/sessions, RBAC, DB drivers,
> pool, repositories, migrations, cache, rate limiting, websockets, SSE, vault,
> telemetry). If a capability is missing, it is promoted into StreetJS and
> published, then consumed here (ADR-0011).

> **Status (verified against npm).** The framework is **published and real**:
> `streetjs@1.2.7` (MIT, `github.com/hassanmubiru/StreetJS`) is the main package,
> and capability meta-packages are published too (`@streetjs/database`,
> `@streetjs/storage`, `@streetjs/media`, `@streetjs/realtime`, `@streetjs/queue`,
> `@streetjs/cache`, `@streetjs/events`, `@streetjs/search`, `@streetjs/config`,
> `@streetjs/metrics`, `@streetjs/security`, `@streetjs/health`,
> `@streetjs/integrations`, plus `@streetjs/orm`, `@streetjs/cli`). `@streetjs/core`
> is a **deprecated shim** that re-exports `streetjs`.
>
> This supersedes an earlier draft of this document that assumed a granular
> `@streetjs/http` / `@streetjs/auth` / `@streetjs/rbac` / `@streetjs/runtime` /
> `@streetjs/plugins` package map. **That taxonomy does not exist** — those
> capabilities live inside `streetjs` (see the real surface below). The former
> speculative `framework-requirements/` specs were retired because the framework
> is published.

## The real StreetJS surface

`streetjs` is a batteries-included TypeScript backend framework (Node ≥ 20, ESM,
`experimentalDecorators` + `emitDecoratorMetadata`, `reflect-metadata`). Three
runtime deps: `reflect-metadata`, `ws`, `zod`.

Main entry (`streetjs`):
- App/HTTP/router/DI: `streetApp({ port, host })`, `@Controller`, `@Get`/`@Post`/…,
  `@Injectable`, `container.resolve/register`, `StreetContext` (`ctx.json(...)`),
  `app.registerController(...)`, `app.use(...)`, `app.listen()`.
- Security: `JwtService`, `RateLimiter`, `authMiddleware`, `requireRoles` (RBAC),
  AES-256-GCM sessions, scrypt vault, field-level encryption, `zod` validation.
- Realtime: `StreetWebSocketServer`, `createSse`.
- Exceptions: `NotFoundException`, `BadRequestException`, … (auto-formatted).

Tree-shakeable subpaths: `streetjs/http`, `/router`, `/database`, `/pool`,
`/repository`, `/migrations`, `/pg-ha`, `/redis-cluster`, `/cache`, `/security`,
`/session`, `/ratelimit`, `/resilience`, `/multipart`, `/sse`, `/websocket`,
`/webhook`, `/telemetry`, `/vault`, `/xss`, `/cluster`, `/exceptions`, `/cli`.

Separate published packages consumed as needed: `@streetjs/database` (meta:
`postgres`/`pool`/`schema-inspector`/`migrations`/`repository`), `@streetjs/storage`,
`@streetjs/media`, `@streetjs/realtime`, `@streetjs/queue`, `@streetjs/cache`,
`@streetjs/events`, `@streetjs/search`, `@streetjs/config`, `@streetjs/metrics`,
`@streetjs/security`, `@streetjs/health`, `@streetjs/integrations`, `@streetjs/orm`.

## Real composition example (from the framework's own docs)

```ts
import 'reflect-metadata';
import { streetApp, Injectable, Controller, Get, container } from 'streetjs';
import type { StreetContext } from 'streetjs';
import { PgPool } from 'streetjs/pool';
import { JwtService, requireRoles } from 'streetjs/security';

@Injectable()
class RecordingService {
  constructor(private readonly pool: PgPool) {}
}

@Controller('/api/recordings')
class RecordingsController {
  private readonly svc = container.resolve(RecordingService);

  @Get('/')
  async list(ctx: StreetContext): Promise<void> {
    ctx.json(await this.svc /* ... */);
  }
}

const app = streetApp({ port: 3000, host: '0.0.0.0' });
app.registerController(RecordingsController);
await app.listen();
```

## What is product (StreetStudio), not framework

StreetStudio owns the domains and their rules — organizations, teams, projects,
folders, workspaces, recordings, uploads, media library, comments, reactions,
mentions, sharing, permissions **policy** (built on `requireRoles`/RBAC),
notifications, dashboard, recorder, extension, desktop, timeline, editor, player,
SDK composition, UI, workflows. RBAC *enforcement primitives* are framework
(`requireRoles`); the *role/permission model and policy* are product.

## Decision rule

- Could any StreetJS app benefit? → belongs in **StreetJS**; promote + publish, then consume.
- Specific to the StreetStudio product/UX? → belongs in **StreetStudio**.
- Needed capability genuinely absent from the published framework? → **stop, record it, and pause** (do not reimplement framework here).

## Adoption status in this repo

The reference build currently runs behind in-memory adapter seams. Adopting the
real published framework (replace seams with `streetjs` + `@streetjs/*`) is the
productionization work tracked in [`PRODUCTIONIZATION.md`](PRODUCTIONIZATION.md).
It requires enabling decorator metadata in tsconfig, provisioning real Postgres
(and Redis/object storage) for integration tests, and reworking each package's
persistence/runtime — done slice by slice, never faked.
