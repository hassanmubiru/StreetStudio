/**
 * Offline Capabilities Tests
 * 
 * Tests for service worker registration, offline content cache,
 * offline comment queue, and connectivity status monitoring.
 * 
 * Requirements: 10.7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// === Service Worker Registration Tests ===

describe('ServiceWorkerManager', () => {
  let ServiceWorkerManager: any;

  beforeEach(async () => {
    // Mock navigator.serviceWorker
    const mockRegistration = {
      active: { state: 'activated' },
      waiting: null,
      installing: null,
      addEventListener: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      unregister: vi.fn().mockResolvedValue(true),
    };

    Object.defineProperty(navigator, 'serviceWorker', {
      writable: true,
      configurable: true,
      value: {
        register: vi.fn().mockResolvedValue(mockRegistration),
        ready: Promise.resolve(mockRegistration),
        controller: { postMessage: vi.fn() },
        addEventListener: vi.fn(),
      },
    });

    const mod = await import('./service-worker-registration.js');
    ServiceWorkerManager = mod.ServiceWorkerManager;
  });

  it('should report supported when serviceWorker is available', () => {
    const manager = new ServiceWorkerManager();
    const status = manager.getStatus();
    expect(status.isSupported).toBe(true);
  });

  it('should report not supported when serviceWorker is unavailable', () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    const manager = new ServiceWorkerManager();
    const status = manager.getStatus();
    expect(status.isSupported).toBe(false);
  });

  it('should register successfully and update status', async () => {
    const manager = new ServiceWorkerManager();
    const status = await manager.register();
    expect(status.isRegistered).toBe(true);
    expect(status.isActive).toBe(true);
  });

  it('should call onRegistered callback after successful registration', async () => {
    const onRegistered = vi.fn();
    const manager = new ServiceWorkerManager({ callbacks: { onRegistered } });
    await manager.register();
    expect(onRegistered).toHaveBeenCalled();
  });

  it('should handle registration error gracefully', async () => {
    const error = new Error('Registration failed');
    (navigator.serviceWorker.register as any).mockRejectedValueOnce(error);
    const onError = vi.fn();
    const manager = new ServiceWorkerManager({ callbacks: { onError } });
    const status = await manager.register();
    expect(status.isRegistered).toBe(false);
    expect(status.error).toBe('Registration failed');
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('should post messages to active service worker', async () => {
    const manager = new ServiceWorkerManager();
    await manager.register();
    manager.postMessage({ type: 'TEST_MESSAGE' });
    expect(navigator.serviceWorker.controller!.postMessage).toHaveBeenCalledWith({
      type: 'TEST_MESSAGE',
    });
  });

  it('should unregister service worker', async () => {
    const manager = new ServiceWorkerManager();
    await manager.register();
    const result = await manager.unregister();
    expect(result).toBe(true);
    const status = manager.getStatus();
    expect(status.isRegistered).toBe(false);
  });

  it('should return error status when not supported', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    const manager = new ServiceWorkerManager();
    const status = await manager.register();
    expect(status.isRegistered).toBe(false);
    expect(status.error).toContain('not supported');
  });
});

// === Connectivity Status Tests ===

describe('ConnectivityStatusManager', () => {
  let ConnectivityStatusManager: any;

  beforeEach(async () => {
    // Reset navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      configurable: true,
      value: true,
    });

    // Mock fetch for ping
    (global.fetch as any).mockResolvedValue({ ok: true, status: 200 });

    const mod = await import('./connectivity-status.js');
    ConnectivityStatusManager = mod.ConnectivityStatusManager;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should report online when navigator.onLine is true', () => {
    const manager = new ConnectivityStatusManager();
    expect(manager.isOnline()).toBe(true);
    expect(manager.getState()).toBe('online');
  });

  it('should report offline when navigator.onLine is false', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      configurable: true,
      value: false,
    });
    const manager = new ConnectivityStatusManager();
    expect(manager.isOnline()).toBe(false);
    expect(manager.getState()).toBe('offline');
  });

  it('should call onOffline callback when going offline', () => {
    const onOffline = vi.fn();
    const manager = new ConnectivityStatusManager({ callbacks: { onOffline } });
    manager.start();
    // Simulate going offline
    window.dispatchEvent(new Event('offline'));
    expect(onOffline).toHaveBeenCalled();
    manager.destroy();
  });

  it('should show offline banner when showBanner is true', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      configurable: true,
      value: false,
    });
    const manager = new ConnectivityStatusManager({ showBanner: true });
    manager.start();
    const banner = document.querySelector('[data-testid="offline-banner"]');
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute('role')).toBe('alert');
    manager.destroy();
  });

  it('should not show banner when showBanner is false', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      configurable: true,
      value: false,
    });
    const manager = new ConnectivityStatusManager({ showBanner: false });
    manager.start();
    const banner = document.querySelector('[data-testid="offline-banner"]');
    expect(banner).toBeNull();
    manager.destroy();
  });

  it('should return connectivity info with getInfo', () => {
    const manager = new ConnectivityStatusManager();
    const info = manager.getInfo();
    expect(info).toHaveProperty('state');
    expect(info).toHaveProperty('isOnline');
    expect(info).toHaveProperty('reconnectAttempts');
    manager.destroy();
  });

  it('should clean up on destroy', () => {
    const manager = new ConnectivityStatusManager();
    manager.start();
    manager.destroy();
    // Verify no banner remains
    const banner = document.querySelector('[data-testid="offline-banner"]');
    expect(banner).toBeNull();
  });
});

// === Offline Content Cache Tests ===

describe('OfflineContentCache', () => {
  let OfflineContentCache: any;
  let mockDb: any;
  let mockStore: any;
  let mockIndex: any;

  beforeEach(async () => {
    // Create IndexedDB mock
    const entries = new Map<string, any>();

    mockIndex = {
      getAll: vi.fn((key?: any) => {
        const results = Array.from(entries.values()).filter((e) =>
          key ? e.type === key : true
        );
        return { result: results, onsuccess: null, onerror: null };
      }),
      openCursor: vi.fn(() => ({
        result: null,
        onsuccess: null,
        onerror: null,
      })),
    };

    mockStore = {
      put: vi.fn((entry: any) => {
        entries.set(entry.id, entry);
        return { onsuccess: null, onerror: null };
      }),
      get: vi.fn((id: string) => ({
        result: entries.get(id) || null,
        onsuccess: null,
        onerror: null,
      })),
      delete: vi.fn((id: string) => {
        entries.delete(id);
        return { onsuccess: null, onerror: null };
      }),
      clear: vi.fn(() => {
        entries.clear();
        return { onsuccess: null, onerror: null };
      }),
      getAll: vi.fn(() => ({
        result: Array.from(entries.values()),
        onsuccess: null,
        onerror: null,
      })),
      index: vi.fn(() => mockIndex),
      openCursor: vi.fn(() => ({
        result: null,
        onsuccess: null,
        onerror: null,
      })),
      createIndex: vi.fn(),
    };

    mockDb = {
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => mockStore),
      })),
      objectStoreNames: { contains: vi.fn(() => false) },
      createObjectStore: vi.fn(() => mockStore),
      close: vi.fn(),
    };

    // Mock indexedDB.open
    const mockOpen = {
      result: mockDb,
      onsuccess: null as any,
      onerror: null as any,
      onupgradeneeded: null as any,
    };

    vi.stubGlobal('indexedDB', {
      open: vi.fn(() => {
        setTimeout(() => {
          if (mockOpen.onupgradeneeded) {
            mockOpen.onupgradeneeded();
          }
          if (mockOpen.onsuccess) {
            mockOpen.onsuccess();
          }
        }, 0);
        return mockOpen;
      }),
    });

    const mod = await import('./offline-content-cache.js');
    OfflineContentCache = mod.OfflineContentCache;
  });

  it('should create an instance with default options', () => {
    const cache = new OfflineContentCache();
    expect(cache).toBeDefined();
  });

  it('should throw if indexedDB not available', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const cache = new OfflineContentCache();
    await expect(cache.initialize()).rejects.toThrow('IndexedDB is not available');
  });

  it('should expose getStats method', () => {
    const cache = new OfflineContentCache();
    expect(typeof cache.getStats).toBe('function');
  });

  it('should expose close method to clean up', () => {
    const cache = new OfflineContentCache();
    expect(typeof cache.close).toBe('function');
    cache.close(); // Should not throw
  });
});

// === Offline Comment Queue Tests ===

describe('OfflineCommentQueue', () => {
  let OfflineCommentQueue: any;
  let mockDb: any;
  let entries: Map<string, any>;
  let mockStore: any;

  beforeEach(async () => {
    entries = new Map();

    mockStore = {
      put: vi.fn((entry: any) => {
        entries.set(entry.id, entry);
        const req = { onsuccess: null as any, onerror: null as any };
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      }),
      get: vi.fn((id: string) => {
        const req = {
          result: entries.get(id) || null,
          onsuccess: null as any,
          onerror: null as any,
        };
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      }),
      getAll: vi.fn(() => {
        const req = {
          result: Array.from(entries.values()),
          onsuccess: null as any,
          onerror: null as any,
        };
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      }),
      delete: vi.fn((id: string) => {
        entries.delete(id);
        const req = { onsuccess: null as any, onerror: null as any };
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      }),
      clear: vi.fn(() => {
        entries.clear();
        const req = { onsuccess: null as any, onerror: null as any };
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      }),
      index: vi.fn(() => ({
        getAll: vi.fn((key?: any) => {
          const results = Array.from(entries.values()).filter((e) =>
            key ? e.videoId === key : true
          );
          const req = {
            result: results,
            onsuccess: null as any,
            onerror: null as any,
          };
          setTimeout(() => req.onsuccess?.(), 0);
          return req;
        }),
      })),
      createIndex: vi.fn(),
    };
