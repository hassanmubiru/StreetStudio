# @streetjs/queue — background jobs & workers

- **Package:** `@streetjs/queue`
- **Consumers (StreetStudio):** media processing, webhook delivery, transcript indexing
- **Depends on:** `@streetjs/core`, `@streetjs/cache`/broker (Redis)
- **Wave:** 2 (data & I/O)

## Motivation

StreetStudio offloads long-running work (transcoding, deliveries) to background
workers with retries and backoff. Generic platform infrastructure.

## Required API surface

- `defineJob<TPayload>(name, handler)` and typed `enqueue(job, payload, opts?)`.
- Worker runtime: concurrency control, visibility timeout, graceful shutdown.
- Retry with configurable backoff and max attempts; dead-letter on exhaustion.
- Scheduled/delayed jobs (delay + optional cron) — covers the "scheduler" need.

## Acceptance criteria

- [ ] Enqueued jobs are processed exactly by one worker; concurrency is bounded by config.
- [ ] Failing jobs retry with backoff up to max attempts, then move to a dead-letter queue.
- [ ] Delayed/scheduled jobs run no earlier than their scheduled time.
- [ ] Graceful shutdown drains or requeues in-flight jobs without loss.
- [ ] Integration tests run against a real Redis/broker instance.

## Non-goals

- No media-specific logic (that composes `@streetjs/media`); no event pub/sub (see `@streetjs/events`).
