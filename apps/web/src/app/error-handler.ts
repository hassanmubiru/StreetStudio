/**
 * Global Error Handling
 * 
 * Production-ready error handling with logging, user feedback, and recovery.
 */

import { toast } from '@streetstudio/ui';

export interface ErrorDetails {
  message: string;
  stack?: string;
  componentStack?: string;
  errorBoundary?: string;
  userId?: string;
  timestamp: string;
  url: string;
  userAgent: string;
}

export function setupErrorHandling(): void {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    handleError(error, 'unhandledrejection');
    
    // Prevent the default browser behavior (console error)
    event.preventDefault();
  });

  // Handle JavaScript errors
  window.addEventListener('error', (event) => {
    console.error('JavaScript error:', event.error);
    
    const error = event.error || new Error(event.message);
    handleError(error, 'javascript');
  });

  // Handle network errors
  window.addEventListener('offline', () => {
    toast.warning('You are currently offline. Some features may not work.');
  });

  window.addEventListener('online', () => {
    toast.success('Connection restored.');
  });
}

export function handleError(error: Error, context = 'unknown'): void {
  const errorDetails: ErrorDetails = {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent,
  };

  // Log error to console in development
  if (import.meta.env.MODE === 'development') {
    console.error('Error details:', errorDetails);
  }

  // Send to error reporting service in production
  if (import.meta.env.MODE === 'production') {
    reportError(errorDetails, context);
  }

  // Show user-friendly error message
  showErrorToUser(error, context);
}

function reportError(errorDetails: ErrorDetails, context: string): void {
  // TODO: Send to error reporting service (Sentry, LogRocket, etc.)
  // This would be implemented with the actual error reporting service
  
  try {
    fetch('/api/errors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...errorDetails,
        context,
      }),
    }).catch(() => {
      // Silently fail - don't create error loops
    });
  } catch {
    // Silently fail - don't create error loops
  }
}

function showErrorToUser(error: Error, context: string): void {
  // Don't show network errors to user (they get handled by offline/online events)
  if (error.message.includes('NetworkError') || error.message.includes('fetch')) {
    return;
  }

  // Show appropriate message based on error type
  if (error.message.includes('ChunkLoadError') || error.message.includes('Loading chunk')) {
    toast.error('App update available. Please refresh the page.', {
      duration: 0, // Don't auto-dismiss
      action: {
        label: 'Refresh',
        onClick: () => window.location.reload(),
      },
    });
    return;
  }

  if (context === 'authentication') {
    toast.error('Authentication failed. Please log in again.');
    return;
  }

  if (context === 'api') {
    toast.error('Server error. Please try again later.');
    return;
  }

  // Generic error message
  toast.error('Something went wrong. Please try again.');
}

export class ErrorBoundary {
  private container: HTMLElement;
  private originalContent: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public initialize(): void {
    // Store original content for recovery
    this.originalContent = this.container.innerHTML;
  }

  public handleError(error: Error): void {
    console.error('Error boundary caught error:', error);
    
    // Handle the error
    handleError(error, 'component');
    
    // Show error UI
    this.showErrorUI(error);
  }

  private showErrorUI(error: Error): void {
    const errorContainer = document.createElement('div');
    errorContainer.className = 'min-h-screen flex items-center justify-center bg-gray-50 px-4';
    errorContainer.innerHTML = `
      <div class="max-w-md w-full text-center">
        <div class="text-red-600 mb-4">
          <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.84L13.732 4.86c-.77-1.175-2.694-1.175-3.464 0L3.34 16.16c-.77 1.173.192 2.84 1.732 2.84z"></path>
          </svg>
        </div>
        
        <h1 class="text-xl font-semibold text-gray-900 mb-2">
          Something went wrong
        </h1>
        
        <p class="text-gray-600 mb-6">
          We're sorry! An unexpected error occurred. Our team has been notified and is working on a fix.
        </p>
        
        <div class="space-y-3">
          <button 
            id="retry-button"
            class="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            Try Again
          </button>
          
          <button 
            id="refresh-button"
            class="w-full bg-gray-200 text-gray-900 px-4 py-2 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
          >
            Refresh Page
          </button>
        </div>
        
        ${import.meta.env.MODE === 'development' ? `
          <details class="mt-6 text-left">
            <summary class="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
              Error Details (Development)
            </summary>
            <pre class="mt-2 p-3 bg-gray-100 rounded text-xs text-gray-800 overflow-auto max-h-40">
${error.stack || error.message}
            </pre>
          </details>
        ` : ''}
      </div>
    `;

    // Replace container content
    this.container.innerHTML = '';
    this.container.appendChild(errorContainer);

    // Setup event listeners
    const retryButton = errorContainer.querySelector('#retry-button') as HTMLButtonElement;
    const refreshButton = errorContainer.querySelector('#refresh-button') as HTMLButtonElement;

    retryButton.addEventListener('click', () => {
      this.recover();
    });

    refreshButton.addEventListener('click', () => {
      window.location.reload();
    });
  }

  public recover(): void {
    if (this.originalContent) {
      this.container.innerHTML = this.originalContent;
      toast.info('Application recovered. Please try your action again.');
    } else {
      window.location.reload();
    }
  }

  public destroy(): void {
    // Cleanup if needed
  }
}