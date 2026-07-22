/**
 * Integration Tests for Error Boundary System
 * 
 * Tests the integration between error handler, error boundary, and client logger.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorBoundary } from './error-boundary.js';
import { setupErrorHandling } from './error-handler.js';

// Mock dependencies
vi.mock('@streetstudio/ui', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }
}));

vi.mock('./client-logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  }
}));

describe('Error System Integration', () => {
  let container: HTMLElement;
  let errorBoundary: ErrorBoundary;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup DOM
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.setAttribute('data-component', 'TestComponent');
    container.innerHTML = '<p>Test content</p>';
    document.body.appendChild(container);
    
    // Setup globals
    Object.defineProperty(global, 'crypto', {
      value: { randomUUID: vi.fn(() => 'test-id') },
      configurable: true,
    });
    
    // Initialize error handling
    setupErrorHandling();
  });

  afterEach(() => {
    if (errorBoundary) {
      errorBoundary.destroy();
    }
  });

  it('should integrate error boundary with error handler', () => {
    errorBoundary = new ErrorBoundary(container);
    errorBoundary.initialize();
    
    const testError = new Error('Integration test error');
    
    expect(() => {
      errorBoundary.handleError(testError);
    }).not.toThrow();
    
    expect(errorBoundary.isInError()).toBe(true);
  });

  it('should show error fallback UI', () => {
    errorBoundary = new ErrorBoundary(container);
    errorBoundary.initialize();
    
    errorBoundary.handleError(new Error('UI test error'));
    
    expect(container.innerHTML).toContain('Component Error');
    expect(container.innerHTML).toContain('TestComponent');
  });

  it('should recover from errors', () => {
    errorBoundary = new ErrorBoundary(container);
    errorBoundary.initialize();
    
    // Cause error
    errorBoundary.handleError(new Error('Recovery test'));
    expect(errorBoundary.isInError()).toBe(true);
    
    // Recover
    errorBoundary.recover();
    expect(errorBoundary.isInError()).toBe(false);
    expect(container.innerHTML).toContain('Test content');
  });

  it('should handle graceful degradation', () => {
    const degradationManager = require('./error-handler.js').getDegradationManager();
    
    if (degradationManager) {
      let fallbackCalled = false;
      degradationManager.registerFallback('test-feature', () => {
        fallbackCalled = true;
      });
      
      degradationManager.handleFeatureFailure('test-feature', new Error('Test failure'));
      
      expect(fallbackCalled).toBe(true);
    }
  });
});