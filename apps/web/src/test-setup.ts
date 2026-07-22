/**
 * Test Setup for Web Application
 * 
 * Configures the test environment with necessary mocks and utilities.
 */

import { vi } from 'vitest';

// Mock global objects and APIs
Object.defineProperty(window, 'crypto', {
  value: {
    randomUUID: vi.fn(() => 'test-uuid-123'),
    getRandomValues: vi.fn((arr) => arr),
  },
});

Object.defineProperty(navigator, 'onLine', {
  value: true,
  writable: true,
});

Object.defineProperty(navigator, 'userAgent', {
  value: 'Mozilla/5.0 (Test Environment) WebKit/537.36',
  writable: true,
});

Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(''),
  },
  writable: true,
});

// Mock fetch
global.fetch = vi.fn();

// Mock localStorage
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  },
  writable: true,
});

// Mock sessionStorage
Object.defineProperty(window, 'sessionStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  },
  writable: true,
});

// Mock import.meta.env
Object.defineProperty(import.meta, 'env', {
  value: {
    MODE: 'test',
    DEV: false,
    PROD: false,
  },
  writable: true,
});

// Mock performance API
Object.defineProperty(window, 'performance', {
  value: {
    now: vi.fn(() => Date.now()),
    mark: vi.fn(),
    measure: vi.fn(),
    getEntriesByType: vi.fn(() => []),
  },
});

// Mock timers
Object.defineProperty(window, 'setInterval', {
  value: vi.fn((fn, delay) => setTimeout(fn, delay)),
});

Object.defineProperty(window, 'clearInterval', {
  value: vi.fn(),
});

Object.defineProperty(window, 'setTimeout', {
  value: vi.fn((fn, delay) => delay),
});

Object.defineProperty(window, 'clearTimeout', {
  value: vi.fn(),
});

// Setup waitFor utility for async tests
global.vi = vi;