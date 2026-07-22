/**
 * Error Boundary
 * 
 * Handles application errors gracefully with user-friendly error states.
 * Integrates with the comprehensive error handling system.
 */

import { setupErrorHandling, handleError, handleFeatureError } from './error-handler.js';
import { initializeClientLogger } from './client-logger.js';

export class ErrorBoundary {
  private container: HTMLElement;
  private isInitialized = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /**
   * Initialize error boundary with comprehensive error handling
   */
  public initialize(): void {
    if (this.isInitialized) return;

    // Initialize client logger
    initializeClientLogger({
      enableLocalStorage: true,
      enableConsoleOutput: true,
      remoteEndpoint: '/api/logs',
      maxLogSize: 1000,
      batchSize: 10,
      flushInterval: 30000, // 30 seconds
      retryConfig: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffFactor: 2,
      }
    });

    // Setup comprehensive error handling
    setupErrorHandling({
      enabled: true,
      endpoint: '/api/errors',
      includeUserInfo: true,
      includeTelemetry: true,
      maxReportsPerSession: 10,
    });

    this.isInitialized = true;
  }

  /**
   * Handle errors gracefully using the comprehensive error system
   */
  public handleError(error: Error, context = 'boundary'): void {
    handleError(error, context, {
      errorBoundary: this.constructor.name,
      containerElement: this.container.tagName,
    });
  }

  /**
   * Handle feature-specific errors with graceful degradation
   */
  public handleFeatureError(feature: string, error: Error, context: Record<string, any> = {}): void {
    handleFeatureError(feature, error, {
      ...context,
      errorBoundary: this.constructor.name,
    });
  }

  /**
   * Destroy error boundary
   */
  public destroy(): void {
    // The comprehensive error handler manages global handlers
    this.isInitialized = false;
  }
}