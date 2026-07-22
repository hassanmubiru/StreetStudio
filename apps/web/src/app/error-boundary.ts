/**
 * Enhanced Error Boundary System
 * 
 * Comprehensive error handling with categorized errors, user consent reporting,
 * graceful degradation, and recovery mechanisms for robust user experience.
 */

import { setupErrorHandling, handleError, handleFeatureError } from './error-handler.js';
import { initializeClientLogger } from './client-logger.js';

export interface ErrorBoundaryOptions {
  fallbackComponent?: HTMLElement | (() => HTMLElement);
  onError?: (error: Error, errorInfo: any) => void;
  isolateFailures?: boolean;
  enableRecovery?: boolean;
  maxRetries?: number;
}

export interface ErrorState {
  hasError: boolean;
  error?: Error;
  errorInfo?: any;
  retryCount: number;
  lastErrorTime?: Date;
}

// Global registry of error boundaries
const errorBoundaryRegistry = new Map<HTMLElement, ErrorBoundary>();
const childBoundaryMap = new Map<ErrorBoundary, ErrorBoundary[]>();

export class ErrorBoundary {
  private container: HTMLElement;
  private options: ErrorBoundaryOptions;
  private isInitialized = false;
  private errorState: ErrorState = {
    hasError: false,
    retryCount: 0,
  };
  private originalContent: string = '';
  private parentBoundary: ErrorBoundary | null = null;
  private childBoundaries: ErrorBoundary[] = [];
  private recoveryTimer: number | null = null;

  constructor(container: HTMLElement, options: ErrorBoundaryOptions = {}) {
    this.container = container;
    this.options = {
      isolateFailures: true,
      enableRecovery: true,
      maxRetries: 3,
      ...options,
    };

    // Store original content
    this.originalContent = container.innerHTML;

    // Register this boundary
    errorBoundaryRegistry.set(container, this);
  }

  /**
   * Initialize error boundary with comprehensive error handling
   */
  public initialize(): void {
    if (this.isInitialized) return;

    try {
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

      // Find parent boundary
      this.parentBoundary = this.findParentBoundary();
      if (this.parentBoundary) {
        this.parentBoundary.registerChild(this);
      }

      // Setup error event listeners
      this.setupErrorListeners();

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize error boundary:', error);
      // Continue without full error handling if initialization fails
    }
  }

  /**
   * Setup error event listeners for the container
   */
  private setupErrorListeners(): void {
    // Listen for component errors
    this.container.addEventListener('component-error', (event: any) => {
      this.handleComponentError(event.detail.error, event.detail.context);
    });

    // Listen for unhandled promise rejections within this container
    if (this.container === document.body) {
      window.addEventListener('unhandledrejection', (event) => {
        this.handleError(
          event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
          'unhandled-rejection'
        );
      });
    }
  }

  /**
   * Find parent error boundary
   */
  private findParentBoundary(): ErrorBoundary | null {
    let element = this.container.parentElement;
    
    while (element && element !== document.body) {
      const boundary = errorBoundaryRegistry.get(element);
      if (boundary && boundary !== this) {
        return boundary;
      }
      element = element.parentElement;
    }
    
    return null;
  }

  /**
   * Register a child boundary
   */
  private registerChild(childBoundary: ErrorBoundary): void {
    this.childBoundaries.push(childBoundary);
    
    if (!childBoundaryMap.has(this)) {
      childBoundaryMap.set(this, []);
    }
    childBoundaryMap.get(this)!.push(childBoundary);
  }

  /**
   * Unregister a child boundary
   */
  private unregisterChild(childBoundary: ErrorBoundary): void {
    const index = this.childBoundaries.indexOf(childBoundary);
    if (index > -1) {
      this.childBoundaries.splice(index, 1);
    }
    
    const children = childBoundaryMap.get(this);
    if (children) {
      const childIndex = children.indexOf(childBoundary);
      if (childIndex > -1) {
        children.splice(childIndex, 1);
      }
    }
  }

  /**
   * Handle component-level errors
   */
  public handleComponentError(error: Error, context: any): void {
    this.errorState = {
      hasError: true,
      error,
      errorInfo: context,
      retryCount: this.errorState.retryCount,
      lastErrorTime: new Date(),
    };

    // Call custom error handler if provided
    if (this.options.onError) {
      try {
        this.options.onError(error, context);
      } catch (handlerError) {
        console.error('Error in custom error handler:', handlerError);
      }
    }

    // Handle based on isolation settings
    if (this.options.isolateFailures) {
      this.isolateError(error, context);
    } else {
      this.escalateToParent(error, context);
    }
  }

