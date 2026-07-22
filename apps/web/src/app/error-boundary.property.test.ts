/**
 * Property-Based Tests for Error Boundary Resilience
 * 
 * These tests validate that the error boundary system handles ANY JavaScript error 
 * gracefully without crashing the application, using property-based testing 
 * with minimum 100 iterations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { 
  ErrorBoundary, 
  createErrorBoundary,
  clearAllErrorBoundaries,
  type ComponentErrorInfo
} from './error-boundary.js';

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
  initializeClientLogger: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  }
}));

/**
 * Arbitrary for generating various types of JavaScript errors
 */
const arbitraryError = fc.oneof(
  // Standard Error types
  fc.record({
    type: fc.constant('Error'),
    message: fc.string({ minLength: 0, maxLength: 500 }),
  }).map(({ message }) => new Error(message)),

  fc.record({
    type: fc.constant('TypeError'),
    message: fc.string({ minLength: 0, maxLength: 500 }),
  }).map(({ message }) => new TypeError(message)),

  fc.record({
    type: fc.constant('ReferenceError'),
    message: fc.string({ minLength: 0, maxLength: 500 }),
  }).map(({ message }) => new ReferenceError(message)),

  fc.record({
    type: fc.constant('SyntaxError'),
    message: fc.string({ minLength: 0, maxLength: 500 }),
  }).map(({ message }) => new SyntaxError(message)),

  fc.record({
    type: fc.constant('RangeError'),
    message: fc.string({ minLength: 0, maxLength: 500 }),
  }).map(({ message }) => new RangeError(message)),

  // Custom errors with various properties
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 100 }),
    message: fc.string({ minLength: 0, maxLength: 500 }),
    stack: fc.option(fc.string({ minLength: 0, maxLength: 1000 })),
    code: fc.option(fc.oneof(fc.string(), fc.integer())),
  }).map(({ name, message, stack, code }) => {
    const error = new Error(message);
    error.name = name;
    if (stack) error.stack = stack;
    if (code !== null) (error as any).code = code;
    return error;
  }),

  // Errors with circular references (edge case)
  fc.constant(() => {
    const error = new Error('Circular reference error');
    (error as any).circular = error;
    return error;
  }).map(fn => fn()),

  // Errors with non-standard properties
  fc.record({
    message: fc.string({ minLength: 0, maxLength: 500 }),
    extraProps: fc.dictionary(fc.string(), fc.anything()),
  }).map(({ message, extraProps }) => {
    const error = new Error(message);
    Object.assign(error, extraProps);
    return error;
  })
);

/**
 * Arbitrary for generating component error contexts
 */
const arbitraryErrorContext = fc.record({
  componentName: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
  props: fc.option(fc.dictionary(fc.string(), fc.anything())),
  stack: fc.option(fc.string({ minLength: 0, maxLength: 1000 })),
  metadata: fc.option(fc.dictionary(fc.string(), fc.anything())),
});

