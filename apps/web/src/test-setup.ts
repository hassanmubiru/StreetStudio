/**
 * Test Setup
 * 
 * Global test configuration for vitest with comprehensive browser API mocks
 */

import { vi, beforeEach, afterEach } from 'vitest';

// Mock environment variables
vi.stubGlobal('import.meta', {
  env: {
    MODE: 'test',
    DEV: true,
    PROD: false,
  },
});

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => 'test-uuid-123'),
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
vi.stubGlobal('localStorage', localStorageMock);

// Mock sessionStorage  
vi.stubGlobal('sessionStorage', localStorageMock);

// Mock fetch
global.fetch = vi.fn();

// Mock location
Object.defineProperty(window, 'location', {
  writable: true,
  value: {
    href: 'http://localhost:3000',
    pathname: '/',
    search: '',
    hash: '',
    reload: vi.fn(),
  },
});

// Mock DOM APIs that aren't available in jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock CSS.supports
(global as any).CSS = {
  supports: vi.fn(() => false),
};

// Mock requestAnimationFrame
Object.defineProperty(window, 'requestAnimationFrame', {
  writable: true,
  value: vi.fn(callback => setTimeout(callback, 16)),
});

// Mock cancelAnimationFrame
Object.defineProperty(window, 'cancelAnimationFrame', {
  writable: true,
  value: vi.fn(id => clearTimeout(id)),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock timers - ensure they work properly in test environment
const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;
const originalSetInterval = global.setInterval;
const originalClearInterval = global.clearInterval;

Object.defineProperty(window, 'setTimeout', {
  writable: true,
  value: vi.fn().mockImplementation((callback: Function, delay: number) => {
    return originalSetTimeout(callback, delay);
  }),
});

Object.defineProperty(window, 'clearTimeout', {
  writable: true,
  value: vi.fn().mockImplementation((id: number) => {
    return originalClearTimeout(id);
  }),
});

Object.defineProperty(window, 'setInterval', {
  writable: true,
  value: vi.fn().mockImplementation((callback: Function, delay: number) => {
    return originalSetInterval(callback, delay);
  }),
});

Object.defineProperty(window, 'clearInterval', {
  writable: true,
  value: vi.fn().mockImplementation((id: number) => {
    return originalClearInterval(id);
  }),
});
});

// Clean up between tests
beforeEach(() => {
  // Reset DOM
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  
  // Reset mocks
  vi.clearAllMocks();
  
  // Reset localStorage mock
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  localStorageMock.clear.mockClear();
  
  // Reset global fetch mock
  (global.fetch as any).mockClear?.();
});

afterEach(() => {
  // Clean up any remaining timers
  vi.clearAllTimers();
  
  // Clean up DOM
  document.body.innerHTML = '';
  
  // Reset any global state
  delete (window as any).errorReportingService;
  delete (window as any).degradationManager;
});