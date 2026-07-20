# StreetJS framework requirements (from StreetStudio)

These are **issue-ready capability specs** for the StreetJS framework, derived
from what StreetStudio needs to consume (see
[`../FRAMEWORK_CONTRACT.md`](../FRAMEWORK_CONTRACT.md)). Each file maps to one
`@streetjs/*` package and is written to be filed as a StreetJS issue/epic.

They describe the **framework capability** in generic terms (promotion-first):
nothing here is StreetStudio-specific product logic — it's platform functionality
any application could use. StreetStudio composes these once published; it must
never reimplement them (ADR-0011, production charter).

## How to file

1. Create one StreetJS issue per spec below (title = the spec's H1).
2. Paste the spec body; keep the acceptance-criteria checklist.
3. Label by layer (see order) and set a milestone per publish wave.

## Dependency order (suggested publish waves)

Later packages depend on earlier ones; publish roughly in this order.

| Wave | Specs | Rationale |
| ---- | ----- | --------- |
| 1 — kernel | `0001-core-runtime`, `0002-config`, `0017-security`, `0016-metrics`, `0018-health` | Container/DI, config, cross-cutting concerns everything else needs. |
| 2 — data & I/O | `0006-database`, `0007-cache`, `0009-events`, `0008-queue` | Persistence and messaging primitives. |
| 3 — web & identity | `0003-http`, `0004-auth`, `0005-rbac` | Request lifecycle and access control. |
| 4 — domain infra | `0010-storage`, `0011-media`, `0012-realtime`, `0013-search` | Media path and collaboration substrate. |
| 5 — extensibility | `0014-plugins`, `0015-integrations` | Dynamic extension model. |

## Specs

- [0001 — `@streetjs/core` + `@streetjs/runtime`](0001-core-runtime.md)
- [0002 — `@streetjs/config`](0002-config.md)
- [0003 — `@streetjs/http`](0003-http.md)
- [0004 — `@streetjs/auth`](0004-auth.md)
- [0005 — `@streetjs/rbac`](0005-rbac.md)
- [0006 — `@streetjs/database`](0006-database.md)
- [0007 — `@streetjs/cache`](0007-cache.md)
- [0008 — `@streetjs/queue`](0008-queue.md)
- [0009 — `@streetjs/events`](0009-events.md)
- [0010 — `@streetjs/storage`](0010-storage.md)
- [0011 — `@streetjs/media`](0011-media.md)
- [0012 — `@streetjs/realtime`](0012-realtime.md)
- [0013 — `@streetjs/search`](0013-search.md)
- [0014 — `@streetjs/plugins`](0014-plugins.md)
- [0015 — `@streetjs/integrations`](0015-integrations.md)
- [0016 — `@streetjs/metrics`](0016-metrics.md)
- [0017 — `@streetjs/security`](0017-security.md)
- [0018 — `@streetjs/health`](0018-health.md)

## Issue template

```md
### Capability
<one line>

### Consumers
StreetStudio: <features>

### Required API surface
- <exported types/functions/classes>

### Acceptance criteria
- [ ] <testable behavior>

### Depends on
<@streetjs/* packages>

### Non-goals
<what stays out of this package>
```
