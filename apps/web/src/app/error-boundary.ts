/**
 * Error Boundary
 * 
 * Handles application errors gracefully with user-friendly error states.
 */

export class ErrorBoundary {
  private container: HTMLElement;
  private originalErrorHandler?: (event: ErrorEvent) => void;
  private originalRejectionHandler?: (event: PromiseRejectionEvent) => void;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /**
   * Initialize error boundary
   */
  public initialize(): void {
    // Set up global error handlers
    this.originalErrorHandler = window.onerror;
    this.originalRejectionHandler = window.onunhandledrejection;

    window.onerror = (message, source, lineno, colno, error) => {
      this.handleError(error || new Error(String(message)));
      return true;
    };

    window.onunhandledrejection = (event) => {
      this.handleError(new Error(event.reason));
      event.preventDefault();
    };
  }

  /**
   * Handle errors gracefully
   */
  public handleError(error: Error): void {
    console.error('Application error:', error);

    // Show user-friendly error message
    this.showErrorState(error);

    // TODO: Send error report to logging service
  }

  /**
   * Show error state to user
   */
  private showErrorState(error: Error): void {
    const errorContainer = document.createElement('div');
    errorContainer.className = 'min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4';
    errorContainer.innerHTML = `
      <div class="max-w-md w-full text-center">
        <div class="mb-6">
          <svg class="w-16 h-16 text-red-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.84L13.732 4.86c-.77-1.175-2.694-1.175-3.464 0L3.34 16.16c-.77 1.173.192 2.84 1.732 2.84z"></path>
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Something went wrong
        </h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          We encountered an unexpected error. Please try refreshing the page.
        </p>
        <div class="space-y-3">
          <button 
            onclick="window.location.reload()" 
            class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Refresh Page
          </button>
          <button 
            onclick="window.history.back()" 
            class="w-full bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white py-2 px-4 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Go Back
          </button>
        </div>
        <details class="mt-6 text-left">
          <summary class="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
            Technical Details
          </summary>
          <pre class="mt-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-auto">
${error.message}
${error.stack ? `\n${error.stack}` : ''}
          </pre>
        </details>
      </div>
    `;

    // Replace app content with error state
    this.container.innerHTML = '';
    this.container.appendChild(errorContainer);
  }

  /**
   * Destroy error boundary
   */
  public destroy(): void {
    // Restore original handlers
    window.onerror = this.originalErrorHandler || null;
    window.onunhandledrejection = this.originalRejectionHandler || null;
  }
}