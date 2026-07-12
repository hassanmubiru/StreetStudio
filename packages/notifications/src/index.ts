/**
 * @streetstudio/notifications
 *
 * Public entry point for notifications and realtime event contracts delivered
 * over StreetJS WebSockets.
 */
export const DOMAIN = "Notifications and realtime event contracts." as const;

/** Realtime event kinds delivered over the WebSocket gateway. */
export type RealtimeEventType =
  | "upload-progress"
  | "processing-status"
  | "live-comment"
  | "notification"
  | "presence-join"
  | "presence-leave"
  | "typing-start"
  | "typing-stop"
  | "workspace-event";

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
