# @streetjs/realtime — WebSocket runtime (presence, rooms, fan-out)

- **Package:** `@streetjs/realtime`
- **Consumers (StreetStudio):** live presence, typing indicators, notification delivery, comment fan-out
- **Depends on:** `@streetjs/core`, `@streetjs/auth` (connection auth), `@streetjs/cache` (cross-instance state)
- **Wave:** 4 (domain infra)

## Motivation

StreetStudio delivers live events over WebSockets and must not build its own
socket server. The realtime runtime is generic platform infrastructure.

## Required API surface

- Connection lifecycle: authenticated connect, disconnect, reconnect handling.
- Rooms/channels with scoped membership; `broadcast(room, event)` fan-out.
- Presence tracking and typing-indicator primitives.
- Cross-instance fan-out (via cache/broker) so events reach all nodes.
- Server-side handler API integrable with `@streetjs/rbac` for authorized subscriptions.

## Acceptance criteria

- [ ] Only authenticated connections join; unauthorized subscription attempts are denied.
- [ ] Messages broadcast to a room reach exactly its current members, across instances.
- [ ] Presence reflects connect/disconnect; events for disconnected clients are dropped, not queued forever.
- [ ] Reconnecting clients resume delivery per policy without duplicate storms.

## Non-goals

- No product notification model; no HTTP routing (see `@streetjs/http`).