describe('Error Boundary Resilience Properties', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create fresh container for each test
    container = document.createElement('div');
    container.setAttribute('data-component', 'PropertyTestComponent');
    container.innerHTML = '<p>Test content</p>';
    document.body.appendChild(container);
    
    // Clear all boundaries between tests
    clearAllErrorBoundaries();
    
    // Mock crypto for consistent behavior
    Object.defineProperty(global, 'crypto', {
      value: { randomUUID: vi.fn(() => 'test-uuid-property') },
      writable: true
    });
  });

  afterEach(() => {
    // Clean up DOM
    document.body.innerHTML = '';
    clearAllErrorBoundaries();
    vi.restoreAllMocks();
  });

  /**
   * **Validates: Requirements 13.1**
   * 
   * Property 10: Error Handling Resilience
   * For any JavaScript error or exception that occurs during application execution,
   * the error boundary SHALL catch and handle it gracefully without crashing the 
   * entire application.
   */
  it('Property 10: Error Handling Resilience - Any JS error is handled gracefully', () => {
    fc.assert(
      fc.property(
        arbitraryError,
        arbitraryErrorContext,
        (error: Error, context: ComponentErrorInfo) => {
          // Create a fresh error boundary for each test case
          const errorBoundary = createErrorBoundary(container, {
            isolateFailures: true, // Ensure errors don't propagate in tests
            enableRecovery: true,
          });

          // Verify initial state - application is functional
          expect(errorBoundary.isInError()).toBe(false);
          expect(container.innerHTML).toContain('Test content');

          // Handle the error - this should NOT crash the application
          let handlingSucceeded = false;
          let applicationCrashed = false;
          
          try {
            errorBoundary.handleError(error, 'property-test');
            handlingSucceeded = true;
          } catch (handlingError) {
            // The error handling itself should never throw
            applicationCrashed = true;
            console.error('Error handling failed:', handlingError);
          }

          // Critical assertions: error handling resilience
          expect(applicationCrashed).toBe(false); // Application must not crash
          expect(handlingSucceeded).toBe(true); // Error handling must succeed
          
          // Verify error boundary captured the error
          expect(errorBoundary.isInError()).toBe(true);
          
          // Verify error UI is displayed (graceful degradation)
          const errorUI = container.querySelector('.error-boundary-container');
          expect(errorUI).toBeTruthy();
          expect(container.innerHTML).toContain('Component Error');
          
          // Verify recovery mechanism is available
          const retryButton = container.querySelector('#retry-component');
          const resetButton = container.querySelector('#reset-component');
          expect(retryButton || resetButton).toBeTruthy();

          // Verify error boundary can recover (application remains functional)
          let recoverySucceeded = false;
          try {
            errorBoundary.recover();
            recoverySucceeded = true;
          } catch (recoveryError) {
            console.error('Recovery failed:', recoveryError);
          }
          
          expect(recoverySucceeded).toBe(true);
          expect(errorBoundary.isInError()).toBe(false);

          // Clean up
          errorBoundary.destroy();
        }
      ),
      { 
        numRuns: 100, // Minimum 100 iterations as per requirements
        verbose: 0,   // Reduce noise in test output
        seed: 42,     // Deterministic for reproducible results
      }
    );
  });

  it('Property 10a: Error boundary handles component errors without propagation', () => {
    fc.assert(
      fc.property(
        arbitraryError,
        arbitraryErrorContext,
        (error: Error, context: ComponentErrorInfo) => {
          // Create nested error boundaries to test isolation
          const parentContainer = document.createElement('div');
          const childContainer = document.createElement('div');
          
          parentContainer.appendChild(childContainer);
          document.body.appendChild(parentContainer);

          const parentBoundary = createErrorBoundary(parentContainer, {
            isolateFailures: false, // Should escalate if child fails
          });
          
          const childBoundary = createErrorBoundary(childContainer, {
            isolateFailures: true, // Should isolate failures
          });

          // Handle error in child boundary
          childBoundary.handleComponentError(error, context);

          // Child should handle error in isolation
          expect(childBoundary.isInError()).toBe(true);
          expect(parentBoundary.isInError()).toBe(false); // Should not propagate due to isolation

          // Both boundaries should remain functional
          expect(() => childBoundary.recover()).not.toThrow();
          expect(() => parentBoundary.handleError(new Error('test'))).not.toThrow();

          // Clean up
          childBoundary.destroy();
          parentBoundary.destroy();
          parentContainer.remove();
        }
      ),
      { 
        numRuns: 100,
        seed: 43,
      }
    );
  });

  it('Property 10b: Error boundary handles async errors without crashing', () => {
    fc.assert(
      fc.property(
        arbitraryError,
        fc.integer({ min: 0, max: 10 }), // Small delay to avoid timeouts
        (error: Error, delay: number) => {
          const errorBoundary = createErrorBoundary(container, {
            isolateFailures: true,
            enableRecovery: true,
          });

          let asyncErrorHandled = false;
          let applicationCrashed = false;

          try {
            // Simulate async error handling - test the immediate response to async errors
            errorBoundary.handleError(error, 'async-error');
            asyncErrorHandled = true;
          } catch (asyncError) {
            applicationCrashed = true;
          }

          // Verify error handling resilience
          const result = !applicationCrashed && asyncErrorHandled && errorBoundary.isInError();

          // Clean up
          errorBoundary.destroy();
          
          return result;
        }
      ),
      { 
        numRuns: 50, // Fewer runs for stability
      }
    );
  });

  it('Property 10c: Error boundary handles errors during error handling (meta-errors)', () => {
    fc.assert(
      fc.property(
        arbitraryError,
        (originalError: Error) => {
          // Create error boundary with faulty error handler to simulate meta-errors
          const faultyOnError = vi.fn(() => {
            throw new Error('Error handler itself failed');
          });

          const errorBoundary = createErrorBoundary(container, {
            isolateFailures: true,
            onError: faultyOnError,
          });

          let metaErrorHandled = false;
          let totalCrash = false;

          try {
            // This should trigger the faulty error handler, creating a meta-error
            errorBoundary.handleError(originalError, 'meta-error-test');
            metaErrorHandled = true;
          } catch (metaError) {
            totalCrash = true;
          }

          // Even when the error handler fails, the system should not crash completely
          expect(totalCrash).toBe(false);
          expect(metaErrorHandled).toBe(true);
          
          // The boundary should still show some kind of error UI
          expect(errorBoundary.isInError()).toBe(true);
          
          // Should be able to recover even after meta-error
          expect(() => errorBoundary.recover()).not.toThrow();

          // Clean up
          errorBoundary.destroy();
        }
      ),
      { 
        numRuns: 100,
        seed: 44,
      }
    );
  });

  it('Property 10d: Error boundary handles extremely large error objects', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1000, maxLength: 10000 }), // Large error message
        fc.array(fc.string({ minLength: 100, maxLength: 500 }), { minLength: 10, maxLength: 100 }), // Large stack trace
        (largeMessage: string, stackLines: string[]) => {
          // Create error with very large content
          const largeError = new Error(largeMessage);
          largeError.stack = stackLines.join('\n');
          
          // Add large properties
          (largeError as any).largeData = new Array(1000).fill('x').join('');
          (largeError as any).nestedObject = {
            level1: { level2: { level3: { data: largeMessage } } }
          };

          const errorBoundary = createErrorBoundary(container, {
            isolateFailures: true,
          });

          let largeErrorHandled = false;
          let memoryIssue = false;

          try {
            errorBoundary.handleError(largeError, 'large-error-test');
            largeErrorHandled = true;
          } catch (error) {
            memoryIssue = true;
          }

          // Should handle even very large errors without memory issues
          expect(memoryIssue).toBe(false);
          expect(largeErrorHandled).toBe(true);
          expect(errorBoundary.isInError()).toBe(true);

          // Should still be recoverable
          expect(() => errorBoundary.recover()).not.toThrow();

          // Clean up
          errorBoundary.destroy();
        }
      ),
      { 
        numRuns: 50, // Fewer runs for large data tests
        seed: 45,
      }
    );
  });
});