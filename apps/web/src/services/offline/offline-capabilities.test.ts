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
