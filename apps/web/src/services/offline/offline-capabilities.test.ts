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
