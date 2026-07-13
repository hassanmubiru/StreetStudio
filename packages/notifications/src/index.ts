/**
 * @streetstudio/notifications
 *
 * Public entry point for notifications and realtime event contracts delivered
 * over StreetJS WebSockets.
 */
export const DOMAIN = "Notifications and realtime event contracts." as const;

// --- Notifications (task 21.1) ---------------------------------------------
export {
  NotificationService,
  toNotificationDto,
  repositoryNotificationStore,
  repositoryNotificationPreferenceStore,
} from "./notification-service.js";
export type {
  EventRef,
  NotificationEmitter,
  NotificationServiceDeps,
  NotificationStore,
  NotificationPreferenceStore,
} from "./notification-service.js";

// --- Realtime_Service gateway (task 22.1) ----------------------------------
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
