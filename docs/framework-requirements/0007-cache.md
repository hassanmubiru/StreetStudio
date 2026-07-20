# @streetjs/cache — Redis-backed cache

- **Package:** `@streetjs/cache`
- **Consumers (StreetStudio):** rate limiting, session/read caching, ephemeral state
- **Depends on:** `@streetjs/core`, `@streetjs/config`
- **Wave:** 2 (data & I/O)

## Motivation

StreetStudio needs a shared, TTL-based cache (Redis) for cross-instance state
such as rate-limit counters and hot reads. Generic platform capability.

## Required API surface

- `CacheService`: `get`, `set(key, value, ttl?)`, `delete`, `has`, atomic `increment`/`decrement`.
- Key namespacing/prefixing per module.
- Optional typed serialization for values.
- Connection lifecycle wired to `@streetjs/health` and shutdown.

## Acceptance criteria

- [ ] Values round-trip; entries expire at their TTL.
- [ ] `increment`/`decrement` are atomic under concurrency (usable for rate limits).
- [ ] Namespaced keys never collide across modules.
- [ ] Integration tests run against a real Redis instance.

## Non-goals

- No queue semantics (see `@streetjs/queue`); no pub/sub eventing (see `@streetjs/events`).
