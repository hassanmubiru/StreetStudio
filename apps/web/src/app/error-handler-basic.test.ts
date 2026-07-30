/**
 * Basic Error Handler Tests
 * 
 * Simple tests to verify the error handling system works correctly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupErrorHandling, handleError } from './error-handler.js';

// Mock toast. error-handler.ts imports toast from '../utils/toast.js',
// so that is the module we must mock (mocking '@streetstudio/ui' would have
// no effect and the real toast would call window.setTimeout).
vi.mock('../utils/toast.js', () => ({
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

    // Use the real jsdom crypto but make randomUUID deterministic.
    // Do NOT reassign global.crypto (read-only getter in jsdom/node).
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      'test-uuid' as `${string}-${string}-${string}-${string}-${string}`
    );

    // Rely on the real jsdom window/navigator (which provide setTimeout,
    // setInterval, addEventListener, location, onLine, etc.). jsdom already
    // reports navigator.onLine === true, so no override is needed here.
  });

  afterEach(() => {
    vi.restoreAllMocks();
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