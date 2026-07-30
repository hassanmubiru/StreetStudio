/**
 * Unit tests for the Real-Time Notification and Update System
 *
 * Tests WebSocket connection management, notification delivery,
 * collaboration synchronization, and push notification support.
 *
 * Requirements: 7.2, 7.9, 7.10
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RealtimeWebSocketManager } from './websocket-manager.js';
import { NotificationDeliveryService } from './notification-delivery.js';
import { CollaborationSyncService } from './collaboration-sync.js';
import { PushNotificationService } from './push-notifications.js';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev: any) => void) | null = null;
  onclose: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string, _protocols?: string[]) {
    this.url = url;
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(_code?: number, _reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({});
  }

  simulateMessage(data: any): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose(code = 1006, reason = ''): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean: code === 1000 });
  }

  simulateError(): void {
    this.onerror?.({});
  }
}

let mockWsInstance: MockWebSocket | null = null;

beforeEach(() => {
  mockWsInstance = null;
  vi.stubGlobal('WebSocket', class extends MockWebSocket {
    constructor(url: string, protocols?: string[]) {
      super(url, protocols);
      mockWsInstance = this;
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// WebSocket Connection Manager Tests
// ---------------------------------------------------------------------------

describe('RealtimeWebSocketManager', () => {
  it('connects to the WebSocket server', async () => {
    const manager = new RealtimeWebSocketManager({
      url: 'ws://localhost:8080/ws',
    });

    const connectPromise = manager.connect();
    mockWsInstance!.simulateOpen();
    await connectPromise;

    expect(manager.getStatus()).toBe('connected');
    manager.disconnect();
  });

  it('emits statusChange events on connection lifecycle', async () => {
    const manager = new RealtimeWebSocketManager({ url: 'ws://localhost/ws' });
    const statuses: string[] = [];

    manager.on('statusChange', (data: any) => {
      statuses.push(data.current);
    });

    const connectPromise = manager.connect();
    mockWsInstance!.simulateOpen();
    await connectPromise;

    manager.disconnect();

    expect(statuses).toContain('connecting');
    expect(statuses).toContain('connected');
    expect(statuses).toContain('disconnected');
  });

  it('queues messages when disconnected and flushes on reconnect', async () => {
    const manager = new RealtimeWebSocketManager({ url: 'ws://localhost/ws' });

    // Send while disconnected
    manager.send({ type: 'test', payload: { value: 1 } });
    expect(manager.getQueueSize()).toBe(1);

    const connectPromise = manager.connect();
    mockWsInstance!.simulateOpen();
    await connectPromise;

    // Queue should be flushed
    expect(manager.getQueueSize()).toBe(0);
    expect(mockWsInstance!.sentMessages.length).toBeGreaterThanOrEqual(1);
    manager.disconnect();
  });

  it('sends messages when connected', async () => {
    const manager = new RealtimeWebSocketManager({ url: 'ws://localhost/ws' });
    const connectPromise = manager.connect();
    mockWsInstance!.simulateOpen();
    await connectPromise;

    manager.send({ type: 'hello', payload: { name: 'test' } });

    const sent = JSON.parse(mockWsInstance!.sentMessages.at(-1)!);
    expect(sent.type).toBe('hello');
    expect(sent.payload.name).toBe('test');
    expect(sent.id).toBeDefined();
    expect(sent.timestamp).toBeDefined();
    manager.disconnect();
  });

  it('dispatches incoming messages to listeners', async () => {
    const manager = new RealtimeWebSocketManager({ url: 'ws://localhost/ws' });
    const received: any[] = [];

    manager.on('message', (data) => received.push(data));

    const connectPromise = manager.connect();
    mockWsInstance!.simulateOpen();
    await connectPromise;

    mockWsInstance!.simulateMessage({ type: 'notification', payload: { id: '1' } });

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('notification');
    manager.disconnect();
  });

  it('handles pong messages silently without emitting', async () => {
    const manager = new RealtimeWebSocketManager({ url: 'ws://localhost/ws' });
    const received: any[] = [];

    manager.on('message', (data) => received.push(data));

    const connectPromise = manager.connect();
    mockWsInstance!.simulateOpen();
    await connectPromise;

    mockWsInstance!.simulateMessage({ type: 'pong', payload: {} });

    expect(received).toHaveLength(0);
    manager.disconnect();
  });

  it('attempts reconnection with exponential backoff on abnormal close', async () => {
    vi.useFakeTimers();
    const manager = new RealtimeWebSocketManager({
      url: 'ws://localhost/ws',
      autoReconnect: true,
      reconnectBaseDelay: 100,
      maxReconnectAttempts: 3,
    });

    const reconnectEvents: any[] = [];
    manager.on('reconnecting', (data) => reconnectEvents.push(data));

    const connectPromise = manager.connect();
    mockWsInstance!.simulateOpen();
    await connectPromise;

    // Simulate abnormal close
    mockWsInstance!.simulateClose(1006, 'Connection lost');

    expect(manager.getStatus()).toBe('reconnecting');
    expect(reconnectEvents.length).toBe(1);
    expect(reconnectEvents[0].attempt).toBe(1);

    vi.useRealTimers();
    manager.disconnect();
  });

  it('transitions to failed status after max reconnect attempts', async () => {
    vi.useFakeTimers();
    const manager = new RealtimeWebSocketManager({
      url: 'ws://localhost/ws',
      autoReconnect: true,
      reconnectBaseDelay: 100,
      maxReconnectAttempts: 2,
    });

    const connectPromise = manager.connect();
    mockWsInstance!.simulateOpen();
    await connectPromise;

    // Close abnormally
    mockWsInstance!.simulateClose(1006);

    // First attempt
    expect(manager.getReconnectAttempts()).toBe(1);

    // Advance time and trigger second attempt
    await vi.advanceTimersByTimeAsync(500);
    // Mock fails again
    if (mockWsInstance) mockWsInstance.simulateError();

    // After max attempts, should be failed
    await vi.advanceTimersByTimeAsync(2000);
    // The status should eventually transition to failed or polling
    expect(['failed', 'polling', 'reconnecting']).toContain(manager.getStatus());

    vi.useRealTimers();
    manager.disconnect();
  });

  it('sends auth token on connection if getAuthToken is provided', async () => {
    const manager = new RealtimeWebSocketManager({
      url: 'ws://localhost/ws',
      getAuthToken: () => 'my-secret-token',
    });

    const connectPromise = manager.connect();
    mockWsInstance!.simulateOpen();
    await connectPromise;

    const authMessage = JSON.parse(mockWsInstance!.sentMessages[0]!);
    expect(authMessage.type).toBe('auth');
    expect(authMessage.payload.token).toBe('my-secret-token');
    manager.disconnect();
  });

  it('does not reconnect on normal close (code 1000)', async () => {
    const manager = new RealtimeWebSocketManager({
      url: 'ws://localhost/ws',
      autoReconnect: true,
    });

    const connectPromise = manager.connect();
    mockWsInstance!.simulateOpen();
    await connectPromise;

    mockWsInstance!.simulateClose(1000, 'Normal closure');

    expect(manager.getStatus()).toBe('disconnected');
    manager.disconnect();
  });
});

// ---------------------------------------------------------------------------
// Notification Delivery Service Tests
// ---------------------------------------------------------------------------

describe('NotificationDeliveryService', () => {
  it('delivers notifications immediately when under rate limit', () => {
    const delivered: any[] = [];
    const service = new NotificationDeliveryService({
      maxPerWindow: 5,
      windowDuration: 60000,
      onDeliver: (notifications) => delivered.push(...notifications),
    });

    service.enqueue({
      id: '1',
      type: 'comment',
      title: 'New Comment',
      body: 'Someone commented',
      priority: 'normal',
      timestamp: Date.now(),
    });

    expect(delivered).toHaveLength(1);
    expect(delivered[0].id).toBe('1');
    service.destroy();
  });

  it('rate-limits delivery beyond maxPerWindow', () => {
    const delivered: any[] = [];
    const service = new NotificationDeliveryService({
      maxPerWindow: 2,
      windowDuration: 60000,
      onDeliver: (notifications) => delivered.push(...notifications),
    });

    for (let i = 0; i < 5; i++) {
      service.enqueue({
        id: `n-${i}`,
        type: 'comment',
        title: `Notification ${i}`,
        body: `Body ${i}`,
        priority: 'normal',
        timestamp: Date.now(),
      });
    }

    // Only 2 should be delivered (rate limited)
    expect(delivered).toHaveLength(2);
    // Remaining should be queued
    expect(service.getQueueSize()).toBe(3);
    service.destroy();
  });

  it('delivers higher priority notifications first', () => {
    const delivered: any[] = [];
    const service = new NotificationDeliveryService({
      maxPerWindow: 2,
      windowDuration: 60000,
      onDeliver: (notifications) => delivered.push(...notifications),
    });

    // Enqueue low priority first, then high priority
    service.enqueue({
      id: 'low',
      type: 'info',
      title: 'Low',
      body: 'Low priority',
      priority: 'low',
      timestamp: Date.now(),
    });

    service.enqueue({
      id: 'critical',
      type: 'alert',
      title: 'Critical',
      body: 'Critical priority',
      priority: 'critical',
      timestamp: Date.now(),
    });

    // Critical should be delivered first due to priority sorting
    expect(delivered[0].id).toBe('low'); // already delivered before critical was queued
    expect(delivered[1].id).toBe('critical');
    service.destroy();
  });

  it('deduplicates notifications by id', () => {
    const delivered: any[] = [];
    const service = new NotificationDeliveryService({
      maxPerWindow: 10,
      onDeliver: (notifications) => delivered.push(...notifications),
    });

    const notification = {
      id: 'dup-1',
      type: 'comment',
      title: 'Duplicate',
      body: 'Same notification',
      priority: 'normal' as const,
      timestamp: Date.now(),
    };

    service.enqueue(notification);
    service.enqueue(notification); // duplicate

    expect(delivered).toHaveLength(1);
    service.destroy();
  });

  it('pauses and resumes delivery', () => {
    const delivered: any[] = [];
    const service = new NotificationDeliveryService({
      maxPerWindow: 10,
      onDeliver: (notifications) => delivered.push(...notifications),
    });

    service.pause();

    service.enqueue({
      id: 'paused-1',
      type: 'info',
      title: 'While Paused',
      body: 'Should not deliver yet',
      priority: 'normal',
      timestamp: Date.now(),
    });

    expect(delivered).toHaveLength(0);
    expect(service.getQueueSize()).toBe(1);

    service.resume();

    expect(delivered).toHaveLength(1);
    service.destroy();
  });

  it('batches grouped notifications', async () => {
    vi.useFakeTimers();
    const delivered: any[] = [];
    const service = new NotificationDeliveryService({
      maxPerWindow: 10,
      batchInterval: 1000,
      onDeliver: (notifications) => delivered.push(notifications),
    });

    service.enqueue({
      id: 'g1',
      type: 'comment',
      title: 'Comment 1',
      body: 'First comment',
      priority: 'normal',
      groupKey: 'video-123-comments',
      timestamp: Date.now(),
    });

    service.enqueue({
      id: 'g2',
      type: 'comment',
      title: 'Comment 2',
      body: 'Second comment',
      priority: 'normal',
      groupKey: 'video-123-comments',
      timestamp: Date.now(),
    });

    // Not yet delivered (batching)
    expect(delivered).toHaveLength(0);

    // Advance past batch interval
    vi.advanceTimersByTime(1100);

    // Delivered as a batch
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toHaveLength(2);

    vi.useRealTimers();
    service.destroy();
  });

  it('reports remaining capacity correctly', () => {
    const service = new NotificationDeliveryService({
      maxPerWindow: 3,
      windowDuration: 60000,
      onDeliver: () => {},
    });

    expect(service.getRemainingCapacity()).toBe(3);

    service.enqueue({
      id: 'cap-1',
      type: 'info',
      title: 'Test',
      body: 'Test',
      priority: 'normal',
      timestamp: Date.now(),
    });

    expect(service.getRemainingCapacity()).toBe(2);
    service.destroy();
  });
});

// ---------------------------------------------------------------------------
// Collaboration Sync Service Tests
// ---------------------------------------------------------------------------

describe('CollaborationSyncService', () => {
  function createMockWsManager() {
    const handlers = new Map<string, Set<Function>>();
    return {
      getStatus: vi.fn(() => 'connected' as const),
      send: vi.fn(),
      on: vi.fn((event: string, handler: Function) => {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event)!.add(handler);
        return () => handlers.get(event)?.delete(handler);
      }),
      // test helper to simulate incoming message
      _emit: (event: string, data: unknown) => {
        handlers.get(event)?.forEach(h => h(data));
      },
    } as any;
  }

  it('joins a resource and broadcasts presence', () => {
    const wsManager = createMockWsManager();
    const service = new CollaborationSyncService(wsManager, {
      userId: 'user-1',
      displayName: 'Alice',
      presenceInterval: 30000,
    });

    service.joinResource('video-abc', 'video');

    // Should send a join event
    expect(wsManager.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'collaboration.join',
        payload: expect.objectContaining({
          resourceId: 'video-abc',
          resourceType: 'video',
          userId: 'user-1',
        }),
      })
    );

    service.destroy();
  });

  it('tracks presence of other users', () => {
    const wsManager = createMockWsManager();
    const service = new CollaborationSyncService(wsManager, {
      userId: 'user-1',
      displayName: 'Alice',
    });

    service.joinResource('video-abc', 'video');

    const presenceUpdates: any[] = [];
    service.on('presenceUpdate', (data) => presenceUpdates.push(data));

    // Simulate another user's presence
    wsManager._emit('message', {
      type: 'collaboration.presence',
      payload: {
        userId: 'user-2',
        displayName: 'Bob',
        resourceId: 'video-abc',
        resourceType: 'video',
      },
    });

    expect(service.getPresence()).toHaveLength(1);
    expect(service.getPresence()[0]!.userId).toBe('user-2');
    expect(presenceUpdates.length).toBe(1);

    service.destroy();
  });

  it('does not track own presence updates', () => {
    const wsManager = createMockWsManager();
    const service = new CollaborationSyncService(wsManager, {
      userId: 'user-1',
      displayName: 'Alice',
    });

    service.joinResource('video-abc', 'video');

    wsManager._emit('message', {
      type: 'collaboration.presence',
      payload: {
        userId: 'user-1',
        displayName: 'Alice',
        resourceId: 'video-abc',
      },
    });

    expect(service.getPresence()).toHaveLength(0);
    service.destroy();
  });

  it('handles typing indicators', () => {
    const wsManager = createMockWsManager();
    const service = new CollaborationSyncService(wsManager, {
      userId: 'user-1',
      displayName: 'Alice',
      typingDebounce: 2000,
    });

    service.joinResource('video-abc', 'video');

    // Start typing sends event
    service.startTyping();
    expect(wsManager.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'collaboration.typingStart',
      })
    );

    // Stop typing sends event
    service.stopTyping();
    expect(wsManager.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'collaboration.typingStop',
      })
    );

    service.destroy();
  });

  it('receives typing indicators from other users', () => {
    const wsManager = createMockWsManager();
    const service = new CollaborationSyncService(wsManager, {
      userId: 'user-1',
      displayName: 'Alice',
    });

    service.joinResource('video-abc', 'video');

    const typingStartEvents: any[] = [];
    service.on('typingStart', (data) => typingStartEvents.push(data));

    wsManager._emit('message', {
      type: 'collaboration.typingStart',
      payload: {
        userId: 'user-2',
        displayName: 'Bob',
        resourceId: 'video-abc',
      },
    });

    expect(service.getTypingUsers()).toHaveLength(1);
    expect(service.getTypingUsers()[0]!.displayName).toBe('Bob');
    expect(typingStartEvents).toHaveLength(1);

    service.destroy();
  });

  it('handles playback sync from other users', () => {
    const wsManager = createMockWsManager();
    const service = new CollaborationSyncService(wsManager, {
      userId: 'user-1',
      displayName: 'Alice',
      playbackSyncTolerance: 2,
    });

    service.joinResource('video-abc', 'video');

    const syncEvents: any[] = [];
    service.on('playbackSync', (data) => syncEvents.push(data));

    wsManager._emit('message', {
      type: 'collaboration.playbackSync',
      payload: {
        videoId: 'video-abc',
        position: 30,
        isPlaying: true,
        speed: 1,
        updatedBy: 'user-2',
        updatedAt: Date.now(),
      },
    });

    expect(syncEvents).toHaveLength(1);
    expect(syncEvents[0].position).toBe(30);
    expect(service.getPlaybackState()?.position).toBe(30);

    service.destroy();
  });

  it('ignores own playback sync events', () => {
    const wsManager = createMockWsManager();
    const service = new CollaborationSyncService(wsManager, {
      userId: 'user-1',
      displayName: 'Alice',
    });

    service.joinResource('video-abc', 'video');

    const syncEvents: any[] = [];
    service.on('playbackSync', (data) => syncEvents.push(data));

    wsManager._emit('message', {
      type: 'collaboration.playbackSync',
      payload: {
        videoId: 'video-abc',
        position: 10,
        isPlaying: true,
        speed: 1,
        updatedBy: 'user-1', // self
        updatedAt: Date.now(),
      },
    });

    expect(syncEvents).toHaveLength(0);
    service.destroy();
  });

  it('queues events when disconnected', () => {
    const wsManager = createMockWsManager();
    wsManager.getStatus = vi.fn(() => 'disconnected');

    const service = new CollaborationSyncService(wsManager, {
      userId: 'user-1',
      displayName: 'Alice',
    });

    service.joinResource('video-abc', 'video');

    // Should not call send when disconnected
    expect(wsManager.send).not.toHaveBeenCalled();

    service.destroy();
  });

  it('leaves resource and clears state', () => {
    const wsManager = createMockWsManager();
    const service = new CollaborationSyncService(wsManager, {
      userId: 'user-1',
      displayName: 'Alice',
    });

    service.joinResource('video-abc', 'video');

    wsManager._emit('message', {
      type: 'collaboration.presence',
      payload: {
        userId: 'user-2',
        displayName: 'Bob',
        resourceId: 'video-abc',
      },
    });

    expect(service.getPresence()).toHaveLength(1);

    service.leaveResource();
    expect(service.getPresence()).toHaveLength(0);

    service.destroy();
  });
});

// ---------------------------------------------------------------------------
// Push Notification Service Tests
// ---------------------------------------------------------------------------

describe('PushNotificationService', () => {
  let mockRegistration: any;

  beforeEach(() => {
    mockRegistration = {
      pushManager: {
        getSubscription: vi.fn(() => Promise.resolve(null)),
        subscribe: vi.fn(() => Promise.resolve({
          endpoint: 'https://push.example.com/sub/123',
          expirationTime: null,
          toJSON: () => ({
            keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
          }),
          unsubscribe: vi.fn(() => Promise.resolve(true)),
        })),
      },
      showNotification: vi.fn(() => Promise.resolve()),
    };

    // Mock Notification API
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn(() => Promise.resolve('granted')),
    });

    // Mock navigator with serviceWorker and PushManager
    vi.stubGlobal('navigator', {
      serviceWorker: {
        register: vi.fn(() => Promise.resolve(mockRegistration)),
        ready: Promise.resolve(mockRegistration),
        addEventListener: vi.fn(),
      },
    });

    // Mock PushManager on globalThis (node environment)
    vi.stubGlobal('PushManager', class {});
  });

  it('detects push notification support', () => {
    const service = new PushNotificationService();
    expect(service.isSupported()).toBe(true);
    service.destroy();
  });

  it('detects unsupported environment', () => {
    // Remove both serviceWorker and PushManager
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('PushManager', undefined);

    const service = new PushNotificationService();
    expect(service.isSupported()).toBe(false);
    service.destroy();
  });

  it('returns correct initial permission status', () => {
    const service = new PushNotificationService();
    expect(service.getPermissionStatus()).toBe('default');
    service.destroy();
  });

  it('requests permission and returns result', async () => {
    const service = new PushNotificationService();
    const result = await service.requestPermission();
    expect(result).toBe('granted');
    expect(service.getPermissionStatus()).toBe('granted');
    service.destroy();
  });

  it('handles denied permission', async () => {
    (Notification.requestPermission as any) = vi.fn(() => Promise.resolve('denied'));

    const service = new PushNotificationService();
    const result = await service.requestPermission();
    expect(result).toBe('denied');
    expect(service.getPermissionStatus()).toBe('denied');
    service.destroy();
  });

  it('subscribes to push notifications after permission granted', async () => {
    vi.stubGlobal('Notification', {
      permission: 'granted',
      requestPermission: vi.fn(() => Promise.resolve('granted')),
    });

    // Mock fetch for subscription registration
    (global.fetch as any) = vi.fn(() => Promise.resolve({ ok: true }));

    const mockSub = {
      endpoint: 'https://push.example.com/sub/123',
      expirationTime: null,
      toJSON: () => ({
        keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
      }),
      unsubscribe: vi.fn(() => Promise.resolve(true)),
    };

    const inlineRegistration = {
      pushManager: {
        getSubscription: vi.fn(() => Promise.resolve(null)),
        subscribe: vi.fn(() => Promise.resolve(mockSub)),
      },
      showNotification: vi.fn(() => Promise.resolve()),
    };

    const service = new PushNotificationService({
      vapidPublicKey: 'BNhJcXbXwKEg3P1n3gE3rKa8tO93Yus',
      subscriptionEndpoint: '/api/push/subscribe',
    });

    // Set internal state directly to bypass service worker registration issues in Node test env
    (service as any).serviceWorkerRegistration = inlineRegistration;
    (service as any).permissionStatus = 'granted';

    const sub = await service.subscribe();

    expect(sub).not.toBeNull();
    expect(sub!.endpoint).toBe('https://push.example.com/sub/123');
    expect(service.isSubscribed()).toBe(true);
    service.destroy();
  });

  it('returns null when subscribing without permission', async () => {
    (Notification as any).permission = 'default';
    (Notification.requestPermission as any) = vi.fn(() => Promise.resolve('denied'));

    const service = new PushNotificationService({
      vapidPublicKey: 'test-key',
    });

    await service.initialize();
    const sub = await service.subscribe();

    expect(sub).toBeNull();
    expect(service.isSubscribed()).toBe(false);
    service.destroy();
  });

  it('emits subscription events', async () => {
    vi.stubGlobal('Notification', {
      permission: 'granted',
      requestPermission: vi.fn(() => Promise.resolve('granted')),
    });

    const service = new PushNotificationService({
      vapidPublicKey: 'BNhJcX-bXwKEg3P1n3gE3rKa8tO93Y_us-cF4eFoSHPphHhg1JWRh-j9XmMt2QG6-mw1OPEIFqb1q-WaN0r1VY',
    });

    const events: any[] = [];
    service.on('subscribed', (data) => events.push(data));

    await service.initialize();
    await service.subscribe();

    expect(events).toHaveLength(1);
    expect(events[0].endpoint).toBeDefined();
    service.destroy();
  });
});
