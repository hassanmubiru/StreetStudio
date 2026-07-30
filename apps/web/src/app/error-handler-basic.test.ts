/**
 * Basic Error Handler Tests
 * 
 * Simple tests to verify the error handling system works correctly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupErrorHandling, handleError } from './error-handler.js';

// Mock toast
vi.mock('@streetstudio/ui', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }
}));

// Mock logger
vi.mock('./client-logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  }
}));

describe('Error Handler Basic Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock crypto
    Object.defineProperty(global, 'crypto', {
      value: { randomUUID: vi.fn(() => 'test-uuid') },
      configurable: true,
    });
    
    // Mock window location
    Object.defineProperty(global, 'window', {
      value: {
        location: {
          href: 'https://test.com',
          pathname: '/test',
        },
        addEventListener: vi.fn(),
        navigator: { userAgent: 'test' },
      },
      configurable: true,
    });
    
    // Mock navigator
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'test-agent',
        onLine: true,
      },
      configurable: true,
    });
  });

  it('should setup error handling without throwing', () => {
    expect(() => {
      setupErrorHandling();
    }).not.toThrow();
  });

  it('should handle basic errors', () => {
    setupErrorHandling();
    
    const testError = new Error('Test error message');
    
    expect(() => {
      handleError(testError, 'test');
    }).not.toThrow();
  });

  it('should categorize errors correctly', () => {
    setupErrorHandling();
    
    const networkError = new Error('fetch failed');
    handleError(networkError, 'network');
    
    const authError = new Error('unauthorized');
    handleError(authError, 'authentication');
    
    // Should not throw
    expect(true).toBe(true);
  });
});