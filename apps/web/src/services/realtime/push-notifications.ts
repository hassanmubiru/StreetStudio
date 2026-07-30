/**
 * Push Notification Support
 *
 * Provides:
 * - Permission request flow with user-friendly prompts
 * - Push subscription management (subscribe/unsubscribe)
 * - Service worker integration for background notifications
 * - Notification action handling
 *
 * Requirements: 7.2, 7.9, 7.10
 */

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export type PushPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

export interface PushSubscriptionInfo {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  expirationTime: number | null;
}

export interface PushNotificationOptions {
  /** VAPID public key for push subscription (base64url encoded) */
  vapidPublicKey?: string;
  /** API endpoint to register push subscriptions */
  subscriptionEndpoint?: string;
  /** Service worker registration URL (default: '/sw.js') */
  serviceWorkerUrl?: string;
  /** Auth token provider for subscription API calls */
  getAuthToken?: () => string | Promise<string>;
  /** Handler when a notification action is clicked */
  onNotificationAction?: (action: string, data: Record<string, unknown>) => void;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  actions?: Array<{ action: string; title: string; icon?: string }>;
  requireInteraction?: boolean;
}

// -------------------------------------------------------------------------
// PushNotificationService
// -------------------------------------------------------------------------

/**
 * Manages push notification permissions, subscriptions,
 * and service worker integration for background notifications.
 */
export class PushNotificationService {
  private options: PushNotificationOptions;
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
  private subscription: PushSubscription | null = null;
  private permissionStatus: PushPermissionStatus = 'default';
  private listeners = new Map<string, Set<(data: unknown) => void>>();