  /**
   * Handle errors gracefully using the comprehensive error system
   */
  public handleError(error: Error, context = 'boundary'): void {
    // Update error state
    this.errorState = {
      hasError: true,
      error,
      errorInfo: { context },
      retryCount: this.errorState.retryCount,
      lastErrorTime: new Date(),
    };

    try {
      handleError(error, context, {
        errorBoundary: this.constructor.name,
        containerElement: this.container.tagName,
        containerId: this.container.id,
        containerClasses: this.container.className,
      });
    } catch (handlingError) {
      console.error('Error in error handler:', handlingError);
      this.showFallbackError(error);
    }

    // Show error UI
    this.showErrorUI(error, context);
  }

  /**
   * Isolate error to this boundary
   */
  private isolateError(error: Error, context: any): void {
    console.warn(`Error isolated to boundary:`, error);
    this.showErrorUI(error, context);
  }

  /**
   * Escalate error to parent boundary
   */
  private escalateToParent(error: Error, context: any): void {
    if (this.parentBoundary && !this.parentBoundary.errorState.hasError) {
      console.warn(`Escalating error to parent boundary:`, error);
      this.parentBoundary.handleComponentError(error, {
        ...context,
        escalatedFrom: this.container.tagName,
        escalatedFromId: this.container.id,
      });
    } else {
      // No parent or parent already has error, handle locally
      this.isolateError(error, context);
    }
  }

  /**
   * Show error UI
   */
  private showErrorUI(error: Error, context: string): void {
    if (this.options.fallbackComponent) {
      this.showCustomFallback(error);
    } else {
      this.showDefaultErrorUI(error, context);
    }
  }

  /**
   * Show custom fallback component
   */
  private showCustomFallback(error: Error): void {
    try {
      const fallback = typeof this.options.fallbackComponent === 'function' 
        ? this.options.fallbackComponent()
        : this.options.fallbackComponent!;
      
      this.container.innerHTML = '';
      this.container.appendChild(fallback);
    } catch (fallbackError) {
      console.error('Custom fallback component failed:', fallbackError);
      this.showDefaultErrorUI(error, 'fallback-failure');
    }
  }

  /**
   * Show default error UI
   */
  private showDefaultErrorUI(error: Error, context: string): void {
    const errorUI = this.createDefaultErrorUI(error, context);
    this.container.innerHTML = '';
    this.container.appendChild(errorUI);
  }

