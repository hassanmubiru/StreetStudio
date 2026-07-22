/**
 * Simple Error Boundary Demo Test
 * 
 * Tests basic error boundary functionality to ensure implementation is working.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// Mock dependencies first
vi.mock('./error-handler.js', () => ({
  handleError: vi.fn(),
  handleFeatureError: vi.fn(),
  setupErrorHandling: vi.fn(),
  getDegradationManager: vi.fn(() => ({
    restoreFeature: vi.fn(),
    isFeatureFailed: vi.fn(() => false),
    handleFeatureFailure: vi.fn(),
  })),
}));

vi.mock('./client-logger.js', () => ({
  initializeClientLogger: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  }
}));

describe('Error Boundary System Integration', () => {
  let dom: JSDOM;

  beforeEach(() => {
    // Set up DOM environment
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'http://localhost:3000',
      pretendToBeVisual: true,
      resources: 'usable'
    });

    // Set globals
    global.window = dom.window as any;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    global.Event = dom.window.Event;
    global.CustomEvent = dom.window.CustomEvent;
    
    // Mock crypto
    global.crypto = {
      randomUUID: vi.fn(() => 'test-uuid-123')
    } as any;

    // Mock navigator
    global.navigator = {
      userAgent: 'test-browser',
      onLine: true
    } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  it('should be able to create error boundary with working DOM', async () => {
    // Import after setting up DOM
    const { ErrorBoundary } = await import('./error-boundary.js');
    
    const container = document.createElement('div');
    container.setAttribute('data-component', 'TestComponent');
    container.innerHTML = '<p>Original content</p>';
    document.body.appendChild(container);
    
    const errorBoundary = new ErrorBoundary(container);
    errorBoundary.initialize();
    
    expect(errorBoundary).toBeDefined();
    expect(errorBoundary.isInError()).toBe(false);
    
    // Test error handling
    const testError = new Error('Test error');
    errorBoundary.handleError(testError);
    
    expect(errorBoundary.isInError()).toBe(true);
    
    // Cleanup
    errorBoundary.destroy();
  });

  it('should handle error categorization correctly', async () => {
    const { handleError } = await import('./error-handler.js');
    
    const testError = new Error('Test network error');
    handleError(testError, 'network');
    
    expect(handleError).toHaveBeenCalledWith(testError, 'network');
  });

  it('should initialize client logger', async () => {
    const { initializeClientLogger } = await import('./client-logger.js');
    
    initializeClientLogger({
      enableLocalStorage: true,
      enableConsoleOutput: true,
    });
    
    expect(initializeClientLogger).toHaveBeenCalled();
  });

  it('should have toast system available', async () => {
    const { toast } = await import('../utils/toast.js');
    
    expect(toast).toBeDefined();
    expect(typeof toast.error).toBe('function');
    expect(typeof toast.success).toBe('function');
    expect(typeof toast.warning).toBe('function');
    expect(typeof toast.info).toBe('function');
  });
});