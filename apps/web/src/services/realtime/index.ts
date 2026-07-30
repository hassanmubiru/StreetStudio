/**
 * Real-Time Services
 *
 * Barrel export for the notification and real-time update system.
 *
 * Requirements: 7.2, 7.9, 7.10
 */

export {
  RealtimeWebSocketManager,
  type ConnectionStatus,
  type WebSocketConnectionOptions,
  type WebSocketEvent,
  type ConnectionEventType,
  type ConnectionEventHandler,
} from './websocket-manager.js';

export {
  NotificationDeliveryService,
  type DeliveryNotification,
  type NotificationPriority,
  type NotificationDeliveryOptions,
} from './notification-delivery.js';

export {
  CollaborationSyncService,
  type PresenceUser,
  type TypingIndicator,
  type PlaybackState,
  type CollaborationSyncOptions,
  type CollaborationEventType,
  type CollaborationEventHandler,
} from './collaboration-sync.js';

export {
  PushNotificationService,
  type PushPermissionStatus,
  type PushSubscriptionInfo,
  type PushNotificationOptions,
  type PushNotificationPayload,
} from './push-notifications.js';
