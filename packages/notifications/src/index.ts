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

// The Realtime_Service gateway lives in `@streetstudio/realtime`; it consumes
// the notification contracts (`NotificationEmitter`, `NotificationDto`) exported
// above.