  /**
   * Create default error UI
   */
  private createDefaultErrorUI(error: Error, context: string): HTMLElement {
    const errorContainer = document.createElement('div');
    errorContainer.className = 'error-boundary-container p-8 text-center border border-red-200 bg-red-50 rounded-lg';
    
    const canRetry = this.options.enableRecovery && 
                     this.errorState.retryCount < (this.options.maxRetries || 3);

    errorContainer.innerHTML = `
      <div class="text-red-600 mb-4">
        <svg class="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.84L13.732 4.86c-.77-1.175-2.694-1.175-3.464 0L3.34 16.16c-.77 1.173.192 2.84 1.732 2.84z">
          </path>
        </svg>
      </div>
      
      <h3 class="text-lg font-semibold text-gray-900 mb-2">Something went wrong</h3>
      <p class="text-gray-600 mb-4">
        This component encountered an error and cannot be displayed.
      </p>
      
      ${canRetry ? `
        <div class="space-y-2">
          <button id="retry-btn" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            Try Again ${this.errorState.retryCount > 0 ? `(${this.errorState.retryCount}/${this.options.maxRetries})` : ''}
          </button>
          <div>
            <button id="reset-btn" class="text-gray-600 hover:text-gray-800 underline">
              Reset Component
            </button>
          </div>
        </div>
      ` : `
        <button id="reset-btn" class="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700">
          Reset Component
        </button>
      `}
      
      ${import.meta.env.MODE === 'development' ? `
        <details class="mt-4 text-left">
          <summary class="cursor-pointer text-sm text-gray-500">Error Details</summary>
          <pre class="mt-2 p-2 bg-gray-100 text-xs rounded overflow-auto">${error.stack || error.message}</pre>
        </details>
      ` : ''}
    `;

    // Add event listeners
    const retryBtn = errorContainer.querySelector('#retry-btn');
    const resetBtn = errorContainer.querySelector('#reset-btn');

    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.retry());
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.reset());
    }

    return errorContainer;
  }

  /**
   * Retry the failed operation
   */
  public retry(): void {
    if (this.errorState.retryCount >= (this.options.maxRetries || 3)) {
      console.warn('Maximum retry attempts reached');
      return;
    }

    this.errorState.retryCount++;
    this.recover();
  }

  /**
   * Reset the component to initial state
   */
  public reset(): void {
    this.errorState = {
      hasError: false,
      retryCount: 0,
    };

    this.recover();
  }

  /**
   * Recover from error state
   */
  private recover(): void {
    try {
      // Clear any recovery timer
      if (this.recoveryTimer) {
        clearTimeout(this.recoveryTimer);
        this.recoveryTimer = null;
      }

      // Restore original content
      this.container.innerHTML = this.originalContent;

      // Mark as recovered
      this.errorState.hasError = false;

      // Emit recovery event
      this.container.dispatchEvent(new CustomEvent('boundary-recovered', {
        detail: {
          retryCount: this.errorState.retryCount,
          boundary: this,
        },
      }));

    } catch (recoveryError) {
      console.error('Failed to recover from error:', recoveryError);
      this.showFallbackError(recoveryError);
    }
  }

  /**
   * Automatic recovery after delay
   */
  public scheduleAutoRecovery(delay = 5000): void {
    if (!this.options.enableRecovery || this.recoveryTimer) return;

    this.recoveryTimer = window.setTimeout(() => {
      if (this.errorState.hasError && this.errorState.retryCount < (this.options.maxRetries || 3)) {
        console.log('Attempting automatic recovery...');
        this.retry();
      }
    }, delay);
  }

  /**
   * Show minimal fallback error when all else fails
   */
  private showFallbackError(error: Error): void {
    this.container.innerHTML = `
      <div style="padding: 20px; text-align: center; border: 1px solid #f87171; background: #fef2f2; border-radius: 8px;">
        <p style="color: #dc2626; margin: 0;">
          ⚠️ Critical Error: Unable to display content
        </p>
        <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Reload Page
        </button>
      </div>
    `;
  }

  /**
   * Handle feature-specific errors with graceful degradation
   */
  public handleFeatureError(feature: string, error: Error, context: Record<string, any> = {}): void {
    try {
      handleFeatureError(feature, error, {
        ...context,
        errorBoundary: this.constructor.name,
      });
    } catch (handlingError) {
      console.error('Error in feature error handler:', handlingError);
      this.handleError(error, 'feature-error');
    }
  }

  /**
   * Update content when not in error state
   */
  public updateContent(content: string | HTMLElement): void {
    if (this.errorState.hasError) {
      console.warn('Cannot update content while in error state');
      return;
    }

    try {
      if (typeof content === 'string') {
        this.container.innerHTML = content;
        this.originalContent = content;
      } else {
        this.container.innerHTML = '';
        this.container.appendChild(content);
        this.originalContent = this.container.innerHTML;
      }
    } catch (error) {
      console.error('Error updating content:', error);
      this.handleError(error as Error, 'content-update');
    }
  }

  /**
   * Check if boundary is in error state
   */
  public isInErrorState(): boolean {
    return this.errorState.hasError;
  }

  /**
   * Get error state
   */
  public getErrorState(): ErrorState {
    return { ...this.errorState };
  }

  /**
   * Clean up event listeners and references
   */
  public destroy(): void {
    // Clear recovery timer
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }

    // Unregister from parent
    if (this.parentBoundary) {
      this.parentBoundary.unregisterChild(this);
    }

    // Clean up child boundaries
    this.childBoundaries.forEach(child => {
      child.parentBoundary = null;
    });

    // Remove from registry
    errorBoundaryRegistry.delete(this.container);
    childBoundaryMap.delete(this);

    this.isInitialized = false;
  }
}

/**
 * Utility function to create an error boundary
 */
export function createErrorBoundary(
  container: HTMLElement, 
  options?: ErrorBoundaryOptions
): ErrorBoundary {
  const boundary = new ErrorBoundary(container, options);
  boundary.initialize();
  return boundary;
}

/**
 * Find the nearest error boundary for an element
 */
export function findNearestErrorBoundary(element: HTMLElement): ErrorBoundary | null {
  let current = element;
  
  while (current && current !== document.body) {
    const boundary = errorBoundaryRegistry.get(current);
    if (boundary) {
      return boundary;
    }
    current = current.parentElement as HTMLElement;
  }
  
  return null;
}

/**
 * Trigger a component error event
 */
export function triggerComponentError(element: HTMLElement, error: Error, context: any = {}): void {
  const errorEvent = new CustomEvent('component-error', {
    detail: { error, context },
    bubbles: true,
  });
  
  element.dispatchEvent(errorEvent);
}

/**
 * Get all registered error boundaries
 */
export function getAllErrorBoundaries(): ErrorBoundary[] {
  return Array.from(errorBoundaryRegistry.values());
}

/**
 * Clear all error boundaries (useful for testing)
 */
export function clearAllErrorBoundaries(): void {
  errorBoundaryRegistry.clear();
  childBoundaryMap.clear();
}