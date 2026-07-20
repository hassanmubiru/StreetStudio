# @streetjs/events — typed event bus (in-process & distributed)

- **Package:** `@streetjs/events`
- **Consumers (StreetStudio):** notifications, webhooks, analytics, realtime fan-out triggers
- **Depends on:** `@streetjs/core`, optionally `@streetjs/cache`/broker for distribution
- **Wave:** 2 (data & I/O)

## Motivation

StreetStudio reacts to domain events (video processed, comment created) to drive
notifications, webhooks, and analytics. A typed publish/subscribe bus is generic
platform infrastructure.

## Required API surface

- Typed event contracts: `defineEvent<TName, TPayload>()`.
- `EventBus`: `publish(event, payload)`, `subscribe(event, handler)`, `unsubscribe`.
- Delivery guarantees option: at-least-once with retry for distributed mode.
- Optional distributed transport (Redis/broker) with an in-process default.

## Acceptance criteria

- [ ] Publishing delivers to all current subscribers with the correct payload type.
- [ ] Handler errors are isolated (one failing subscriber doesn't block others) and observable.
- [ ] Distributed mode delivers across instances at least once; duplicates are detectable via event id.
- [ ] Unsubscribed handlers receive no further events.

## Non-goals

- No durable job execution/backoff (that is `@streetjs/queue`).
