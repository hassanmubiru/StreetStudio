/**
 * @streetstudio/realtime
 *
 * The Realtime_Service gateway: presence, typing, and live event fan-out over
 * StreetJS WebSockets with a Redis pub/sub backplane for cross-node delivery.
 * Consumes the notification contracts from `@streetstudio/notifications`.
 */
export const DOMAIN =
  "Realtime_Service gateway: presence, typing, and live event fan-out over StreetJS WebSockets with a Redis backplane." as const;

export {
  RealtimeGateway,
  systemTimer,
  realtimeNotificationEmitter,
  streetWebSocketTransport,
  streetRedisBackplane,
  InMemoryTransport,
  InMemoryBackplane,
  ManualTimer,
} from "./realtime.js";
export type {
  RealtimeEventType,
  RealtimeEvent,
  Audience,
  RealtimeTransport,
  RealtimeBackplane,
  Timer,
  TimerHandle,
  RealtimeGatewayDeps,
  StreetWebSocketHub,
  StreetRedisPubSub,
} from "./realtime.js";
