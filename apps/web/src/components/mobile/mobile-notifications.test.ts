/**
 * Unit tests for Mobile Notifications
 * 
 * Requirements: 10.9
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MobileNotificationManager,
  urlBase64ToUint8Array,
  NotificationError,
} from './mobile-notifications.js';

// Mock PushManager
const mockPushSubscription = {
  endpoint: 'https://push.example.com/subscription/123',
  expirationTime: null,
  toJSON: () => ({
    endpoint: 'https://push.example.com/subscription/123',
    keys: {
      p256dh: 'mock-p256dh-key',
      auth: 'mock-auth-key',
    },
  }),
  unsubscribe: vi.fn().mockResolvedValue(true),
};

const mockPushManager = {
  subscribe: vi.fn().mockResolvedValue(mockPushSubscription),
  getSubscription: vi.fn().mockResolvedValue(null),
};

// Mock ServiceWorkerRegistration
const mockRegistration = {
  pushManager: mockPushManager,
  showNotification: vi.fn().mockResolvedValue(undefined),
  active: { state: 'activated' },
};

// Mock Notification class
class MockNotificationClass {
  static permission: NotificationPermission = 'default';
  static requestPermission = vi.fn().mockResolvedValue('granted');

  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  silent?: boolean;
  data?: unknown;
  onclick: ((ev: Event) => void) | null = null;
  onclose: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(title: string, options?: NotificationOptions & { data?: unknown }) {
    this.title = title;
    this.body = options?.body;
    this.icon = options?.icon;
    this.badge = options?.badge;
    this.tag = options?.tag;
    this.requireInteraction = options?.requireInteraction;
    this.silent = options?.silent ?? undefined;
    this.data = (options as any)?.data;
  }

  close() {}
}

describe('Mobile Notifications', () => {
  let manager: MobileNotificationManager;

  beforeEach(() => {
    // Set Notification as configurable so tests can override it
    Object.defineProperty(window, 'Notification', {
      value: MockNotificationClass,
      writable: true,
      configurable: true,
    });

    MockNotificationClass.permission = 'default';
    MockNotificationClass.requestPermission.mockResolvedValue('granted');
    mockPushManager.subscribe.mockClear();
    mockPushManager.getSubscription.mockClear();
    mockPushSubscription.unsubscribe.mockClear();
    mockRegistration.showNotification.mockClear();

    // Mock serviceWorker
    Object.defineProperty(navigator, 'serviceWorker', {
      writable: true,
      configurable: true,
      value: {
        register: vi.fn().mockResolvedValue(mockRegistration),
        ready: Promise.resolve(mockRegistration),
      },
    });

    // Mock PushManager on window
    Object.defineProperty(window, 'PushManager', {
      value: {},
      writable: true,
      configurable: true,
    });

    manager = new MobileNotificationManager();
  });

  afterEach(() => {
    manager.destroy();
    // Restore Notification
    Object.defineProperty(window, 'Notification', {
      value: MockNotificationClass,
      writable: true,
      configurable: true,
    });
  });

  describe('isSupported', () => {
    it('returns true when Notification API is available', () => {
      expect(manager.isSupported()).toBe(true);
    });

    it('returns false when Notification API is not available', () => {
      Object.defineProperty(window, 'Notification', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const mgr = new MobileNotificationManager();
      expect(mgr.isSupported()).toBe(false);
    });
  });

  describe('isPushSupported', () => {
    it('returns true when PushManager and serviceWorker are available', () => {
      expect(manager.isPushSupported()).toBe(true);
    });

    it('returns false when PushManager is not available', () => {
      Object.defineProperty(window, 'PushManager', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const mgr = new MobileNotificationManager();
      expect(mgr.isPushSupported()).toBe(false);
    });
  });

  describe('getPermissionState', () => {
    it('returns "default" when permission has not been decided', () => {
      MockNotificationClass.permission = 'default';
      expect(manager.getPermissionState()).toBe('default');
    });

    it('returns "granted" when permission is granted', () => {
      MockNotificationClass.permission = 'granted';
      expect(manager.getPermissionState()).toBe('granted');
    });

    it('returns "denied" when permission is denied', () => {
      MockNotificationClass.permission = 'denied';
      expect(manager.getPermissionState()).toBe('denied');
    });

    it('returns "unsupported" when Notification API is not available', () => {
      Object.defineProperty(window, 'Notification', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const mgr = new MobileNotificationManager();
      expect(mgr.getPermissionState()).toBe('unsupported');
    });
  });

  describe('requestPermission', () => {
    it('returns "unsupported" when Notification API is not available', async () => {
      Object.defineProperty(window, 'Notification', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const mgr = new MobileNotificationManager();
      const result = await mgr.requestPermission();
      expect(result).toBe('unsupported');
    });

    it('returns current permission if already granted', async () => {
      MockNotificationClass.permission = 'granted';
      const result = await manager.requestPermission();
      expect(result).toBe('granted');
      expect(MockNotificationClass.requestPermission).not.toHaveBeenCalled();
    });

    it('returns current permission if already denied', async () => {
      MockNotificationClass.permission = 'denied';
      const result = await manager.requestPermission();
      expect(result).toBe('denied');
      expect(MockNotificationClass.requestPermission).not.toHaveBeenCalled();
    });

    it('calls Notification.requestPermission when state is default', async () => {
      MockNotificationClass.permission = 'default';
      MockNotificationClass.requestPermission.mockResolvedValue('granted');

      const result = await manager.requestPermission();
      expect(result).toBe('granted');
      expect(MockNotificationClass.requestPermission).toHaveBeenCalled();
    });
  });

  describe('registerServiceWorker', () => {
    it('registers service worker and returns registration', async () => {
      const registration = await manager.registerServiceWorker('/sw.js');
      expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js');
      expect(registration).toBe(mockRegistration);
    });

    it('uses default path when not specified', async () => {
      await manager.registerServiceWorker();
      expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/service-worker.js');
    });

    it('returns null when push is not supported', async () => {
      Object.defineProperty(window, 'PushManager', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const mgr = new MobileNotificationManager();
      const registration = await mgr.registerServiceWorker();
      expect(registration).toBeNull();
    });

    it('calls onError when registration fails', async () => {
      const onError = vi.fn();
      const mgr = new MobileNotificationManager({ onError });
      (navigator.serviceWorker.register as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Registration failed')
      );

      const registration = await mgr.registerServiceWorker();
      expect(registration).toBeNull();
      expect(onError).toHaveBeenCalledWith(expect.any(NotificationError));
    });
  });

  describe('subscribeToPush', () => {
    it('throws when service worker is not registered', async () => {
      await expect(manager.subscribeToPush()).rejects.toThrow(NotificationError);
      await expect(manager.subscribeToPush()).rejects.toThrow('Service worker must be registered');
    });

    it('throws when VAPID key is not set', async () => {
      await manager.registerServiceWorker();
      await expect(manager.subscribeToPush()).rejects.toThrow(NotificationError);
      await expect(manager.subscribeToPush()).rejects.toThrow('VAPID public key must be set');
    });

    it('returns subscription info on success', async () => {
      await manager.registerServiceWorker();
      manager.setVapidKey('test-vapid-key');
      MockNotificationClass.permission = 'default';
      MockNotificationClass.requestPermission.mockResolvedValue('granted');

      const result = await manager.subscribeToPush();

      expect(result).not.toBeNull();
      expect(result!.endpoint).toBe('https://push.example.com/subscription/123');
      expect(result!.keys.p256dh).toBe('mock-p256dh-key');
      expect(result!.keys.auth).toBe('mock-auth-key');
    });

    it('returns null when permission is denied', async () => {
      await manager.registerServiceWorker();
      manager.setVapidKey('test-vapid-key');
      MockNotificationClass.permission = 'default';
      MockNotificationClass.requestPermission.mockResolvedValue('denied');

      const result = await manager.subscribeToPush();
      expect(result).toBeNull();
    });
  });

  describe('unsubscribeFromPush', () => {
    it('returns false when service worker is not registered', async () => {
      const result = await manager.unsubscribeFromPush();
      expect(result).toBe(false);
    });

    it('returns true when already unsubscribed', async () => {
      await manager.registerServiceWorker();
      mockPushManager.getSubscription.mockResolvedValue(null);

      const result = await manager.unsubscribeFromPush();
      expect(result).toBe(true);
    });

    it('unsubscribes existing subscription', async () => {
      await manager.registerServiceWorker();
      mockPushManager.getSubscription.mockResolvedValue(mockPushSubscription);

      const result = await manager.unsubscribeFromPush();
      expect(result).toBe(true);
      expect(mockPushSubscription.unsubscribe).toHaveBeenCalled();
    });
  });

  describe('showNotification', () => {
    it('returns null when notifications are not supported', async () => {
      Object.defineProperty(window, 'Notification', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const mgr = new MobileNotificationManager();
      const result = await mgr.showNotification({ title: 'Test', body: 'Body' });
      expect(result).toBeNull();
    });

    it('returns null when permission is not granted', async () => {
      MockNotificationClass.permission = 'denied';
      const result = await manager.showNotification({ title: 'Test', body: 'Body' });
      expect(result).toBeNull();
    });

    it('uses service worker notification when available', async () => {
      MockNotificationClass.permission = 'granted';
      await manager.registerServiceWorker();

      await manager.showNotification({
        title: 'New Comment',
        body: 'Someone commented on your video',
        icon: '/icons/comment.png',
        tag: 'comment-123',
      });

      expect(mockRegistration.showNotification).toHaveBeenCalledWith('New Comment', {
        body: 'Someone commented on your video',
        icon: '/icons/comment.png',
        badge: undefined,
        image: undefined,
        tag: 'comment-123',
        requireInteraction: undefined,
        vibrate: undefined,
        data: undefined,
        actions: undefined,
        silent: undefined,
      });
    });

    it('creates standard Notification when no service worker', async () => {
      MockNotificationClass.permission = 'granted';

      const result = await manager.showNotification({
        title: 'Test',
        body: 'Test body',
      });

      // Standard notification returns a Notification instance
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Test');
    });

    it('attaches onClick handler', async () => {
      MockNotificationClass.permission = 'granted';
      const onClick = vi.fn();
      const mgr = new MobileNotificationManager({ onClick });

      const notification = await mgr.showNotification({
        title: 'Clickable',
        body: 'Click me',
        data: { videoId: '123' },
      });

      // Simulate click
      notification!.onclick?.(new Event('click'));
      expect(onClick).toHaveBeenCalledWith(notification, { videoId: '123' });
    });
  });

  describe('setEventHandler', () => {
    it('updates the event handler', async () => {
      MockNotificationClass.permission = 'granted';
      const newHandler = { onClick: vi.fn() };
      manager.setEventHandler(newHandler);

      const notification = await manager.showNotification({
        title: 'Test',
        body: 'Body',
      });

      notification!.onclick?.(new Event('click'));
      expect(newHandler.onClick).toHaveBeenCalled();
    });
  });

  describe('urlBase64ToUint8Array', () => {
    it('converts a base64 string to Uint8Array', () => {
      // "hello" in base64 is "aGVsbG8="
      const result = urlBase64ToUint8Array('aGVsbG8');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(5);
      expect(result[0]).toBe(104); // 'h'
      expect(result[1]).toBe(101); // 'e'
      expect(result[2]).toBe(108); // 'l'
      expect(result[3]).toBe(108); // 'l'
      expect(result[4]).toBe(111); // 'o'
    });

    it('handles URL-safe base64 characters', () => {
      // URL-safe base64 uses - instead of + and _ instead of /
      const urlSafe = 'dGVzdC1kYXRh'; // "test-data" without padding
      const result = urlBase64ToUint8Array(urlSafe);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it('handles strings needing padding', () => {
      // "a" in base64 is "YQ==" — test that padding is added correctly
      const result = urlBase64ToUint8Array('YQ');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result[0]).toBe(97); // 'a'
    });
  });

  describe('NotificationError', () => {
    it('has the correct name', () => {
      const error = new NotificationError('test-code', 'Test message');
      expect(error.name).toBe('NotificationError');
    });

    it('has the correct code', () => {
      const error = new NotificationError('permission-denied', 'Denied');
      expect(error.code).toBe('permission-denied');
    });

    it('is an instance of Error', () => {
      const error = new NotificationError('test', 'Test');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('destroy', () => {
    it('cleans up resources', () => {
      manager.destroy();
      // After destroy, service worker registration should be null
      // Calling methods should still work without crashing
      expect(manager.getPermissionState()).toBeDefined();
    });
  });
});