  constructor(options: PushNotificationOptions = {}) {
    this.options = {
      serviceWorkerUrl: '/sw.js',
      ...options,
    };
    this.detectPermissionStatus();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Initialize the push notification system.
   * Registers the service worker and checks existing subscription.
   */
  public async initialize(): Promise<void> {
    if (!this.isSupported()) {
      this.permissionStatus = 'unsupported';
      return;
    }

    try {
      this.serviceWorkerRegistration = await navigator.serviceWorker.register(
        this.options.serviceWorkerUrl!
      );

      // Wait for the service worker to be ready
      await navigator.serviceWorker.ready;

      // Check existing subscription
      this.subscription = await this.serviceWorkerRegistration.pushManager.getSubscription();

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        this.handleServiceWorkerMessage(event);
      });
    } catch {
      // Service worker registration failed — push won't work but app continues
      this.permissionStatus = 'unsupported';
    }
  }

  /**
   * Request push notification permission from the user.
   * Returns the resulting permission status.
   */
  public async requestPermission(): Promise<PushPermissionStatus> {
    if (!this.isSupported()) {
      return 'unsupported';
    }

    try {
      const permission = await Notification.requestPermission();
      this.permissionStatus = permission as PushPermissionStatus;
      return this.permissionStatus;
    } catch {
      this.permissionStatus = 'denied';
      return 'denied';
    }
  }

  /**
   * Subscribe to push notifications.
   * Requires permission to be granted first.
   */
  public async subscribe(): Promise<PushSubscriptionInfo | null> {
    if (this.permissionStatus !== 'granted') {
      const permission = await this.requestPermission();
      if (permission !== 'granted') return null;
    }

    if (!this.serviceWorkerRegistration || !this.options.vapidPublicKey) {
      return null;
    }

    try {
      const applicationServerKey = urlBase64ToUint8Array(this.options.vapidPublicKey);

      this.subscription = await this.serviceWorkerRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      const subscriptionInfo = this.serializeSubscription(this.subscription);

      // Register subscription with backend
      await this.registerSubscriptionWithBackend(subscriptionInfo);

      this.emit('subscribed', subscriptionInfo);
      return subscriptionInfo;
    } catch {
      return null;
    }
  }

  /**
   * Unsubscribe from push notifications.
   */
  public async unsubscribe(): Promise<boolean> {
    if (!this.subscription) return true;

    try {
      const success = await this.subscription.unsubscribe();

      if (success) {
        // Notify backend to remove subscription
        await this.removeSubscriptionFromBackend();
        this.subscription = null;
        this.emit('unsubscribed', null);
      }

      return success;
    } catch {
      return false;
    }
  }

  /**
   * Get the current permission status.
   */
  public getPermissionStatus(): PushPermissionStatus {
    return this.permissionStatus;
  }

  /**
   * Check if push notifications are supported in this browser.
   */
  public isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      typeof PushManager !== 'undefined' &&
      typeof Notification !== 'undefined'
    );
  }

  /**
   * Check if currently subscribed to push notifications.
   */
  public isSubscribed(): boolean {
    return this.subscription !== null;
  }

  /**
   * Get current subscription info (if subscribed).
   */
  public getSubscription(): PushSubscriptionInfo | null {
    if (!this.subscription) return null;
    return this.serializeSubscription(this.subscription);
  }

  /**
   * Show a local notification (not via push, but via Notification API).
   * Useful for in-app notification display when push isn't available.
   */
  public async showLocalNotification(payload: PushNotificationPayload): Promise<void> {
    if (this.permissionStatus !== 'granted') return;

    if (this.serviceWorkerRegistration) {
      // Use service worker for richer notification support
      await this.serviceWorkerRegistration.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon || '/icons/icon-192.png',
        badge: payload.badge || '/icons/badge-72.png',
        tag: payload.tag,
        data: payload.data,
        actions: payload.actions,
        requireInteraction: payload.requireInteraction,
      });
    } else if ('Notification' in window) {
      // Fallback to basic Notification API
      new Notification(payload.title, {
        body: payload.body,
        icon: payload.icon || '/icons/icon-192.png',
        tag: payload.tag,
        data: payload.data,
      });
    }
  }

  /**
   * Subscribe to push notification events.
   */
  public on(event: string, handler: (data: unknown) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  /**
   * Clean up the service.
   */
  public destroy(): void {
    this.listeners.clear();
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private detectPermissionStatus(): void {
    if (!this.isSupported()) {
      this.permissionStatus = 'unsupported';
      return;
    }
    this.permissionStatus = Notification.permission as PushPermissionStatus;
  }

  private serializeSubscription(sub: PushSubscription): PushSubscriptionInfo {
    const json = sub.toJSON();
    return {
      endpoint: sub.endpoint,
      keys: {
        p256dh: json.keys?.p256dh || '',
        auth: json.keys?.auth || '',
      },
      expirationTime: sub.expirationTime,
    };
  }

  private async registerSubscriptionWithBackend(info: PushSubscriptionInfo): Promise<void> {
    if (!this.options.subscriptionEndpoint) return;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.options.getAuthToken) {
      const token = await this.options.getAuthToken();
      headers['Authorization'] = `Bearer ${token}`;
    }

    await fetch(this.options.subscriptionEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(info),
    });
  }

  private async removeSubscriptionFromBackend(): Promise<void> {
    if (!this.options.subscriptionEndpoint || !this.subscription) return;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.options.getAuthToken) {
      const token = await this.options.getAuthToken();
      headers['Authorization'] = `Bearer ${token}`;
    }

    await fetch(this.options.subscriptionEndpoint, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ endpoint: this.subscription.endpoint }),
    });
  }

  private handleServiceWorkerMessage(event: MessageEvent): void {
    const { type, data } = event.data || {};

    if (type === 'notification-action') {
      this.options.onNotificationAction?.(data.action, data.data || {});
      this.emit('action', { action: data.action, data: data.data });
    } else if (type === 'notification-click') {
      this.emit('click', data);
    }
  }

  private emit(event: string, data: unknown): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(data);
      } catch {
        // Don't let listener errors break the service
      }
    }
  }
}

// -------------------------------------------------------------------------
// Utilities
// -------------------------------------------------------------------------

/**
 * Convert a base64url-encoded string to a Uint8Array
 * (required for applicationServerKey in PushManager.subscribe).
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
