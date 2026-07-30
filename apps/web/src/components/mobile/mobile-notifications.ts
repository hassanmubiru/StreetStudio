/**
 * Mobile Notifications
 * 
 * Implements mobile push notification support with permission handling,
 * notification action buttons, and subscription management.
 * Works with the browser Push API and Notification API.
 * 
 * Requirements: 10.9
 */

export interface NotificationOptions {
  /** Notification title */
  title: string;
  /** Notification body text */
  body: string;
  /** Notification icon URL */
  icon?: string;
  /** Notification badge URL (small icon) */
  badge?: string;
  /** Notification image URL (large image) */
  image?: string;
  /** Notification tag for grouping/replacing */
  tag?: string;
  /** Whether the notification requires interaction */
  requireInteraction?: boolean;
  /** Vibration pattern (array of durations in ms) */
  vibrate?: number[];
  /** Custom data attached to the notification */
  data?: Record<string, unknown>;
  /** Action buttons for the notification */
  actions?: NotificationAction[];
  /** Whether to silently display (no sound/vibration) */
  silent?: boolean;
}

export interface NotificationAction {
  /** Action identifier */
  action: string;
  /** Display text for the action button */
  title: string;
  /** Icon URL for the action button */
  icon?: string;
}

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export interface PushSubscriptionInfo {
  /** The push subscription endpoint */
  endpoint: string;
  /** The subscription expiration time */
  expirationTime: number | null;
  /** The subscription keys */
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface NotificationEventHandler {
  /** Called when a notification is clicked */
  onClick?: (notification: Notification, data?: Record<string, unknown>) => void;
  /** Called when a notification action button is clicked */
  onAction?: (action: string, notification: Notification, data?: Record<string, unknown>) => void;
  /** Called when a notification is closed */
  onClose?: (notification: Notification) => void;
  /** Called when there's a notification error */
  onError?: (error: Error) => void;
}

/**
 * MobileNotificationManager
 * 
 * Manages push notification permissions, subscription, and delivery
 * for mobile web applications.
 */
export class MobileNotificationManager {
  private eventHandler: NotificationEventHandler;
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
  private vapidPublicKey: string | null = null;

  constructor(eventHandler: NotificationEventHandler = {}) {
    this.eventHandler = eventHandler;
  }

  /**
   * Checks if notifications are supported in the current browser.
   */
  public isSupported(): boolean {
    return typeof window !== 'undefined' && !!window.Notification;
  }

  /**
   * Checks if push notifications (via service worker) are supported.
   */
  public isPushSupported(): boolean {
    return 'PushManager' in window && 'serviceWorker' in navigator;
  }

  /**
   * Gets the current notification permission state.
   */
  public getPermissionState(): NotificationPermissionState {
    if (!this.isSupported()) {
      return 'unsupported';
    }
    return Notification.permission as NotificationPermissionState;
  }

  /**
   * Requests notification permission from the user.
   * Returns the resulting permission state.
   */
  public async requestPermission(): Promise<NotificationPermissionState> {
    if (!this.isSupported()) {
      return 'unsupported';
    }

    // Already determined
    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
      return Notification.permission as NotificationPermissionState;
    }

    try {
      const result = await Notification.requestPermission();
      return result as NotificationPermissionState;
    } catch {
      // Fallback for older browsers using callback-based API
      return new Promise((resolve) => {
        Notification.requestPermission((result) => {
          resolve(result as NotificationPermissionState);
        });
      });
    }
  }

  /**
   * Sets the VAPID public key for push subscription.
   */
  public setVapidKey(key: string): void {
    this.vapidPublicKey = key;
  }

  /**
   * Registers the service worker for push notifications.
   */
  public async registerServiceWorker(
    swUrl: string = '/service-worker.js'
  ): Promise<ServiceWorkerRegistration | null> {
    if (!this.isPushSupported()) {
      return null;
    }

    try {
      this.serviceWorkerRegistration = await navigator.serviceWorker.register(swUrl);
      await navigator.serviceWorker.ready;
      return this.serviceWorkerRegistration;
    } catch (error) {
      this.eventHandler.onError?.(
        new NotificationError('sw-registration-failed', `Service worker registration failed: ${(error as Error).message}`)
      );
      return null;
    }
  }

  /**
   * Subscribes to push notifications.
   * Returns subscription info to send to the server.
   */
  public async subscribeToPush(): Promise<PushSubscriptionInfo | null> {
    if (!this.serviceWorkerRegistration) {
      throw new NotificationError(
        'no-service-worker',
        'Service worker must be registered before subscribing to push.'
      );
    }

    if (!this.vapidPublicKey) {
      throw new NotificationError(
        'no-vapid-key',
        'VAPID public key must be set before subscribing to push.'
      );
    }

    const permission = await this.requestPermission();
    if (permission !== 'granted') {
      return null;
    }

    try {
      const subscription = await this.serviceWorkerRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(this.vapidPublicKey),
      });

      const subscriptionJson = subscription.toJSON();
      return {
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime,
        keys: {
          p256dh: subscriptionJson.keys?.p256dh ?? '',
          auth: subscriptionJson.keys?.auth ?? '',
        },
      };
    } catch (error) {
      this.eventHandler.onError?.(
        new NotificationError('subscription-failed', `Push subscription failed: ${(error as Error).message}`)
      );
      return null;
    }
  }

  /**
   * Unsubscribes from push notifications.
   */
  public async unsubscribeFromPush(): Promise<boolean> {
    if (!this.serviceWorkerRegistration) {
      return false;
    }

    try {
      const subscription = await this.serviceWorkerRegistration.pushManager.getSubscription();
      if (subscription) {
        return await subscription.unsubscribe();
      }
      return true; // Already unsubscribed
    } catch (error) {
      this.eventHandler.onError?.(
        new NotificationError('unsubscribe-failed', `Push unsubscription failed: ${(error as Error).message}`)
      );
      return false;
    }
  }

  /**
   * Gets the current push subscription, if any.
   */
  public async getCurrentSubscription(): Promise<PushSubscription | null> {
    if (!this.serviceWorkerRegistration) {
      return null;
    }

    try {
      return await this.serviceWorkerRegistration.pushManager.getSubscription();
    } catch {
      return null;
    }
  }

  /**
   * Shows a local notification (not push).
   * Useful for in-app notifications that should also appear in the system tray.
   */
  public async showNotification(options: NotificationOptions): Promise<Notification | null> {
    if (!this.isSupported()) {
      return null;
    }

    const permission = this.getPermissionState();
    if (permission !== 'granted') {
      return null;
    }

    try {
      // If service worker is available, use it for richer notification support
      if (this.serviceWorkerRegistration) {
        await this.serviceWorkerRegistration.showNotification(options.title, {
          body: options.body,
          icon: options.icon,
          badge: options.badge,
          image: options.image,
          tag: options.tag,
          requireInteraction: options.requireInteraction,
          vibrate: options.vibrate,
          data: options.data,
          actions: options.actions,
          silent: options.silent,
        });
        return null; // SW notifications don't return a Notification object
      }

      // Fallback to standard Notification API
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon,
        badge: options.badge,
        tag: options.tag,
        requireInteraction: options.requireInteraction,
        silent: options.silent,
        data: options.data,
      });

      notification.onclick = () => {
        this.eventHandler.onClick?.(notification, options.data);
      };

      notification.onclose = () => {
        this.eventHandler.onClose?.(notification);
      };

      notification.onerror = () => {
        this.eventHandler.onError?.(
          new NotificationError('display-failed', 'Failed to display notification.')
        );
      };

      return notification;
    } catch (error) {
      this.eventHandler.onError?.(
        new NotificationError('show-failed', `Failed to show notification: ${(error as Error).message}`)
      );
      return null;
    }
  }

  /**
   * Updates the event handler for notifications.
   */
  public setEventHandler(handler: NotificationEventHandler): void {
    this.eventHandler = handler;
  }

  /**
   * Cleans up resources. Call when the notification manager is no longer needed.
   */
  public destroy(): void {
    this.serviceWorkerRegistration = null;
    this.eventHandler = {};
  }
}

/**
 * Converts a URL-safe base64 string to a Uint8Array.
 * Used for converting VAPID public keys.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

/**
 * Custom error class for notification-related errors.
 */
export class NotificationError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'NotificationError';
    this.code = code;
  }
}
