/**
 * Test Suite for ErrorBoundary Component System
 * 
 * Tests component-level error handling, recovery mechanisms, and boundary isolation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  ErrorBoundary, 
  createErrorBoundary, 
  findNearestErrorBoundary, 
  triggerComponentError,
  type ComponentErrorInfo,
  type ErrorBoundaryOptions
} from './error-boundary.js';
import { handleError, setupErrorHandling } from './error-handler.js';

// Mock dependencies
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
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  }
}));

describe('ErrorBoundary', () => {
  let container: HTMLElement;
  let errorBoundary: ErrorBoundary;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create container element
    container = document.createElement('div');
    container.setAttribute('data-component', 'TestComponent');
    container.innerHTML = '<p>Original content</p>';
    document.body.appendChild(container);
    
    // Mock crypto
    Object.defineProperty(global, 'crypto', {
      value: { randomUUID: vi.fn(() => 'test-uuid-123') },
      writable: true
    });
  });

  afterEach(() => {
    if (errorBoundary) {
      errorBoundary.destroy();
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default options', () => {
      errorBoundary = new ErrorBoundary(container);
      errorBoundary.initialize();
      
      expect(errorBoundary).toBeDefined();
      expect(errorBoundary.isInError()).toBe(false);
    });

    it('should initialize with custom options', () => {
      const options: ErrorBoundaryOptions = {
        maxRetries: 5,
        retryDelay: 2000,
        enableAutoRecovery: false,
      };
      
      errorBoundary = new ErrorBoundary(container, options);
      errorBoundary.initialize();
      
      expect(errorBoundary).toBeDefined();
    });

    it('should store original content on initialization', () => {
      errorBoundary = new ErrorBoundary(container);
      errorBoundary.initialize();
      
      // Original content should be preserved
      expect(container.innerHTML).toContain('Original content');
    });

    it('should set up error listeners', () => {
      errorBoundary = new ErrorBoundary(container);
      
      const addEventListenerSpy = vi.spyOn(container, 'addEventListener');
      errorBoundary.initialize();
      
      expect(addEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function), true);
      expect(addEventListenerSpy).toHaveBeenCalledWith('component-error', expect.any(Function));
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      errorBoundary = new ErrorBoundary(container);
      errorBoundary.initialize();
    });

    it('should handle JavaScript errors', () => {
      const testError = new Error('Test component error');
      
      errorBoundary.handleError(testError);
      
      expect(errorBoundary.isInError()).toBe(true);
      expect(handleError).toHaveBeenCalledWith(
        testError,
        'component',
        expect.objectContaining({
          errorInfo: expect.any(Object),
          boundary: 'component',
          retryCount: 0,
        })
      );
    });

    it('should display error fallback UI', () => {
      const testError = new Error('Component rendering failed');
      
      errorBoundary.handleError(testError);
      
      expect(container.innerHTML).toContain('Component Error');
      expect(container.innerHTML).toContain('TestComponent');
      expect(container.classList.contains('error-boundary-fallback')).toBe(true);
    });

    it('should provide retry button for recoverable errors', () => {
      const testError = new Error('Temporary component failure');
      
      errorBoundary.handleError(testError);
      
      const retryButton = container.querySelector('#retry-component') as HTMLButtonElement;
      expect(retryButton).toBeTruthy();
      expect(retryButton.textContent).toContain('Try Again');
    });

    it('should handle custom error events', () => {
      const testError = new Error('Custom component error');
      const errorInfo: ComponentErrorInfo = {
        componentName: 'CustomComponent',
        props: { id: 'test-123' },
      };
      
      triggerComponentError(container, testError, errorInfo);
      
      expect(errorBoundary.isInError()).toBe(true);
    });
  });

  describe('Recovery Mechanisms', () => {
    beforeEach(() => {
      errorBoundary = new ErrorBoundary(container);
      errorBoundary.initialize();
    });

    it('should recover from error state', () => {
      const testError = new Error('Recoverable error');
      
      // Trigger error
      errorBoundary.handleError(testError);
      expect(errorBoundary.isInError()).toBe(true);
      
      // Recover
      errorBoundary.recover();
      expect(errorBoundary.isInError()).toBe(false);
      expect(container.innerHTML).toContain('Original content');
      expect(container.classList.contains('error-boundary-fallback')).toBe(false);
    });

    it('should automatically retry on recoverable errors', async () => {
      const options: ErrorBoundaryOptions = {
        enableAutoRecovery: true,
        maxRetries: 2,
        retryDelay: 100,
      };
      
      errorBoundary = new ErrorBoundary(container, options);
      errorBoundary.initialize();
      
      const recoverableError = new Error('Network timeout');
      errorBoundary.handleError(recoverableError);
      
      // Should schedule retry
      expect(errorBoundary.getRetryCount()).toBe(0);
      
      // Wait for retry
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should have attempted retry
      expect(errorBoundary.getRetryCount()).toBe(1);
    });

    it('should stop retrying after max attempts', async () => {
      const options: ErrorBoundaryOptions = {
        enableAutoRecovery: true,
        maxRetries: 2,
        retryDelay: 50,
      };
      
      errorBoundary = new ErrorBoundary(container, options);
      errorBoundary.initialize();
      
      const persistentError = new Error('Persistent failure');
      
      // Simulate multiple failures
      errorBoundary.handleError(persistentError);
      await new Promise(resolve => setTimeout(resolve, 60));
      
      errorBoundary.handleError(persistentError);
      await new Promise(resolve => setTimeout(resolve, 60));
      
      errorBoundary.handleError(persistentError);
      
      expect(errorBoundary.getRetryCount()).toBe(2);
    });

    it('should reset retry count on successful recovery', () => {
      errorBoundary.handleError(new Error('Test error'));
      expect(errorBoundary.getRetryCount()).toBe(0);
      
      // Simulate retry
      errorBoundary['retryCount'] = 2;
      expect(errorBoundary.getRetryCount()).toBe(2);
      
      // Recover successfully
      errorBoundary.recover();
      expect(errorBoundary.getRetryCount()).toBe(0);
    });
  });

  describe('Custom Fallback Components', () => {
    it('should use custom fallback component when provided', () => {
      const customFallback = (): HTMLElement => {
        const fallback = document.createElement('div');
        fallback.innerHTML = '<p>Custom error fallback</p>';
        fallback.className = 'custom-error-fallback';
        return fallback;
      };
      
      const options: ErrorBoundaryOptions = {
        fallbackComponent: customFallback,
      };
      
      errorBoundary = new ErrorBoundary(container, options);
      errorBoundary.initialize();
      
      errorBoundary.handleError(new Error('Test error'));
      
      expect(container.innerHTML).toContain('Custom error fallback');
      expect(container.querySelector('.custom-error-fallback')).toBeTruthy();
    });

    it('should fallback to default UI if custom fallback fails', () => {
      const faultyFallback = (): HTMLElement => {
        throw new Error('Fallback component failed');
      };
      
      const options: ErrorBoundaryOptions = {
        fallbackComponent: faultyFallback,
      };
      
      errorBoundary = new ErrorBoundary(container, options);
      errorBoundary.initialize();
      
      errorBoundary.handleError(new Error('Test error'));
      
      // Should use default fallback
      expect(container.innerHTML).toContain('Component Error');
    });

    it('should call custom onError handler', () => {
      const onErrorSpy = vi.fn();
      const options: ErrorBoundaryOptions = {
        onError: onErrorSpy,
      };
      
      errorBoundary = new ErrorBoundary(container, options);
      errorBoundary.initialize();
      
      const testError = new Error('Test error');
      errorBoundary.handleError(testError);
      
      expect(onErrorSpy).toHaveBeenCalledWith(
        testError,
        expect.objectContaining({
          componentName: 'TestComponent',
        })
      );
    });
  });

  describe('Boundary Hierarchy', () => {
    let parentContainer: HTMLElement;
    let childContainer: HTMLElement;
    let parentBoundary: ErrorBoundary;
    let childBoundary: ErrorBoundary;

    beforeEach(() => {
      // Create parent container
      parentContainer = document.createElement('div');
      parentContainer.setAttribute('data-component', 'ParentComponent');
      parentContainer.innerHTML = '<div id="child"></div>';
      document.body.appendChild(parentContainer);
      
      // Create child container
      childContainer = parentContainer.querySelector('#child') as HTMLElement;
      childContainer.setAttribute('data-component', 'ChildComponent');
      childContainer.innerHTML = '<p>Child content</p>';
      
      // Initialize boundaries
      parentBoundary = new ErrorBoundary(parentContainer);
      parentBoundary.initialize();
      
      childBoundary = new ErrorBoundary(childContainer);
      childBoundary.initialize();
    });

    afterEach(() => {
      if (parentBoundary) parentBoundary.destroy();
      if (childBoundary) childBoundary.destroy();
    });

    it('should register child boundaries with parent', () => {
      expect(parentBoundary['childBoundaries'].has(childBoundary)).toBe(true);
      expect(childBoundary['parentBoundary']).toBe(parentBoundary);
    });

    it('should escalate fatal errors to parent boundary', () => {
      const fatalError = new Error('Out of memory');
      childBoundary.handleError(fatalError);
      
      // Parent should handle the escalated error
      expect(parentBoundary.isInError()).toBe(true);
    });

    it('should isolate failures when isolation is enabled', () => {
      const options: ErrorBoundaryOptions = {
        isolateFailures: true,
      };
      
      childBoundary = new ErrorBoundary(childContainer, options);
      childBoundary.initialize();
      
      const minorError = new Error('Minor rendering issue');
      childBoundary.handleError(minorError);
      
      expect(childBoundary.isInError()).toBe(true);
      expect(parentBoundary.isInError()).toBe(false);
    });
  });

  describe('Utility Functions', () => {
    it('should create error boundary with createErrorBoundary', () => {
      const boundary = createErrorBoundary(container);
      
      expect(boundary).toBeInstanceOf(ErrorBoundary);
      expect((container as any).__errorBoundary).toBe(boundary);
      
      boundary.destroy();
    });

    it('should find nearest error boundary', () => {
      errorBoundary = createErrorBoundary(container);
      
      const childElement = document.createElement('div');
      container.appendChild(childElement);
      
      const nearestBoundary = findNearestErrorBoundary(childElement);
      expect(nearestBoundary).toBe(errorBoundary);
    });

    it('should return null if no error boundary found', () => {
      const isolatedElement = document.createElement('div');
      document.body.appendChild(isolatedElement);
      
      const nearestBoundary = findNearestErrorBoundary(isolatedElement);
      expect(nearestBoundary).toBeNull();
    });

    it('should trigger component error with custom event', () => {
      errorBoundary = new ErrorBoundary(container);
      
      const eventListenerSpy = vi.spyOn(container, 'addEventListener');
      errorBoundary.initialize();
      
      const testError = new Error('Custom event error');
      const errorInfo: ComponentErrorInfo = {
        componentName: 'TestComponent',
      };
      
      triggerComponentError(container, testError, errorInfo);
      
      expect(errorBoundary.isInError()).toBe(true);
    });
  });

  describe('Content Management', () => {
    beforeEach(() => {
      errorBoundary = new ErrorBoundary(container);
      errorBoundary.initialize();
    });

    it('should update content when not in error state', () => {
      const newContent = '<p>Updated content</p>';
      
      errorBoundary.updateContent(newContent);
      
      // Content should be updated for recovery
      errorBoundary.handleError(new Error('Test error'));
      errorBoundary.recover();
      
      expect(container.innerHTML).toContain('Updated content');
    });

    it('should not update content when in error state', () => {
      errorBoundary.handleError(new Error('Test error'));
      
      const newContent = '<p>Should not update</p>';
      errorBoundary.updateContent(newContent);
      
      errorBoundary.recover();
      
      // Should still have original content
      expect(container.innerHTML).toContain('Original content');
    });
  });

  describe('Cleanup and Destruction', () => {
    beforeEach(() => {
      errorBoundary = new ErrorBoundary(container);
      errorBoundary.initialize();
    });

    it('should clean up event listeners on destroy', () => {
      const removeEventListenerSpy = vi.spyOn(container, 'removeEventListener');
      
      errorBoundary.destroy();
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('component-error', expect.any(Function));
    });

    it('should remove reference from container on destroy', () => {
      expect((container as any).__errorBoundary).toBe(errorBoundary);
      
      errorBoundary.destroy();
      
      expect((container as any).__errorBoundary).toBeUndefined();
    });

    it('should unregister from parent boundary on destroy', () => {
      const parentContainer = document.createElement('div');
      const parentBoundary = new ErrorBoundary(parentContainer);
      parentBoundary.initialize();
      
      // Simulate parent-child relationship
      parentBoundary['childBoundaries'].add(errorBoundary);
      errorBoundary['parentBoundary'] = parentBoundary;
      
      errorBoundary.destroy();
      
      expect(parentBoundary['childBoundaries'].has(errorBoundary)).toBe(false);
      
      parentBoundary.destroy();
    });
  });
});